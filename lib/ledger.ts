import { createAdminClient } from './supabase'
import { buildRestructureBreakdown, wholeMonthsBetween } from './calculator'

// Formats a Date as YYYY-MM-DD using its LOCAL calendar fields, not
// toISOString() (which is UTC-based). Confirmed real bug: constructing a
// date via `new Date(year, month, day)` is interpreted in local time, and
// on this server's timezone (UTC+2), converting that to ISO shifts local
// midnight back to 22:00 the PREVIOUS day in UTC — so
// `date.toISOString().split('T')[0]` silently returns the wrong calendar
// date, one day early, for any locally-constructed date. This isn't a
// theoretical edge case: it dropped real transactions dated on the exact
// boundary day of a query range in the BNR report generator (confirmed
// against real filed figures — see lib/bnr-report.ts).
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type NormalSide = 'debit' | 'credit'

export interface Account {
  code: string
  name: string
  category: 'asset' | 'liability' | 'equity'
  normalSide: NormalSide
}

// Chart of accounts, reconciled to Devotha's real bookkeeping codes (found
// in the actual journal export, public/journal_template.xlsx — these are
// not invented placeholders). Loan portfolio and income-statement flows
// still stay derived directly from iacm_loans/iacm_payments/iacm_expenses,
// NOT from 3110/6xxx/7xxx here — 3110 ("Loan issued") is tracked as a
// balance-sheet opening position only (see getAccountBalance callers, which
// deliberately exclude it from their own asset sums to avoid double-
// counting the same loan portfolio that iacm_loans already represents).
export const CHART_OF_ACCOUNTS: Account[] = [
  { code: '3010', name: 'Cash on Hand', category: 'asset', normalSide: 'debit' },
  { code: '3020', name: 'Bank Accounts', category: 'asset', normalSide: 'debit' },
  { code: '3030', name: 'Accounts Receivable — Interest and Fees', category: 'asset', normalSide: 'debit' },
  { code: '3040', name: 'Other Receivables', category: 'asset', normalSide: 'debit' },
  { code: '3050', name: 'Prepaid Expenses', category: 'asset', normalSide: 'debit' },
  { code: '3060', name: 'Caution', category: 'asset', normalSide: 'debit' },
  { code: '3110', name: 'Loan Issued', category: 'asset', normalSide: 'debit' },
  { code: '3210', name: 'Property, Plant & Equipment', category: 'asset', normalSide: 'debit' },
  { code: '3220', name: 'Accumulated Depreciation', category: 'asset', normalSide: 'credit' }, // contra-asset
  { code: '2030', name: "Shareholders' Loan — Long Term", category: 'liability', normalSide: 'credit' },
  { code: '2530', name: 'VAT Control Account', category: 'liability', normalSide: 'credit' },
  { code: '2540', name: 'PAYE Payables', category: 'liability', normalSide: 'credit' },
  { code: '2550', name: 'Maternity Contribution Payables', category: 'liability', normalSide: 'credit' },
  { code: '2560', name: 'Pension and Risk Contribution Payables', category: 'liability', normalSide: 'credit' },
  { code: '2570', name: 'CBHI Payables', category: 'liability', normalSide: 'credit' },
  { code: '2580', name: 'Salary Payables', category: 'liability', normalSide: 'credit' },
  { code: '2640', name: 'Tax Payable', category: 'liability', normalSide: 'credit' },
  { code: '1010', name: 'Ordinary Share Capital', category: 'equity', normalSide: 'credit' },
  { code: '1050', name: 'Retained Earnings', category: 'equity', normalSide: 'credit' },
]

export function accountByCode(code: string): Account | undefined {
  return CHART_OF_ACCOUNTS.find(a => a.code === code)
}

function toNaturalBalance(account: Account | undefined, debit: number, credit: number): number {
  const side = account?.normalSide ?? 'debit'
  return side === 'debit' ? debit - credit : credit - debit
}

// iacm_journal_entries is a HEADER table (one row per transaction:
// entry_date, narration, reference, entry_type, created_by) — it does not
// carry account_code/debit/credit itself. The actual debit/credit lines
// live in the separate iacm_journal_lines table (journal_entry_id FK,
// account_code, account_name, debit_amount, credit_amount). Every prior
// version of this file, and every route that posted to the ledger, assumed
// a single flat table and silently failed against the real schema — this
// is the corrected shape. Use this helper for every future journal post
// so that mistake can't reappear in a fifth place.
export interface JournalLineInput {
  account_code: string
  account_name: string
  debit?: number
  credit?: number
}

export async function postJournalEntry(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    entry_date: string
    narration: string
    reference?: string
    entry_type?: string
    created_by?: string
    lines: JournalLineInput[]
  }
): Promise<{ error: unknown }> {
  const { data: entry, error: entryError } = await supabase
    .from('iacm_journal_entries')
    .insert({
      entry_date: params.entry_date,
      narration: params.narration,
      ...(params.reference ? { reference: params.reference } : {}),
      ...(params.entry_type ? { entry_type: params.entry_type } : {}),
      ...(params.created_by ? { created_by: params.created_by } : {}),
    })
    .select('id')
    .single()
  if (entryError || !entry) return { error: entryError }

  const lineRows = params.lines.map(l => ({
    journal_entry_id: entry.id,
    account_code: l.account_code,
    account_name: l.account_name,
    debit_amount: l.debit ?? 0,
    credit_amount: l.credit ?? 0,
  }))
  const { error: linesError } = await supabase.from('iacm_journal_lines').insert(lineRows)
  return { error: linesError }
}

// ── Loan Restructuring / Rollover ───────────────────────────────────────────
// Converts a defaulted loan's remaining debt into a fresh contract with NO
// cash movement. Extracted here (from the route) so it runs through one
// tested code path, alongside reverseTransaction()/recomputeLoanFromPayments().
//
// `restructured_amount` is OPTIONAL: omit it (or pass a value equal to the
// old loan's balance) and the behaviour is exactly the pre-2026-09-03
// route — the new loan carries the old loan's exact outstanding balance and
// the two 3110 transfer lines net to zero on that shared GL account.
//
// When staff DO enter a different agreed figure (Option A, confirmed with
// Kevin 2026-09-03): that figure becomes the new loan's real
// disbursed_amount / balance_outstanding, BOTH 3110 lines are posted at it
// (so the journal still balances), and the difference vs the old balance is
// a deliberate principal write-down (amount < old) or capitalisation
// (amount > old) agreed as part of the restructuring — the loan-portfolio
// total legitimately moves by that delta. The caller (form) warns on the
// delta; this function does not block it. Fee (4%) + VAT (18% of fee) are
// computed from the agreed amount, same as any normal disbursement.
//
// Reversing this (entry_type 'loan_restructuring') deletes the new loan and
// recomputes the old one from its own payments — which also unwinds any
// write-down, restoring the true pre-restructuring balance. See
// reverseTransaction()'s loan_restructuring branch.
export interface RestructureLoanParams {
  old_loan_id: string
  restructure_date: string
  maturity_date: string
  restructured_amount?: number | string | null
  loan_type?: string
  purpose?: string
  economic_sector?: string
  loan_officer?: string
  collateral_type?: string
  collateral_amount?: number | string
  created_by: string
}
export interface RestructureLoanResult {
  error: string | null
  new_loan_id?: string
  new_loan_number?: string
  restructured_amount?: number
  old_balance?: number
  delta?: number
  fee?: number
  vat?: number
}

export async function restructureLoan(
  supabase: ReturnType<typeof createAdminClient>,
  params: RestructureLoanParams,
): Promise<RestructureLoanResult> {
  const { old_loan_id, restructure_date, maturity_date, restructured_amount, created_by } = params
  if (!old_loan_id || !restructure_date || !maturity_date) return { error: 'Missing required fields' }
  if (!(maturity_date > restructure_date)) return { error: 'Maturity date must be after the restructuring date' }

  const { data: oldLoan, error: oldLoanErr } = await supabase
    .from('iacm_loans').select('*, iacm_clients(full_name)').eq('id', old_loan_id).single()
  if (oldLoanErr || !oldLoan) return { error: 'Original loan not found' }
  if (oldLoan.status !== 'active') {
    return { error: `This loan is "${oldLoan.status}", not active — only an active loan with a real remaining balance can be restructured` }
  }
  const oldBalance = Number(oldLoan.balance_outstanding)
  if (!(oldBalance > 0)) return { error: 'This loan has no remaining balance to restructure' }

  // Optional manual amount; defaults to the old loan's exact balance.
  const provided = restructured_amount !== undefined && restructured_amount !== null && restructured_amount !== ''
  const amount = provided ? Number(restructured_amount) : oldBalance
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Restructured amount must be a positive number' }

  // Fee/VAT from the agreed amount — same formula as the normal disbursement
  // route, now sourced from the shared calculator helper so the form preview
  // and this cannot diverge.
  const { fee, vat } = buildRestructureBreakdown(amount, wholeMonthsBetween(restructure_date, maturity_date))

  const { count } = await supabase.from('iacm_loans').select('*', { count: 'exact', head: true })
  const loanNumber = `INEMA-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { data: newLoan, error: newLoanErr } = await supabase.from('iacm_loans').insert({
    client_id: oldLoan.client_id,
    loan_number: loanNumber,
    loan_type: params.loan_type || oldLoan.loan_type,
    disbursed_amount: amount,
    disbursement_date: restructure_date,
    maturity_date,
    interest_rate: 0.05,
    interest_method: oldLoan.interest_method ?? 'flat',
    repayment_frequency_days: oldLoan.repayment_frequency_days ?? 30,
    grace_period_days: 0,
    collateral_type: params.collateral_type || oldLoan.collateral_type,
    collateral_amount: Number(params.collateral_amount) || Number(oldLoan.collateral_amount) || 0,
    purpose: params.purpose || `Restructured from ${oldLoan.loan_number}`,
    economic_sector: params.economic_sector || oldLoan.economic_sector,
    loan_officer: params.loan_officer || oldLoan.loan_officer,
    balance_outstanding: amount,
    principal_repaid: 0,
    status: 'active',
    restructured_from_loan_id: oldLoan.id,
  }).select().single()
  if (newLoanErr) return { error: newLoanErr.message }

  const { error: oldLoanUpdErr } = await supabase.from('iacm_loans').update({
    balance_outstanding: 0,
    status: 'restructured',
    updated_at: new Date().toISOString(),
  }).eq('id', oldLoan.id)
  if (oldLoanUpdErr) return { error: `New loan ${loanNumber} created, but failed to close the old loan: ${oldLoanUpdErr.message}` }

  // Journal: both 3110 transfer lines at the agreed amount (nets to zero on
  // that shared GL account); the fee/VAT lines are the only real effect on
  // any balance — exactly mirroring a normal disbursement's fee treatment.
  try {
    const clientName = (oldLoan as any).iacm_clients?.full_name ?? oldLoan.loan_number
    const narration = `Loan restructuring — ${clientName} (${oldLoan.loan_number} → ${loanNumber})`
    const { error: journalErr } = await postJournalEntry(supabase, {
      entry_date: restructure_date,
      narration,
      reference: `loan-${newLoan.id}`,
      entry_type: 'loan_restructuring',
      created_by,
      lines: [
        { account_code: '3110', account_name: `Loan Issued — transferred out (${oldLoan.loan_number})`, credit: amount },
        { account_code: '3110', account_name: `Loan Issued — transferred in (${loanNumber})`, debit: amount },
        { account_code: '3030', account_name: 'Accounts Receivable — Interest and Fees', debit: fee + vat },
        { account_code: '7020', account_name: 'Fees & Commission Income', credit: fee },
        { account_code: '2530', account_name: 'VAT Control Account', credit: vat },
      ],
    })
    if (journalErr) console.error('Journal auto-entry failed (non-fatal):', journalErr)
  } catch (journalErr) {
    console.error('Journal auto-entry failed (non-fatal):', journalErr)
  }

  return {
    error: null,
    new_loan_id: newLoan.id,
    new_loan_number: loanNumber,
    restructured_amount: amount,
    old_balance: oldBalance,
    delta: amount - oldBalance,
    fee,
    vat,
  }
}

// iacm_opening_balances is the reconciled, permanent snapshot of the
// business's position as of this date — it already incorporates every real
// transaction up to and including it. Journal entries dated on or before
// this date must never also contribute to a balance, or the same
// historical activity gets counted twice: once via the opening balance,
// once via the journal entry. This is the same double-counting failure
// mode as the Jan-Jun payment backfill fixed earlier the same night in
// app/admin/page.tsx's Net Profit calculation — except getAccountBalance()
// had no equivalent guard until now.
export const LEDGER_CUTOFF_DATE = '2026-06-30'

// Opening balance (as of LEDGER_CUTOFF_DATE) + journal movements dated
// STRICTLY AFTER the cutoff, up to (and including) asOfDate, expressed as
// a positive number when the account is on its normal side. Entries dated
// on or before the cutoff never contribute, regardless of what exists in
// the table — enforced by the query itself, not by what happens to be
// backfilled or not at any given time. Returns null when the account has
// no opening balance row and no qualifying journal entries — genuinely
// untracked, as opposed to tracked-and-zero.
//
// Throws on a real query failure instead of treating it as "no activity" —
// a broken ledger query silently masquerading as a zero balance is exactly
// how the account_code/debit/credit schema mismatch went unnoticed. A
// caller seeing an error is far better than a caller seeing a confidently
// wrong number.
export async function getAccountBalance(code: string, asOfDate: Date): Promise<number | null> {
  const supabase = createAdminClient()
  const account = accountByCode(code)

  const { data: openingRows, error: openingError } = await supabase
    .from('iacm_opening_balances')
    .select('debit_balance, credit_balance')
    .eq('account_code', code)
  if (openingError) throw new Error(`getAccountBalance(${code}): iacm_opening_balances query failed: ${openingError.message}`)

  const { data: entryRows, error: entryError } = await supabase
    .from('iacm_journal_lines')
    .select('debit_amount, credit_amount, iacm_journal_entries!inner(entry_date)')
    .eq('account_code', code)
    .gt('iacm_journal_entries.entry_date', LEDGER_CUTOFF_DATE)
    .lte('iacm_journal_entries.entry_date', toLocalDateString(asOfDate))
  if (entryError) throw new Error(`getAccountBalance(${code}): iacm_journal_lines query failed: ${entryError.message}`)

  if ((openingRows ?? []).length === 0 && (entryRows ?? []).length === 0) return null

  const openingDebit = (openingRows ?? []).reduce((s, r: any) => s + Number(r.debit_balance ?? 0), 0)
  const openingCredit = (openingRows ?? []).reduce((s, r: any) => s + Number(r.credit_balance ?? 0), 0)
  const entryDebit = (entryRows ?? []).reduce((s, r: any) => s + Number(r.debit_amount ?? 0), 0)
  const entryCredit = (entryRows ?? []).reduce((s, r: any) => s + Number(r.credit_amount ?? 0), 0)

  return toNaturalBalance(account, openingDebit + entryDebit, openingCredit + entryCredit)
}

// Sum of movements for income-statement accounts (7xxx income, 6xxx
// expense) between two dates inclusive — a period FLOW, not a point-in-
// time balance. Deliberately separate from getAccountBalance(): these
// codes aren't in CHART_OF_ACCOUNTS (that boundary is intentional, see its
// comment) since income/expense accounts have no opening-balance concept
// to protect against double-counting, and the LEDGER_CUTOFF_DATE guard
// doesn't apply here for the same reason — there's no separate pre-cutoff
// income snapshot this could double-count against. Used by the BNR
// report's Income Statement section, which reports year-to-date
// cumulative figures (confirmed by cross-checking real filed quarters
// against real ledger data — see docs/known-gaps.md or the report
// generator's own comments for the specific verification).
export async function getAccountMovementSum(
  codes: string[],
  fromDate: Date,
  toDate: Date,
  side: NormalSide
): Promise<number> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('iacm_journal_lines')
    .select('debit_amount, credit_amount, iacm_journal_entries!inner(entry_date)')
    .in('account_code', codes)
    .gte('iacm_journal_entries.entry_date', toLocalDateString(fromDate))
    .lte('iacm_journal_entries.entry_date', toLocalDateString(toDate))
  if (error) throw new Error(`getAccountMovementSum(${codes.join(',')}): query failed: ${error.message}`)

  const debit = (data ?? []).reduce((s, r: any) => s + Number(r.debit_amount ?? 0), 0)
  const credit = (data ?? []).reduce((s, r: any) => s + Number(r.credit_amount ?? 0), 0)
  return side === 'debit' ? debit - credit : credit - debit
}

// Reverse Transaction feature (2026-08-20): generalizes the by-hand
// recipe used to reverse three real mistaken entries earlier tonight
// (delete journal lines, delete the journal entry, delete/recompute the
// domain row) into one reusable, audited path any admin can trigger
// in-app instead of a temporary service-role DB session.
//
// Maps each reversible entry_type to its backing domain table (null for
// the two journal-only types) and the `reference` prefix used to recover
// the domain row's id (e.g. reference = "payment-<uuid>"). 'manual'
// entries are deliberately not in this map -- out of scope.
export const REVERSAL_HANDLERS: Record<string, { domainTable: string | null; referencePrefix: string }> = {
  disbursement:      { domainTable: 'iacm_loans',    referencePrefix: 'loan-' },
  payment:           { domainTable: 'iacm_payments', referencePrefix: 'payment-' },
  expense:           { domainTable: 'iacm_expenses', referencePrefix: 'expense-' },
  salary_payment:    { domainTable: null,            referencePrefix: 'salary-payment-' },
  shareholder_loan:  { domainTable: null,            referencePrefix: 'shareholder-loan-' },
  cash_transfer:     { domainTable: null,            referencePrefix: 'cash-transfer-' },
  loan_restructuring: { domainTable: 'iacm_loans',   referencePrefix: 'loan-' },
}

export interface ReverseTransactionParams {
  journal_entry_id: string
  reason: string
  acknowledged_pre_cutoff: boolean
  reversed_by_user_id: string
  reversed_by_name: string
}

export interface ReverseTransactionResult {
  error: string | null
  reversal_id?: string
}

// ── Recompute a loan's derived fields from GROUND TRUTH ──────────────────
// Rebuilds balance_outstanding / principal_repaid / last_payment_date /
// status / installment counters from the loan's own disbursed_amount and the
// iacm_payments rows that ACTUALLY EXIST for it right now — never by nudging
// whatever value is currently stored. Called at the end of every
// loan-affecting reversal branch so the outcome is:
//   • order-independent — reversing {payment, payment, restructuring} in any
//     order lands on the same correct balance
//   • self-correcting   — if the stored balance was already wrong (a
//     restructuring zeroed it, or an earlier reversal left it off), this
//     still produces the real answer
// Real incident it fixes: INEMA-2026-0008 (NIYITEGEKA Francine), 2026-09-02,
// where reversing two payments then the restructuring left balance_outstanding
// at the restructured loan's disbursed_amount (1,999,800) instead of the true
// 2,174,800 — see docs/known-gaps.md. Pure function of (loan row, its payment
// rows, its restructuring child if any); safe to run any time.
export async function recomputeLoanFromPayments(
  supabase: ReturnType<typeof createAdminClient>,
  loanId: string,
): Promise<{ error: string | null }> {
  const { data: loan, error: loanErr } = await supabase
    .from('iacm_loans').select('*').eq('id', loanId).single()
  if (loanErr || !loan) return { error: `recomputeLoanFromPayments: loan ${loanId} not found` }

  const { data: pays, error: payErr } = await supabase
    .from('iacm_payments').select('payment_date, principal_portion')
    .eq('loan_id', loanId)
    .order('payment_date', { ascending: false })
  if (payErr) return { error: `recomputeLoanFromPayments: payments query failed: ${payErr.message}` }
  const rows = pays ?? []

  const principalRepaid = rows.reduce((s, p) => s + Number(p.principal_portion ?? 0), 0)
  const lastPaymentDate = rows.length > 0 ? rows[0].payment_date : null

  // A loan that has been restructured INTO another, still-live loan had its
  // principal transferred out: its own balance is 0 by definition and its
  // status must stay 'restructured'. Anything else is a normal live loan.
  const { data: children, error: childErr } = await supabase
    .from('iacm_loans').select('id').eq('restructured_from_loan_id', loanId).limit(1)
  if (childErr) return { error: `recomputeLoanFromPayments: restructure-child query failed: ${childErr.message}` }
  const restructuredAway = (children ?? []).length > 0

  const balanceOutstanding = restructuredAway
    ? 0
    : Math.max(0, Number(loan.disbursed_amount ?? 0) - principalRepaid)

  // Own only the three statuses this function is responsible for; preserve
  // any deliberate terminal status set elsewhere (e.g. a future 'written_off').
  let status = loan.status
  if (restructuredAway) status = 'restructured'
  else if (['active', 'completed', 'restructured'].includes(loan.status)) {
    status = balanceOutstanding <= 0 ? 'completed' : 'active'
  }

  const totalInstallments = Number(loan.total_installments ?? 1)
  const installmentsPaid = rows.length
  const installmentsOutstanding = Math.max(0, totalInstallments - installmentsPaid)

  const { error: updErr } = await supabase.from('iacm_loans').update({
    balance_outstanding: balanceOutstanding,
    principal_repaid: principalRepaid,
    last_payment_date: lastPaymentDate,
    status,
    installments_paid: installmentsPaid,
    installments_outstanding: installmentsOutstanding,
    updated_at: new Date().toISOString(),
  }).eq('id', loanId)
  if (updErr) return { error: `recomputeLoanFromPayments: loan update failed: ${updErr.message}` }
  return { error: null }
}

// Writes the iacm_reversals audit row BEFORE touching any domain/journal
// data, not after. This is a deliberate departure from the strict
// "commit only when fully done" ideal (which would need a real Postgres
// transaction/RPC function this project's tables aren't set up for): if
// a later step in this function fails partway, the worse outcome by far
// is a silent, unaudited deletion of real financial data -- a leftover
// audit row describing a reversal that didn't fully complete is a much
// safer failure mode, and is left in place on purpose for manual review
// rather than rolled back.
export async function reverseTransaction(
  supabase: ReturnType<typeof createAdminClient>,
  params: ReverseTransactionParams
): Promise<ReverseTransactionResult> {
  const { journal_entry_id, reason, acknowledged_pre_cutoff, reversed_by_user_id, reversed_by_name } = params
  if (!reason.trim()) return { error: 'A reason is required.' }

  const { data: entry, error: entryErr } = await supabase
    .from('iacm_journal_entries')
    .select('*, iacm_journal_lines(*)')
    .eq('id', journal_entry_id)
    .single()
  if (entryErr || !entry) return { error: 'Journal entry not found.' }

  const handler = REVERSAL_HANDLERS[entry.entry_type]
  if (!handler) return { error: `Entries of type "${entry.entry_type}" cannot be reversed through this feature.` }

  const { data: existingReversal } = await supabase
    .from('iacm_reversals')
    .select('id')
    .eq('original_journal_entry_id', journal_entry_id)
    .limit(1)
  if (existingReversal && existingReversal.length > 0) return { error: 'This entry has already been reversed.' }

  // Real asymmetry confirmed in getAccountBalance()/getAccountMovementSum()
  // above: reversing an entry dated on/before LEDGER_CUTOFF_DATE is a
  // no-op for every balance-sheet screen, but NOT for income-statement/
  // BNR report queries (getAccountMovementSum has no cutoff guard) --
  // require the caller to have shown and confirmed that distinction.
  if (entry.entry_date <= LEDGER_CUTOFF_DATE && !acknowledged_pre_cutoff) {
    return { error: 'This entry is dated on or before the ledger cutoff (2026-06-30). Reversing it will not change any balance-sheet total, but WILL change historical income-statement/BNR report figures for that period. Acknowledge this before proceeding.' }
  }

  let domainRow: any = null
  let loanBefore: any = null
  const domainRowId = handler.domainTable ? entry.reference?.slice(handler.referencePrefix.length) : null
  if (handler.domainTable) {
    if (!domainRowId) return { error: 'Could not determine which record this entry refers to.' }
    const { data: row, error: rowErr } = await supabase.from(handler.domainTable).select('*').eq('id', domainRowId).single()
    if (rowErr || !row) return { error: 'The related record was not found (it may already have been deleted).' }
    domainRow = row

    if (entry.entry_type === 'payment') {
      const { data: loan, error: loanErr } = await supabase.from('iacm_loans').select('*').eq('id', domainRow.loan_id).single()
      if (loanErr || !loan) return { error: 'The loan for this payment was not found.' }
      loanBefore = loan
    }

    if (entry.entry_type === 'disbursement') {
      const { count } = await supabase.from('iacm_payments').select('id', { count: 'exact', head: true }).eq('loan_id', domainRowId)
      if ((count ?? 0) > 0) {
        return { error: `This loan has ${count} real payment(s) recorded against it. Reverse ${count === 1 ? 'it' : 'them'} first, then reverse the disbursement.` }
      }
    }

    // Loan Restructuring (2026-08-21): domainRow here is the NEW loan
    // created by the restructuring. Reversing it means restoring the OLD
    // loan (found via restructured_from_loan_id) back to 'active' with its
    // real pre-restructuring balance -- recoverable without a separate
    // snapshot, since a restructuring always transfers the OLD loan's
    // *entire* balance, so that exact figure is already sitting on the new
    // loan's own disbursed_amount. Same payment-block safety check as
    // disbursement: if real payments already exist on the new loan, those
    // must be reversed first.
    if (entry.entry_type === 'loan_restructuring') {
      if (!domainRow.restructured_from_loan_id) {
        return { error: 'This loan has no linked original loan on record -- cannot safely reverse the restructuring.' }
      }
      const { count } = await supabase.from('iacm_payments').select('id', { count: 'exact', head: true }).eq('loan_id', domainRowId)
      if ((count ?? 0) > 0) {
        return { error: `This restructured loan has ${count} real payment(s) recorded against it. Reverse ${count === 1 ? 'it' : 'them'} first, then reverse the restructuring.` }
      }
    }
  }

  const snapshot = {
    journal_entry: { ...entry, iacm_journal_lines: undefined },
    journal_lines: entry.iacm_journal_lines,
    domain_row: domainRow,
    loan_before: loanBefore,
  }

  const { data: reversalRow, error: reversalInsertErr } = await supabase
    .from('iacm_reversals')
    .insert({
      entry_type: entry.entry_type,
      original_journal_entry_id: entry.id,
      original_reference: entry.reference,
      original_entry_date: entry.entry_date,
      original_created_by: entry.created_by,
      domain_table: handler.domainTable,
      domain_row_id: domainRowId,
      snapshot,
      reason,
      reversed_by_user_id,
      reversed_by_name,
    })
    .select('id')
    .single()
  if (reversalInsertErr || !reversalRow) return { error: 'Failed to write the audit record -- nothing was changed.' }

  // Domain mutation, per type. Errors from here on leave the audit row
  // in place (see function comment) rather than rolling it back.
  if (entry.entry_type === 'payment') {
    const { error: delPayErr } = await supabase.from('iacm_payments').delete().eq('id', domainRowId)
    if (delPayErr) return { error: `Failed to delete the payment: ${delPayErr.message}` }

    // Rebuild the loan from ground truth rather than incrementally undoing
    // this one payment's principal — the stored balance may already be wrong
    // (e.g. a prior restructuring zeroed it). See recomputeLoanFromPayments().
    const rec = await recomputeLoanFromPayments(supabase, domainRow.loan_id)
    if (rec.error) return { error: `Payment deleted, but failed to recompute the loan: ${rec.error}` }
  } else if (entry.entry_type === 'loan_restructuring') {
    // Delete the restructured (new) loan FIRST so the recompute of the
    // original loan below sees no live restructuring child and rebuilds its
    // real balance from its OWN disbursed_amount and payments — not from the
    // new loan's disbursed_amount, which is what left INEMA-2026-0008 wrong
    // (see recomputeLoanFromPayments() and docs/known-gaps.md).
    const { error: delErr } = await supabase.from('iacm_loans').delete().eq('id', domainRowId)
    if (delErr) return { error: `Failed to delete the restructured loan: ${delErr.message}` }

    const rec = await recomputeLoanFromPayments(supabase, domainRow.restructured_from_loan_id)
    if (rec.error) return { error: `Restructured loan deleted, but failed to restore the original loan: ${rec.error}` }
  } else if (entry.entry_type === 'disbursement' || entry.entry_type === 'expense') {
    const { error: delErr } = await supabase.from(handler.domainTable as string).delete().eq('id', domainRowId)
    if (delErr) return { error: `Failed to delete the record: ${delErr.message}` }
  }
  // shareholder_loan / cash_transfer: journal-only, no domain mutation.

  const { error: delLinesErr } = await supabase.from('iacm_journal_lines').delete().eq('journal_entry_id', journal_entry_id)
  if (delLinesErr) return { error: `Domain data reversed, but failed to delete journal lines: ${delLinesErr.message}` }
  const { error: delEntryErr } = await supabase.from('iacm_journal_entries').delete().eq('id', journal_entry_id)
  if (delEntryErr) return { error: `Domain data and journal lines reversed, but failed to delete the journal entry: ${delEntryErr.message}` }

  return { error: null, reversal_id: reversalRow.id }
}

export interface TrialBalanceRow extends Account {
  balance: number | null
}

// Running balance per account (null = no opening balance or entries yet),
// for the Journal Entries list page.
export async function getTrialBalance(asOfDate: Date = new Date()): Promise<TrialBalanceRow[]> {
  const rows = await Promise.all(
    CHART_OF_ACCOUNTS.map(async account => ({
      ...account,
      balance: await getAccountBalance(account.code, asOfDate),
    }))
  )
  return rows
}
