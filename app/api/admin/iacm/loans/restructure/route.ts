import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'
import { UPFRONT_FEE_RATE, VAT_RATE } from '@/lib/calculator'

// Loan Restructuring / Rollover (2026-08-21): a defaulted loan's real
// remaining unpaid balance gets converted into a fresh new loan contract,
// with NO real cash movement -- no new money is actually disbursed, the
// same underlying debt just moves from one loan record to another.
//
// Confirmed with Kevin before building: a restructured contract DOES
// charge a fresh 4%+VAT disbursement fee on the new principal, same as
// any normal new loan -- this is a real cost to the client for the new
// contract, genuinely increasing Net Profit/Total Assets by the fee+VAT
// amount even though no principal cash moved.
//
// The real 2-line loan transfer: Cr 3110 (old loan, its receivable
// removed) / Dr 3110 (new loan, its receivable created), for the exact
// same amount -- since 3110 is one shared GL account, not per-loan, these
// net to zero on the account balance, correctly reflecting that no real
// cash moved. The actual substance of the change lives in
// iacm_loans.balance_outstanding on each record, not the journal. The fee
// lines (Dr 3030 / Cr 7020 / Cr 2530) are the ONLY real net effect on any
// account balance, exactly mirroring a normal disbursement's fee
// treatment (booked as an immediate receivable, not cash).
//
// New loan links back via restructured_from_loan_id so the history is
// traceable -- a real, new column, confirmed live 2026-08-21 (no CHECK
// constraint on iacm_loans.status blocked 'restructured' either, despite
// supabase.sql's stale tracked DDL suggesting otherwise -- verified
// directly against the real live table before assuming).
//
// entry_type 'loan_restructuring' is reversible via the Reverse
// Transaction feature -- see lib/ledger.ts's REVERSAL_HANDLERS and the
// dedicated restore-then-delete branch in reverseTransaction().
//
// Single-tenant assumption, documented not fixed: same as every other
// IACM route -- no tenant scoping exists anywhere in this schema. See
// docs/tenant-isolation-inventory.md and docs/saas-readiness-notes.md.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const {
      old_loan_id, restructure_date, maturity_date, loan_type, purpose,
      economic_sector, loan_officer, collateral_type, collateral_amount,
    } = await req.json()

    if (!old_loan_id || !restructure_date || !maturity_date) return err('Missing required fields')

    const supabase = createAdminClient()

    const { data: oldLoan, error: oldLoanErr } = await supabase
      .from('iacm_loans').select('*, iacm_clients(full_name)').eq('id', old_loan_id).single()
    if (oldLoanErr || !oldLoan) return err('Original loan not found', 404)
    if (oldLoan.status !== 'active') return err(`This loan is "${oldLoan.status}", not active -- only an active loan with a real remaining balance can be restructured`)
    const remainingPrincipal = Number(oldLoan.balance_outstanding)
    if (!(remainingPrincipal > 0)) return err('This loan has no remaining balance to restructure')

    // Real fee, recomputed here from the trusted remaining balance -- not
    // trusted from the client -- same as every other disbursement route.
    const fee = remainingPrincipal * UPFRONT_FEE_RATE
    const vat = fee * VAT_RATE

    // 1. Generate the new loan number, same generator as a normal disbursement.
    const { count } = await supabase.from('iacm_loans').select('*', { count: 'exact', head: true })
    const loanNumber = `INEMA-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`

    // 2. Create the new loan -- disbursed_amount is the old loan's exact
    // remaining balance, not a client-supplied number, so the transfer
    // always nets to zero by construction.
    const { data: newLoan, error: newLoanErr } = await supabase.from('iacm_loans').insert({
      client_id: oldLoan.client_id,
      loan_number: loanNumber,
      loan_type: loan_type || oldLoan.loan_type,
      disbursed_amount: remainingPrincipal,
      disbursement_date: restructure_date,
      maturity_date,
      interest_rate: 0.05,
      interest_method: oldLoan.interest_method ?? 'flat',
      repayment_frequency_days: oldLoan.repayment_frequency_days ?? 30,
      grace_period_days: 0,
      collateral_type: collateral_type || oldLoan.collateral_type,
      collateral_amount: Number(collateral_amount) || Number(oldLoan.collateral_amount) || 0,
      purpose: purpose || `Restructured from ${oldLoan.loan_number}`,
      economic_sector: economic_sector || oldLoan.economic_sector,
      loan_officer: loan_officer || oldLoan.loan_officer,
      balance_outstanding: remainingPrincipal,
      principal_repaid: 0,
      status: 'active',
      restructured_from_loan_id: oldLoan.id,
    }).select().single()
    if (newLoanErr) return serverError(newLoanErr)

    // 3. Old loan: transferred, not paid -- balance goes to 0 because the
    // debt moved to the new contract, never because cash was received.
    const { error: oldLoanUpdErr } = await supabase.from('iacm_loans').update({
      balance_outstanding: 0,
      status: 'restructured',
      updated_at: new Date().toISOString(),
    }).eq('id', oldLoan.id)
    if (oldLoanUpdErr) return serverError(oldLoanUpdErr)

    // 4. The real journal entry -- no cash line at all for the principal
    // transfer (see file comment); the fee lines are the only real effect
    // on any account balance.
    try {
      const clientName = (oldLoan as any).iacm_clients?.full_name ?? oldLoan.loan_number
      const narration = `Loan restructuring — ${clientName} (${oldLoan.loan_number} → ${loanNumber})`
      const reference = `loan-${newLoan.id}`
      const lines: JournalLineInput[] = [
        { account_code: '3110', account_name: `Loan Issued — transferred out (${oldLoan.loan_number})`, credit: remainingPrincipal },
        { account_code: '3110', account_name: `Loan Issued — transferred in (${loanNumber})`, debit: remainingPrincipal },
        { account_code: '3030', account_name: 'Accounts Receivable — Interest and Fees', debit: fee + vat },
        { account_code: '7020', account_name: 'Fees & Commission Income', credit: fee },
        { account_code: '2530', account_name: 'VAT Control Account', credit: vat },
      ]
      const { error: journalErr } = await postJournalEntry(supabase, {
        entry_date: restructure_date, narration, reference, entry_type: 'loan_restructuring',
        created_by: auth.profile.full_name, lines,
      })
      if (journalErr) console.error('Journal auto-entry failed (non-fatal):', journalErr)
    } catch (journalErr) {
      console.error('Journal auto-entry failed (non-fatal):', journalErr)
    }

    return ok({ new_loan_id: newLoan.id, new_loan_number: loanNumber, remaining_principal: remainingPrincipal, fee, vat }, 201)
  } catch (e) { return serverError(e) }
}
