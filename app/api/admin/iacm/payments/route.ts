import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'
import { MONTHLY_INTEREST_RATE, UPFRONT_FEE_RATE, VAT_RATE } from '@/lib/calculator'

// Full calendar months between two dates, floored (e.g. 22-Jan to 23-Mar =
// 2, 09-Mar to 02-Jun = 2 -- day-of-month precision, not a rough diff).
// Confirmed against 3 real historical catch-up repayments (BIZIMANA Andre,
// ARMAND, STELLA) -- matches cleanly for loans with a clean payment
// history. Real bookkeeping sometimes charges more months than a pure
// date formula implies (irregular history, informal earlier payments not
// in the system) -- interest_months in the request body overrides this
// when the admin knows better, same judgment call Devotha's own
// "Interest Calculations" sheet documents by hand for each case.
function monthsElapsed(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return Math.max(1, months)
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { loan_id, total_amount, payment_date, payment_method, notes, interest_months } = await req.json()
    if (!loan_id || !total_amount || !payment_date) return err('Missing required fields')

    const supabase = createAdminClient()

    // Get loan details
    const { data: loan, error: loanErr } = await supabase
      .from('iacm_loans').select('*, iacm_clients(full_name)').eq('id', loan_id).single()
    if (loanErr || !loan) return err('Loan not found', 404)

    const outstanding = Number(loan.balance_outstanding)
    const disbursed = Number(loan.disbursed_amount)

    // Payment allocation: interest first (for every elapsed month since the
    // last payment, or since disbursement for the first payment -- not
    // just one month flat), then the fee+VAT receivable set up at
    // disbursement gets cleared once the loan is fully paid off, then
    // whatever's left reduces principal. Confirmed against real historical
    // catch-up repayments -- see monthsElapsed()'s doc comment for the
    // specific examples this matches.
    const lastActivityDate = loan.last_payment_date
      ? new Date(loan.last_payment_date)
      : new Date(loan.disbursement_date)
    const months = Number.isFinite(Number(interest_months)) && Number(interest_months) > 0
      ? Number(interest_months)
      : monthsElapsed(lastActivityDate, new Date(payment_date))
    const monthlyInterest = disbursed * MONTHLY_INTEREST_RATE
    const interestOwed = monthlyInterest * months
    const feeAndVatOwed = disbursed * UPFRONT_FEE_RATE * (1 + VAT_RATE)

    // "Can't overpay" needs to cap against everything that can actually be
    // owed on a full payoff (principal + accrued interest + any unpaid
    // fee/VAT) -- capping against `outstanding` (principal-only) alone
    // silently discarded the interest/fee portion of a real payoff payment,
    // exactly the kind of transaction the BIZIMANA/STELLA examples are.
    const maxOwed = outstanding + interestOwed + feeAndVatOwed
    const paid = Math.min(total_amount, maxOwed)

    const interestPortion = Math.min(paid, interestOwed)
    const remainderAfterInterest = paid - interestPortion

    const isPayoff = outstanding - remainderAfterInterest <= 0
    const feePortion = isPayoff ? Math.min(remainderAfterInterest, feeAndVatOwed) : 0
    const principalPortion = Math.min(outstanding, Math.max(0, remainderAfterInterest - feePortion))

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
    // iacm_journal_entries (header) + iacm_journal_lines (the actual
    // debit/credit rows) — see postJournalEntry in lib/ledger.ts. Keyed by
    // this payment's own id so separate installments on the same loan
    // don't collide into one indistinguishable transaction.
    //
    // Cash/Bank is debited for the FULL amount received, not just interest+
    // fee — real cash equal to the whole payment (principal included)
    // actually lands in the bank. The principal portion is balanced by a
    // credit to 3110 (Loan Issued), mirroring disbursement's debit to the
    // same account. This does NOT reopen the double-counting issue the
    // earlier fix was guarding against: 3110 stays excluded from every
    // Total Assets sum in the app (iacm_loans.balance_outstanding remains
    // the source of truth for outstanding principal), so crediting it here
    // only affects 3110's own memo balance, not Total Assets. Without this,
    // Cash/Bank would only ever increase by interest/fees while the
    // outstanding-balance side (tracked externally via iacm_loans) drops by
    // the full principal — understating Total Assets by the principal
    // amount on every single repayment.
    try {
      const clientName = (loan as any).iacm_clients?.full_name ?? loan.loan_number
      const narration = `Loan repayment — ${clientName}`
      const reference = `payment-${paymentRow.id}`
      if (paid > 0) {
        // Route to Cash on Hand or Bank Accounts based on how it was
        // actually collected — previously this always hit Bank Accounts
        // even for cash payments, corrupting the Cash-vs-Bank split.
        const cashAccount = payment_method === 'cash'
          ? { code: '3010', name: 'Cash on Hand' }
          : { code: '3020', name: 'Bank Accounts' }
        const lines: JournalLineInput[] = [
          { account_code: cashAccount.code, account_name: cashAccount.name, debit: paid },
        ]
        if (principalPortion > 0) {
          lines.push({ account_code: '3110', account_name: 'Loan Issued', credit: principalPortion })
        }
        if (interestPortion > 0) {
          lines.push({ account_code: '7010', account_name: 'Interest Income on Loans', credit: interestPortion })
        }
        if (feePortion > 0) {
          // Clears the receivable set up at disbursement (Piece 1: fee + VAT
          // are booked as revenue immediately when the loan is issued, into
          // 3030). This repayment is just cash arriving for an already-
          // recognized fee, not new income -- crediting 7020 again here
          // would double-count it. Matches the real historical pattern
          // exactly (e.g. Nzungize's actual repayment credits AR, not Fee
          // Income a second time).
          lines.push({ account_code: '3030', account_name: 'Accounts Receivable — Interest and Fees', credit: feePortion })
        }
        const { error: journalErr } = await postJournalEntry(supabase, {
          entry_date: payment_date, narration, reference, entry_type: 'payment',
          created_by: auth.profile.full_name, lines,
        })
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
