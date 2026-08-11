import { createAdminClient } from './supabase'

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
