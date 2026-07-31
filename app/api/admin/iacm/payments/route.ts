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
      .from('iacm_loans').select('*, iacm_clients(full_name)').eq('id', loan_id).single()
    if (loanErr || !loan) return err('Loan not found', 404)

    const outstanding = Number(loan.balance_outstanding)
    const disbursed = Number(loan.disbursed_amount)
    const paid = Math.min(total_amount, outstanding) // Can't overpay

    // Payment allocation: interest first, then principal
    const monthlyInterest = disbursed * 0.05
    const interestPortion = Math.min(paid, monthlyInterest)
    const principalPortion = Math.max(0, paid - interestPortion)
    const feePortion = 0 // not currently charged on manual IACM payments
    const newBalance = Math.max(0, outstanding - principalPortion)
    const newPrincipalRepaid = Number(loan.principal_repaid ?? 0) + principalPortion

    // 1. Record the payment
    const { data: paymentRow, error: payErr } = await supabase.from('iacm_payments').insert({
      loan_id, payment_date, total_amount: paid,
      interest_portion: interestPortion, principal_portion: principalPortion,
      fee_portion: feePortion, payment_method, notes,
    }).select().single()
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

    // 3. Auto-post the journal entry for this payment. Non-fatal: the
    // payment itself is already recorded above, so a journal-side failure
    // shouldn't undo it — Devotha can always enter it manually if this
    // silently fails, and the error is logged either way.
    //
    // iacm_journal_entries is a flat table (each row is one debit/credit
    // line, not a header+lines pair) — multiple rows sharing `reference`
    // form one balanced transaction, keyed by this payment's own id so
    // separate installments on the same loan don't collide into one
    // indistinguishable transaction.
    //
    // Only the interest/fee portion is posted here — principal is
    // deliberately left out. iacm_loans.balance_outstanding is already the
    // source of truth for outstanding loan principal (see bnr-report.ts's
    // own exclusion of 3110 from its asset sum for the same reason); crediting
    // 3110 here too, with nothing ever debiting it on disbursement, would
    // make its ledger balance drift ever-downward and double-count the same
    // loans two different ways.
    try {
      const clientName = (loan as any).iacm_clients?.full_name ?? loan.loan_number
      const narration = `Loan repayment — ${clientName}`
      const reference = `payment-${paymentRow.id}`
      const incomeAmount = interestPortion + feePortion
      if (incomeAmount > 0) {
        // Route to Cash on Hand or Bank Accounts based on how it was
        // actually collected — previously this always hit Bank Accounts
        // even for cash payments, corrupting the Cash-vs-Bank split.
        const cashAccount = payment_method === 'cash'
          ? { code: '3010', name: 'Cash on Hand' }
          : { code: '3020', name: 'Bank Accounts' }
        const lines = [
          { entry_date: payment_date, account_code: cashAccount.code, account_name: cashAccount.name, debit: incomeAmount, credit: 0, description: narration, reference },
        ]
        if (interestPortion > 0) {
          lines.push({ entry_date: payment_date, account_code: '7010', account_name: 'Interest Income on Loans', debit: 0, credit: interestPortion, description: narration, reference })
        }
        if (feePortion > 0) {
          lines.push({ entry_date: payment_date, account_code: '7020', account_name: 'Fees & Commission Income', debit: 0, credit: feePortion, description: narration, reference })
        }
        const { error: journalErr } = await supabase.from('iacm_journal_entries').insert(lines)
        if (journalErr) console.error('Journal auto-entry failed (non-fatal):', journalErr)
      }
    } catch (journalErr) {
      console.error('Journal auto-entry failed (non-fatal):', journalErr)
    }

    return ok({
      message: `Payment recorded. Interest: RWF ${interestPortion.toLocaleString()}, Principal: RWF ${principalPortion.toLocaleString()}, New balance: RWF ${newBalance.toLocaleString()}`,
      new_balance: newBalance, status: newStatus,
    })
  } catch (e) { return serverError(e) }
}
