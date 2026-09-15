import { describe, it, expect } from 'vitest'
import { accountByCode, CHART_OF_ACCOUNTS, INCOME_EXPENSE_ACCOUNTS } from '../lib/ledger'

// Piece 0 (2026-09-14): permanent regression coverage for the real,
// documented drift bug (docs/accounting-reference.md, Addendum item 2)
// -- account 6280 was independently spelled "Bank Charges & Commissions"
// in app/api/admin/iacm/expenses/route.ts's own EXPENSE_ACCOUNTS map vs.
// the real Accounts sheet's "Bank charges ". accountByCode() is the one
// real place NEW code should resolve a 6xxx/7xxx name from going forward.
describe('accountByCode -- income/expense registry (Piece 0)', () => {
  it('resolves 6280 to the real, authoritative Accounts-sheet spelling, not the drifted app-level one', () => {
    expect(accountByCode('6280')).toMatchObject({ name: 'Bank charges', category: 'expense' })
  })

  it('resolves every real 6xxx/7xxx code from the authoritative Accounts sheet', () => {
    const expected = ['6010', '6110', '6120', '6210', '6220', '6230', '6240', '6250', '6260', '6270', '6280', '6290', '6300', '7010', '7020', '7030', '7110', '7120']
    for (const code of expected) expect(accountByCode(code), `code ${code}`).toBeDefined()
  })

  it('still resolves pre-existing balance-sheet codes unchanged', () => {
    expect(accountByCode('3020')).toMatchObject({ name: 'Bank Accounts', category: 'asset' })
  })

  it('returns undefined for a genuinely unknown code', () => {
    expect(accountByCode('9999')).toBeUndefined()
  })

  // Real, deliberate regression guard: CHART_OF_ACCOUNTS itself is iterated
  // by getTrialBalance() for the real, existing Journal Entries page --
  // getAccountBalance() there is a point-in-time BALANCE concept, which
  // doesn't apply to a flow/income-expense account. Confirms the 6xxx/7xxx
  // registry was kept in its own separate array, never merged into
  // CHART_OF_ACCOUNTS, so that page's real behavior is completely
  // unaffected by this work.
  it('never leaks an income/expense code into CHART_OF_ACCOUNTS itself', () => {
    expect(CHART_OF_ACCOUNTS).toHaveLength(19)
    const incomeExpenseCodes = new Set(INCOME_EXPENSE_ACCOUNTS.map(a => a.code))
    expect(CHART_OF_ACCOUNTS.every(a => !incomeExpenseCodes.has(a.code))).toBe(true)
  })

  it('has no code overlap between the two real registries', () => {
    const chartCodes = new Set(CHART_OF_ACCOUNTS.map(a => a.code))
    expect(INCOME_EXPENSE_ACCOUNTS.every(a => !chartCodes.has(a.code))).toBe(true)
  })
})
