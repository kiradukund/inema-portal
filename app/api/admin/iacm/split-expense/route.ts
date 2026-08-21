import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'

// Real gap found 2026-08-21: a rent payment covering one already-elapsed
// month and one paid in advance (Kevin's real historical structure: Debit
// Prepaid Expenses for the future portion, Debit Office Rent for the
// current portion, Debit VAT Control, Credit Bank) could not be entered
// correctly through either existing feature. Record Expense is a strict
// one-category-to-one-account map (2 lines only, no split). The manual
// "New Journal Entry" feature deliberately excludes every 6xxx/7xxx
// account (see lib/ledger.ts's CHART_OF_ACCOUNTS comment) so Net Profit's
// expense side only ever comes from iacm_expenses, never raw journal
// lines -- so it can't post the Office Rent line either. This feature
// bridges both: a real iacm_expenses row for ONLY the current-period
// portion (so Net Profit correctly reflects just the real recognized
// expense, not the prepaid or VAT amounts), plus a direct 4-line journal
// entry for the real full split. `reference: expense-<id>` reuses the
// same prefix Record Expense uses, so this integrates for free with the
// Reverse Transaction feature and the Journal page -- no changes needed
// there. Named generally ("split expense") rather than "rent" specifically
// since the same prepaid/current/VAT shape applies to any prepaid cost,
// not just rent -- callers choose the category.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { expense_date, current_period_amount, prepaid_amount, vat_amount, payment_method, notes } = await req.json()

    if (!expense_date) return err('Missing required fields')
    const currentAmt = Number(current_period_amount) || 0
    const prepaidAmt = Number(prepaid_amount) || 0
    const vatAmt = Number(vat_amount) || 0
    if (currentAmt <= 0) return err('Current-period amount must be greater than 0 -- this is the real recognized expense this feature exists to record correctly')
    if (prepaidAmt < 0 || vatAmt < 0) return err('Amounts cannot be negative')
    const total = currentAmt + prepaidAmt + vatAmt

    const supabase = createAdminClient()

    // 1. Real expense row for ONLY the current-period portion -- this is
    // what Net Profit actually reads (app/admin/page.tsx and
    // app/admin/income/page.tsx both sum iacm_expenses.amount directly).
    // The prepaid and VAT portions deliberately never touch this table --
    // they're real cash out, but not a real expense yet (prepaid) or never
    // an expense at all (VAT, a liability). Always created (currentAmt is
    // required above) so `reference` below always points at a real row --
    // keeps this fully compatible with the Reverse Transaction feature's
    // 'expense' handler, which expects one.
    const { data: expenseRow, error: expErr } = await supabase.from('iacm_expenses').insert({
      expense_date, category: 'rent', description: notes || 'Split rent payment (current period)',
      amount: currentAmt, payment_method: payment_method ?? 'bank_transfer',
    }).select().single()
    if (expErr) return serverError(expErr)
    const expenseId = expenseRow.id

    // 2. The real 4-line split, matching Kevin's actual historical
    // structure exactly.
    const cashAccount = payment_method === 'cash'
      ? { code: '3010', name: 'Cash on Hand' }
      : { code: '3020', name: 'Bank Accounts' }
    const lines: JournalLineInput[] = []
    if (prepaidAmt > 0) lines.push({ account_code: '3050', account_name: 'Prepaid Expenses', debit: prepaidAmt })
    if (currentAmt > 0) lines.push({ account_code: '6210', account_name: 'Office Rent', debit: currentAmt })
    if (vatAmt > 0) lines.push({ account_code: '2530', account_name: 'VAT Control Account', debit: vatAmt })
    lines.push({ account_code: cashAccount.code, account_name: cashAccount.name, credit: total })

    const reference = `expense-${expenseId}`
    const narration = `Split expense${notes ? ` — ${notes}` : ''}`

    const { error: journalErr } = await postJournalEntry(supabase, {
      entry_date: expense_date, narration, reference, entry_type: 'expense',
      created_by: auth.profile.full_name, lines,
    })
    if (journalErr) return serverError(journalErr)

    return ok({ reference, expense_id: expenseId }, 201)
  } catch (e) { return serverError(e) }
}
