import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { loan_id, total_amount, payment_date, payment_method, notes } = await req.json()
    if (!loan_id || !total_amount || !payment_date) return err('Missing required fields')

    const supabase = createAdminClient()

    // Get loan details
    const { data: loan, error: loanErr } = await supabase
      .from('iacm_loans').select('*').eq('id', loan_id).single()
    if (loanErr || !loan) return err('Loan not found', 404)

    const outstanding = Number(loan.balance_outstanding)
    const disbursed = Number(loan.disbursed_amount)
    const paid = Math.min(total_amount, outstanding) // Can't overpay

    // Payment allocation: interest first, then principal
    const monthlyInterest = disbursed * 0.05
    const interestPortion = Math.min(paid, monthlyInterest)
    const principalPortion = Math.max(0, paid - interestPortion)
    const newBalance = Math.max(0, outstanding - principalPortion)
    const newPrincipalRepaid = Number(loan.principal_repaid ?? 0) + principalPortion

    // 1. Record the payment
    const { error: payErr } = await supabase.from('iacm_payments').insert({
      loan_id, payment_date, total_amount: paid,
      interest_portion: interestPortion, principal_portion: principalPortion,
      fee_portion: 0, payment_method, notes,
    })
    if (payErr) return serverError(payErr)

    // 2. Update loan outstanding balance
    const newStatus = newBalance <= 0 ? 'completed' : 'active'
    const { error: updateErr } = await supabase.from('iacm_loans').update({
      balance_outstanding: newBalance,
      principal_repaid: newPrincipalRepaid,
      last_payment_date: payment_date,
      status: newStatus,
      installments_paid: (loan.installments_paid ?? 0) + 1,
      installments_outstanding: Math.max(0, (loan.installments_outstanding ?? 1) - 1),
      updated_at: new Date().toISOString(),
    }).eq('id', loan_id)
    if (updateErr) return serverError(updateErr)

    return ok({
      message: `Payment recorded. Interest: RWF ${interestPortion.toLocaleString()}, Principal: RWF ${principalPortion.toLocaleString()}, New balance: RWF ${newBalance.toLocaleString()}`,
      new_balance: newBalance, status: newStatus,
    })
  } catch (e) { return serverError(e) }
}
