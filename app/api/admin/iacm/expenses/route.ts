import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'

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
    // itself is already recorded above. iacm_journal_entries is a flat
    // table (each row is one debit/credit line); these two rows share
    // `reference` to form one balanced transaction — keyed by this expense's
    // own id, not by category, so two "rent" expenses don't collide into one
    // indistinguishable transaction. Account codes/names match Devotha's
    // real chart of accounts.
    try {
      const EXPENSE_ACCOUNTS: Record<string, { code: string; name: string }> = {
        personnel:     { code: '6100', name: 'Personnel Expenses' },
        rent:          { code: '6210', name: 'Rent & Utilities' },
        bank_charges:  { code: '6280', name: 'Bank Charges & Commissions' },
        communication: { code: '6220', name: 'Communication & Internet' },
        stationery:    { code: '6230', name: 'Office Stationery & Supplies' },
        transport:     { code: '6240', name: 'Transport & Travel' },
        advertising:   { code: '6250', name: 'Advertising & Marketing' },
        legal:         { code: '6260', name: 'Legal & Professional Fees' },
        maintenance:   { code: '6270', name: 'Maintenance & Repairs' },
        petty_cash:    { code: '6290', name: 'Petty Cash / Miscellaneous' },
        tax:           { code: '6300', name: 'Tax Payments (PAYE, RSSB, CBHI)' },
        other:         { code: '6900', name: 'Other Operating Expenses' },
      }
      const amountNum = Number(amount)
      const reference = `expense-${data.id}`
      let lines: { entry_date: string; account_code: string; account_name: string; debit: number; credit: number; description: string; reference: string }[]

      if (category === 'depreciation') {
        // Non-cash adjusting entry — reduces the carrying value of fixed
        // assets, never touches cash/bank.
        lines = [
          { entry_date: expense_date, account_code: '6310', account_name: 'Depreciation Expense', debit: amountNum, credit: 0, description, reference },
          { entry_date: expense_date, account_code: '3220', account_name: 'Accumulated Depreciation', debit: 0, credit: amountNum, description, reference },
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
          { entry_date: expense_date, account_code: expenseAccount.code, account_name: expenseAccount.name, debit: amountNum, credit: 0, description, reference },
          { entry_date: expense_date, account_code: cashAccount.code, account_name: cashAccount.name, debit: 0, credit: amountNum, description, reference },
        ]
      }
      const { error: journalErr } = await supabase.from('iacm_journal_entries').insert(lines)
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
