import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'
import { MONTHLY_INTEREST_RATE, UPFRONT_FEE_RATE, VAT_RATE, monthsElapsed } from '@/lib/calculator'

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
    // last REAL payment, or since disbursement if none exist -- not just
    // one month flat), then the fee+VAT receivable set up at disbursement
    // gets cleared once the loan is fully paid off, then whatever's left
    // reduces principal.
    //
    // The reference date comes from iacm_payments directly, NOT
    // iacm_loans.last_payment_date -- confirmed real incident (HABINEZA
    // Jean Marie, INEMA-2026-0002, see docs/known-gaps.md): a bulk SQL
    // loan reload populated last_payment_date on every loan as a synthetic
    // placeholder (matching maturity_date) even for loans with zero real
    // payments ever recorded. Trusting that field silently truncated a
    // real 6-month catch-up payment to 1 month of interest and discarded
    // 500,000 RWF of real cash under the "can't overpay" cap below. This
    // loan's own iacm_payments history is the only trustworthy source.
    const { data: priorPayments, error: priorPaymentsErr } = await supabase
      .from('iacm_payments')
      .select('payment_date, fee_portion')
      .eq('loan_id', loan_id)
      .order('payment_date', { ascending: false })
    if (priorPaymentsErr) return serverError(priorPaymentsErr)
    const lastActivityDate = priorPayments && priorPayments.length > 0
      ? new Date(priorPayments[0].payment_date)
      : new Date(loan.disbursement_date)
    const months = Number.isFinite(Number(interest_months)) && Number(interest_months) > 0
      ? Number(interest_months)
      : monthsElapsed(lastActivityDate, new Date(payment_date))
    const monthlyInterest = disbursed * MONTHLY_INTEREST_RATE
    const interestOwed = monthlyInterest * months
    const feeAndVatOwed = disbursed * UPFRONT_FEE_RATE * (1 + VAT_RATE)

    // Real bug found 2026-08-18 (NZUNGIZE Emmanuel, INEMA-2026-0010): this
    // used to assume the full original fee+VAT was always still owed on any
    // payoff, even when an earlier REAL payment on this loan had already
    // cleared it (his first payment, 2026-03-13, fee_portion=94,400 -- no
    // receivable left). That produced a phantom "still owing" fee, blocked
    // the loan from actually closing on a payment that genuinely covered
    // the real balance in full, and would have posted a duplicate
    // fee-clearing journal credit against an AR balance already at zero in
    // the real ledger. Net against this loan's own cumulative fee_portion
    // already paid -- zero for a genuine first-ever payoff (Habineza's
    // case, unaffected by this change), the real remainder otherwise.
    const feeAlreadyCleared = (priorPayments ?? []).reduce((s, p: any) => s + Number(p.fee_portion ?? 0), 0)
    const feeRemaining = Math.max(0, feeAndVatOwed - feeAlreadyCleared)

    // "Can't overpay" needs to cap against everything that can actually be
    // owed on a full payoff (principal + accrued interest + any unpaid
    // fee/VAT) -- capping against `outstanding` (principal-only) alone
    // silently discarded the interest/fee portion of a real payoff payment,
    // exactly the kind of transaction the BIZIMANA/STELLA examples are.
    const maxOwed = outstanding + interestOwed + feeRemaining
    const paid = Math.min(total_amount, maxOwed)

    const interestPortion = Math.min(paid, interestOwed)
    const remainderAfterInterest = paid - interestPortion

    const isPayoff = outstanding - remainderAfterInterest <= 0
    const feePortion = isPayoff ? Math.min(remainderAfterInterest, feeRemaining) : 0
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

// Used by the Record Payment form's live preview to compute the real
// months-elapsed/interest figure before submission, from the same source
// (this loan's actual iacm_payments history) the POST handler above now
// uses — see its comment on lastActivityDate for why iacm_loans.last_payment_date
// is never trusted for this.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { searchParams } = new URL(req.url)
    const loanId = searchParams.get('loan_id')
    const supabase = createAdminClient()
    let query = supabase.from('iacm_payments').select('*').order('payment_date', { ascending: false })
    if (loanId) query = query.eq('loan_id', loanId)
    const { data, error } = await query
    if (error) return serverError(error)
    return ok(data)
  } catch (e) { return serverError(e) }
}
