import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
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
    // `reference` to form one balanced transaction. Account codes/names
    // match Devotha's real chart of accounts.
    try {
      const EXPENSE_ACCOUNTS: Record<string, { code: string; name: string }> = {
        personnel:     { code: '6100', name: 'Personnel Expenses' },
        bank_charges:  { code: '6280', name: 'Bank Charges' },
        rent:          { code: '6200', name: 'Rent & Other Operating Expenses' },
      }
      const expenseAccount = EXPENSE_ACCOUNTS[category] ?? { code: '6200', name: 'Rent & Other Operating Expenses' }
      const amountNum = Number(amount)
      const lines = [
        { entry_date: expense_date, account_code: expenseAccount.code, account_name: expenseAccount.name, debit: amountNum, credit: 0, description, reference: category },
        { entry_date: expense_date, account_code: '3020', account_name: 'Bank Accounts', debit: 0, credit: amountNum, description, reference: category },
      ]
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
    await requireAdmin()
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('iacm_expenses')
      .select('*')
      .order('expense_date', { ascending: false })
    if (error) return serverError(error)
    return ok(data)
  } catch (e) { return serverError(e) }
}
