import { NextRequest } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import { ok, err, serverError } from '@/lib/api'
import { calculateInterestAccrualBatch, type AccrualLoanInput } from '@/lib/interest-accrual'

// Piece 2 (2026-09-14): real preview -- every active loan's calculated
// accrual as of a given date, NOT yet persisted anywhere. Nothing is
// written to the database by this route; it exists purely so Devotha can
// review the real, calculated figures (and exclude/override any one)
// before anything is actually posted, the same real review-then-confirm
// pattern already proven by Split Expense's own live preview.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(req.url)
    const asOfParam = searchParams.get('as_of')
    const asOfDate = asOfParam ? new Date(asOfParam) : new Date()
    if (Number.isNaN(asOfDate.getTime())) return err('Invalid as_of date')

    const supabase = createAdminClient()
    const { data: loans, error } = await supabase
      .from('iacm_loans')
      .select('id, loan_number, client_id, disbursed_amount, disbursement_date, last_payment_date, balance_outstanding, interest_rate, interest_method, status, iacm_clients(full_name)')
      .eq('status', 'active')
    if (error) return serverError(error)

    const inputs: AccrualLoanInput[] = (loans ?? []).map((l: any) => ({
      id: l.id,
      loanNumber: l.loan_number,
      clientName: l.iacm_clients?.full_name ?? '(unknown client)',
      disbursedAmount: Number(l.disbursed_amount ?? 0),
      disbursementDate: l.disbursement_date,
      lastPaymentDate: l.last_payment_date,
      balanceOutstanding: Number(l.balance_outstanding ?? 0),
      interestRate: Number(l.interest_rate ?? 0),
      interestMethod: l.interest_method === 'declining' ? 'declining' : 'flat',
      status: l.status,
    }))

    const results = calculateInterestAccrualBatch(inputs, asOfDate)
    return ok({ as_of: asOfDate.toISOString().slice(0, 10), accruals: results })
  } catch (e) { return serverError(e) }
}
