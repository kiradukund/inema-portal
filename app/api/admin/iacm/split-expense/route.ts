import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'
import { monthOffset, joinMonthLabels } from '@/lib/calculator'

// Real gap found 2026-08-21 (follow-up to the split fix below): every line
// used a generic account name ("Prepaid Expenses", "Office Rent", "VAT
// Control Account") with no month-specific narration -- Kevin had to type
// which months were covered by hand, and it didn't scale past 2 months.
// Derives the real month names directly from expense_date + months_covered
// (quick/rent mode) instead: current-period line always names just the one
// current month; the prepaid line lists every remaining covered month;
// the VAT and cash/bank lines both describe the full span. Manual mode has
// no months_covered input, so it falls back to non-month-specific language
// for the prepaid/VAT/cash lines (the current-period line can still name
// its one real month either way, since that only needs expense_date).
// Mirrored in app/admin/iacm/split-expense/new/page.tsx's live preview so
// it never shows different text than what actually gets recorded.
function buildRentNarrations(expenseDate: string, monthsCovered: number | null) {
  const current = monthOffset(expenseDate, 0)
  const currentLine = `Rent expense for ${current.name} ${current.year}`
  if (monthsCovered && monthsCovered >= 1) {
    const prepaidMonths = []
    for (let i = 1; i < monthsCovered; i++) prepaidMonths.push(monthOffset(expenseDate, i))
    const allMonths = [current, ...prepaidMonths]
    return {
      currentLine,
      prepaidLine: prepaidMonths.length > 0 ? `Prepaid rent for ${joinMonthLabels(prepaidMonths)}` : null,
      vatBankLine: `Recognition of rent payment made for ${joinMonthLabels(allMonths)}`,
    }
  }
  return {
    currentLine,
    prepaidLine: 'Prepaid rent for this expense',
    vatBankLine: 'Recognition of rent payment made for this expense',
  }
}

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
//
// Single-tenant assumption, documented not fixed: like every other IACM
// route, this reads/writes iacm_expenses/iacm_journal_entries/
// iacm_journal_lines with no tenant scoping -- there's no tenant concept
// anywhere in this schema. See docs/tenant-isolation-inventory.md (the
// full analysis) and docs/saas-readiness-notes.md (this feature's entry).
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { expense_date, current_period_amount, prepaid_amount, vat_amount, payment_method, notes, months_covered } = await req.json()

    if (!expense_date) return err('Missing required fields')
    const currentAmt = Number(current_period_amount) || 0
    const prepaidAmt = Number(prepaid_amount) || 0
    const vatAmt = Number(vat_amount) || 0
    if (currentAmt <= 0) return err('Current-period amount must be greater than 0 -- this is the real recognized expense this feature exists to record correctly')
    if (prepaidAmt < 0 || vatAmt < 0) return err('Amounts cannot be negative')
    const total = currentAmt + prepaidAmt + vatAmt
    const narrations = buildRentNarrations(expense_date, months_covered ? Number(months_covered) : null)

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
      expense_date, category: 'rent', description: notes || narrations.currentLine,
      amount: currentAmt, payment_method: payment_method ?? 'bank_transfer',
    }).select().single()
    if (expErr) return serverError(expErr)
    const expenseId = expenseRow.id

    // 2. The real 4-line split, matching Kevin's actual historical
    // structure exactly. account_name carries the specific, auto-derived
    // narration for each line (replacing the generic account label) --
    // account_code is still the real ledger account either way.
    const cashAccount = payment_method === 'cash'
      ? { code: '3010', name: 'Cash on Hand' }
      : { code: '3020', name: 'Bank Accounts' }
    const lines: JournalLineInput[] = []
    if (prepaidAmt > 0) lines.push({ account_code: '3050', account_name: narrations.prepaidLine ?? 'Prepaid Expenses', debit: prepaidAmt })
    if (currentAmt > 0) lines.push({ account_code: '6210', account_name: narrations.currentLine, debit: currentAmt })
    if (vatAmt > 0) lines.push({ account_code: '2530', account_name: narrations.vatBankLine, debit: vatAmt })
    lines.push({ account_code: cashAccount.code, account_name: narrations.vatBankLine, credit: total })

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
