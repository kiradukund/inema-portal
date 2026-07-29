import { createAdminClient } from './supabase'

export type NormalSide = 'debit' | 'credit'

export interface Account {
  code: string
  name: string
  category: 'asset' | 'liability' | 'equity'
  normalSide: NormalSide
}

// Chart of accounts for the non-loan balance sheet lines. Loan portfolio,
// interest receivable accrual and income-statement flows stay derived
// directly from iacm_loans/iacm_payments/iacm_expenses — these accounts
// exist so cash, fixed assets, payables, equity and borrowings have a real
// ledger instead of hardcoded constants.
export const CHART_OF_ACCOUNTS: Account[] = [
  { code: '3010', name: 'Cash in Vault', category: 'asset', normalSide: 'debit' },
  { code: '3020', name: 'Cash at Bank', category: 'asset', normalSide: 'debit' },
  { code: '3030', name: 'Interest Receivable', category: 'asset', normalSide: 'debit' },
  { code: '3040', name: 'Other Receivables', category: 'asset', normalSide: 'debit' },
  { code: '3050', name: 'Prepaid Expenses', category: 'asset', normalSide: 'debit' },
  { code: '3060', name: 'Caution & Deposits', category: 'asset', normalSide: 'debit' },
  { code: '3210', name: 'Fixed Assets (Net)', category: 'asset', normalSide: 'debit' },
  { code: '4010', name: 'PAYE Payable', category: 'liability', normalSide: 'credit' },
  { code: '4020', name: 'RSSB Pension Payable', category: 'liability', normalSide: 'credit' },
  { code: '4030', name: 'Maternity Payable', category: 'liability', normalSide: 'credit' },
  { code: '4040', name: 'CBHI Payable', category: 'liability', normalSide: 'credit' },
  { code: '4050', name: 'Other Liabilities', category: 'liability', normalSide: 'credit' },
  { code: '4110', name: 'Borrowings — Shareholders', category: 'liability', normalSide: 'credit' },
  { code: '4120', name: 'Borrowings — Related Parties', category: 'liability', normalSide: 'credit' },
  { code: '4130', name: 'Borrowings — Banks/MFIs', category: 'liability', normalSide: 'credit' },
  { code: '4140', name: 'Borrowings — Other', category: 'liability', normalSide: 'credit' },
  { code: '5010', name: 'Share Capital', category: 'equity', normalSide: 'credit' },
  { code: '5020', name: 'Retained Earnings', category: 'equity', normalSide: 'credit' },
]

export function accountByCode(code: string): Account | undefined {
  return CHART_OF_ACCOUNTS.find(a => a.code === code)
}

function toNaturalBalance(account: Account | undefined, debit: number, credit: number): number {
  const side = account?.normalSide ?? 'debit'
  return side === 'debit' ? debit - credit : credit - debit
}

// Opening balance + all journal movements up to (and including) asOfDate,
// expressed as a positive number when the account is on its normal side.
// Returns null when the account has no opening balance row and no journal
// entries at all — genuinely untracked, as opposed to tracked-and-zero.
export async function getAccountBalance(code: string, asOfDate: Date): Promise<number | null> {
  const supabase = createAdminClient()
  const account = accountByCode(code)

  const { data: openingRows } = await supabase
    .from('iacm_opening_balances')
    .select('debit_balance, credit_balance')
    .eq('account_code', code)

  const { data: entryRows } = await supabase
    .from('iacm_journal_entries')
    .select('debit, credit')
    .eq('account_code', code)
    .lte('entry_date', asOfDate.toISOString().split('T')[0])

  if ((openingRows ?? []).length === 0 && (entryRows ?? []).length === 0) return null

  const openingDebit = (openingRows ?? []).reduce((s, r: any) => s + Number(r.debit_balance ?? 0), 0)
  const openingCredit = (openingRows ?? []).reduce((s, r: any) => s + Number(r.credit_balance ?? 0), 0)
  const entryDebit = (entryRows ?? []).reduce((s, r: any) => s + Number(r.debit ?? 0), 0)
  const entryCredit = (entryRows ?? []).reduce((s, r: any) => s + Number(r.credit ?? 0), 0)

  return toNaturalBalance(account, openingDebit + entryDebit, openingCredit + entryCredit)
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
