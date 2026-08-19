import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const body = await req.json()
    const { expense_date, category, description, amount, payment_method } = body
    if (!expense_date || !category || !description || !amount) return err('Missing required fields')

    const supabase = createAdminClient()
    const { data, error } = await supabase.from('iacm_expenses').insert({
      expense_date, category, description,
      amount: Number(amount), payment_method: payment_method ?? 'bank_transfer',
    }).select().single()

    if (error) return serverError(error)

    // Auto-post the journal entry for this expense. Non-fatal — the expense
    // itself is already recorded above. iacm_journal_entries (header) +
    // iacm_journal_lines (the actual debit/credit rows) — see
    // postJournalEntry in lib/ledger.ts. Keyed by this expense's own id, not
    // by category, so two "rent" expenses don't collide into one
    // indistinguishable transaction. Account codes/names match Devotha's
    // real chart of accounts.
    try {
      // Codes cross-checked against the real "Accounts" reference sheet in
      // Kevin's actual journal file (INEMA_Journal_Q3_2026.xlsx), not just
      // which codes happened to appear in journal rows — that's the gap
      // that let this go wrong the first time. Real evidence found
      // 2026-08-19: the prior comment here CLAIMED PAYE/Pension/Maternity/
      // CBHI "already have their own dedicated codes... settled alongside
      // salary" but no such code path ever existed — every one of those
      // would have silently fallen into the generic 'tax' bucket (2640) had
      // this category ever been used for them. The real historical journal
      // itself posted all four correctly to 2540/2550/2560/2570 every
      // single month from Dec 2025 through Jun 2026 (one real exception:
      // two June entries misfiled to 2640 on 2026-07-08 — a manual
      // bookkeeping slip, not a pattern). 'tax' now specifically means
      // Corporate Income Tax (2640), matching the one real historical use
      // of that code with that meaning (narration "Corporate Income tax").
      // 'wht' (2590, Withholding Tax) had no category at all before and no
      // real historical precedent either way — added as its own real,
      // distinct account per the authoritative chart, not folded into 'tax'.
      // communication/stationery/transport/advertising/legal/maintenance/
      // petty_cash are UNCHANGED and still a known, separate, documented
      // gap (several map to real account codes that mean something else
      // entirely per the Accounts sheet) — out of scope for this fix, see
      // docs/known-gaps.md.
      const EXPENSE_ACCOUNTS: Record<string, { code: string; name: string }> = {
        personnel:     { code: '6110', name: 'Salaries & Wages' },
        rent:          { code: '6210', name: 'Rent & Utilities' },
        bank_charges:  { code: '6280', name: 'Bank Charges & Commissions' },
        communication: { code: '6220', name: 'Communication & Internet' },
        stationery:    { code: '6230', name: 'Office Stationery & Supplies' },
        transport:     { code: '6240', name: 'Transport & Travel' },
        advertising:   { code: '6250', name: 'Advertising & Marketing' },
        legal:         { code: '6260', name: 'Legal & Professional Fees' },
        maintenance:   { code: '6270', name: 'Maintenance & Repairs' },
        petty_cash:    { code: '6290', name: 'Petty Cash / Miscellaneous' },
        paye:          { code: '2540', name: 'PAYE Payables' },
        cbhi:          { code: '2570', name: 'CBHI Payables' },
        pension:       { code: '2560', name: 'Pension and Risk Contribution Payables' },
        maternity:     { code: '2550', name: 'Maternity Contribution Payables' },
        wht:           { code: '2590', name: 'Withholding Tax (WHT) Payables' },
        tax:           { code: '2640', name: 'Tax Payable' },
        other:         { code: '6300', name: 'Miscellaneous Expenses' },
      }
      const amountNum = Number(amount)
      const reference = `expense-${data.id}`
      let lines: JournalLineInput[]

      if (category === 'depreciation') {
        // Non-cash adjusting entry — reduces the carrying value of fixed
        // assets, never touches cash/bank.
        lines = [
          { account_code: '6310', account_name: 'Depreciation Expense', debit: amountNum },
          { account_code: '3220', account_name: 'Accumulated Depreciation', credit: amountNum },
        ]
      } else {
        const expenseAccount = EXPENSE_ACCOUNTS[category] ?? EXPENSE_ACCOUNTS.other
        // Route to Cash on Hand or Bank Accounts based on how it was actually
        // paid — previously this always hit Bank Accounts even for cash
        // expenses, silently corrupting the Cash-vs-Bank split over time.
        const cashAccount = payment_method === 'cash'
          ? { code: '3010', name: 'Cash on Hand' }
          : { code: '3020', name: 'Bank Accounts' }
        lines = [
          { account_code: expenseAccount.code, account_name: expenseAccount.name, debit: amountNum },
          { account_code: cashAccount.code, account_name: cashAccount.name, credit: amountNum },
        ]
      }
      const { error: journalErr } = await postJournalEntry(supabase, {
        entry_date: expense_date, narration: description, reference, entry_type: 'expense',
        created_by: auth.profile.full_name, lines,
      })
      if (journalErr) console.error('Journal auto-entry failed (non-fatal):', journalErr)
    } catch (journalErr) {
      console.error('Journal auto-entry failed (non-fatal):', journalErr)
    }

    return ok({ expense: data }, 201)
  } catch (e) { return serverError(e) }
}

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('iacm_expenses')
      .select('*')
      .order('expense_date', { ascending: false })
    if (error) return serverError(error)
    return ok(data)
  } catch (e) { return serverError(e) }
}
