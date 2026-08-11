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
      // Codes verified against the real historical journal (Devotha's actual
      // bookkeeping): only 6110/6210/6280/6300 have ever actually been used.
      // 'tax' maps to 2640 (a liability account) because every real
      // Corporate Income Tax entry in the source file debits 2640, not a
      // 6xxx expense code — it's a payable being settled, not a P&L expense.
      // PAYE/Pension/Maternity/CBHI are NOT part of 'tax' — those already
      // have their own dedicated codes (2540/2550/2560/2570), settled
      // alongside salary, never through this generic category.
      // communication/stationery/transport/advertising/legal/maintenance/
      // petty_cash have no precedent anywhere in the real file — kept as
      // distinct codes since there's nothing historical to match them to.
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
