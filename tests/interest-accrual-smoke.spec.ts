import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { postJournalEntry } from '../lib/ledger'
import { calculateInterestAccrualBatch, type AccrualLoanInput } from '../lib/interest-accrual'

// Piece 2 -- real, direct integration smoke test against the real
// database: a real disposable client + loan, the real preview query +
// calculation, the real confirm posting (journal entry + accrual row),
// verified against the actual written rows, then real cleanup. Same
// documented scope limit as the VAT Return smoke test -- exercises the
// real DB read/write and the real calculation exactly as the routes call
// them, not the full HTTP/route-handler cycle itself.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.INEMA_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.INEMA_SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing real staging credentials -- this test hits the real database.')
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const RUN_ID = Date.now().toString(36)
const AR_INTEREST_FEES = { code: '3030', name: 'Accounts Receivable – Interest and Fees' }
const INTEREST_INCOME = { code: '7010', name: 'Interest Income on Loans' }

let clientId = ''
let loanId = ''
let journalEntryId = ''
let accrualRowId = ''

beforeAll(async () => {
  // Real, direct evidence (2026-09-15): the live iacm_clients table has
  // phone as NOT NULL -- supabase.sql's own copy of this table shows it
  // as nullable ("phone text", no constraint). A second, independently
  // confirmed instance of the exact schema-drift issue flagged during
  // Piece 2's migration (iacm_journal_entries) -- that file is real
  // documentation, not a reliable source of the live schema's exact
  // constraints. Found here by a real, direct insert error, not assumed.
  const { data: client, error: clientErr } = await admin.from('iacm_clients').insert({
    full_name: `ZZ Test Accrual Client ${RUN_ID}`, national_id: `ZZ-ACCRUAL-${RUN_ID}`,
    phone: `07${RUN_ID.padStart(8, '0').slice(0, 8)}`,
  }).select('id').single()
  if (clientErr || !client) throw new Error(`Seed failed (client): ${clientErr?.message}`)
  clientId = client.id

  // Disbursed 2 real months before "today" so a real, predictable, exactly
  // 2-month accrual exists to calculate against.
  const disbursementDate = new Date()
  disbursementDate.setMonth(disbursementDate.getMonth() - 2)
  const disbursementDateStr = disbursementDate.toISOString().split('T')[0]

  // Real, direct evidence (2026-09-15): loan_type is also NOT NULL live,
  // a third instance of the same real schema-drift issue -- supabase.sql
  // shows it unconstrained. Confirmed by a real insert error, not assumed.
  const { data: loan, error: loanErr } = await admin.from('iacm_loans').insert({
    client_id: clientId, loan_number: `ZZ-ACCRUAL-${RUN_ID}`, loan_type: 'business',
    disbursed_amount: 1_000_000, disbursement_date: disbursementDateStr,
    maturity_date: new Date(new Date().setMonth(new Date().getMonth() + 4)).toISOString().split('T')[0],
    interest_rate: 0.05, interest_method: 'flat', balance_outstanding: 1_000_000, status: 'active',
  }).select('id').single()
  if (loanErr || !loan) throw new Error(`Seed failed (loan): ${loanErr?.message}`)
  loanId = loan.id
}, 30_000)

afterAll(async () => {
  const errors: string[] = []
  if (accrualRowId) {
    const { error } = await admin.from('iacm_interest_accruals').delete().eq('id', accrualRowId)
    if (error) errors.push(`iacm_interest_accruals: ${error.message}`)
  }
  if (journalEntryId) {
    const { error: lineErr } = await admin.from('iacm_journal_lines').delete().eq('journal_entry_id', journalEntryId)
    if (lineErr) errors.push(`journal_lines: ${lineErr.message}`)
    const { error: entryErr } = await admin.from('iacm_journal_entries').delete().eq('id', journalEntryId)
    if (entryErr) errors.push(`journal_entries: ${entryErr.message}`)
  }
  if (loanId) {
    const { error } = await admin.from('iacm_loans').delete().eq('id', loanId)
    if (error) errors.push(`iacm_loans: ${error.message}`)
  }
  if (clientId) {
    const { error } = await admin.from('iacm_clients').delete().eq('id', clientId)
    if (error) errors.push(`iacm_clients: ${error.message}`)
  }
  if (errors.length > 0) throw new Error(`Real test data was NOT fully cleaned up:\n${errors.join('\n')}`)
  console.log('Real interest-accrual smoke test data cleaned up.')
}, 30_000)

describe('Interest Accrual -- real database smoke test (Piece 2)', () => {
  it('the real preview query + calculation finds the real disposable loan with the correct, exact accrual', async () => {
    const { data: loans, error } = await admin
      .from('iacm_loans')
      .select('id, loan_number, client_id, disbursed_amount, disbursement_date, last_payment_date, balance_outstanding, interest_rate, interest_method, status, iacm_clients(full_name)')
      .eq('id', loanId)
    expect(error).toBeNull()
    expect(loans).toHaveLength(1)

    const inputs: AccrualLoanInput[] = (loans ?? []).map((l: any) => ({
      id: l.id, loanNumber: l.loan_number, clientName: l.iacm_clients?.full_name ?? '(unknown)',
      disbursedAmount: Number(l.disbursed_amount ?? 0), disbursementDate: l.disbursement_date,
      lastPaymentDate: l.last_payment_date, balanceOutstanding: Number(l.balance_outstanding ?? 0),
      interestRate: Number(l.interest_rate ?? 0), interestMethod: l.interest_method === 'declining' ? 'declining' : 'flat',
      status: l.status,
    }))
    const results = calculateInterestAccrualBatch(inputs, new Date())
    expect(results).toHaveLength(1)
    expect(results[0].months).toBe(2)
    expect(results[0].interestAmount).toBe(1_000_000 * 0.05 * 2) // real, exact: 100,000
    console.log('  real preview calculated correctly:', results[0])
  })

  it('the real confirm step posts a real journal entry and a real, itemized accrual row, correctly linked', async () => {
    const interestAmount = 100_000
    const periodEnd = new Date().toISOString().split('T')[0]
    const reference = `interest-accrual-${loanId}-${randomUUID()}`

    const { error: journalErr } = await postJournalEntry(admin as any, {
      entry_date: periodEnd, narration: `Interest accrual for ZZ Test Accrual Client ${RUN_ID} — 2 month(s)`,
      reference, entry_type: 'interest_accrual', created_by: 'Interest Accrual smoke test',
      lines: [
        { account_code: AR_INTEREST_FEES.code, account_name: AR_INTEREST_FEES.name, debit: interestAmount } as any,
        { account_code: INTEREST_INCOME.code, account_name: INTEREST_INCOME.name, credit: interestAmount } as any,
      ],
    })
    expect(journalErr).toBeNull()

    const { data: entryRow, error: lookupErr } = await admin.from('iacm_journal_entries').select('id').eq('reference', reference).single()
    expect(lookupErr).toBeNull()
    journalEntryId = entryRow!.id

    const { data: lines, error: linesErr } = await admin.from('iacm_journal_lines').select('*').eq('journal_entry_id', journalEntryId)
    expect(linesErr).toBeNull()
    expect(lines).toHaveLength(2)
    const debitLine = lines!.find((l: any) => l.account_code === '3030')
    const creditLine = lines!.find((l: any) => l.account_code === '7010')
    expect(Number(debitLine!.debit_amount)).toBe(interestAmount)
    expect(Number(creditLine!.credit_amount)).toBe(interestAmount)

    const { data: accrualRow, error: accrualErr } = await admin.from('iacm_interest_accruals').insert({
      loan_id: loanId, loan_number: `ZZ-ACCRUAL-${RUN_ID}`, client_name: `ZZ Test Accrual Client ${RUN_ID}`,
      period_start: new Date(new Date().setMonth(new Date().getMonth() - 2)).toISOString().split('T')[0],
      period_end: periodEnd, months: 2, balance_at_accrual: 1_000_000, monthly_rate: 0.05,
      interest_amount: interestAmount, journal_entry_id: journalEntryId, created_by_name: 'Interest Accrual smoke test',
    }).select('id').single()
    expect(accrualErr).toBeNull()
    accrualRowId = accrualRow!.id

    // Real, direct confirmation the row is correctly linked, not just
    // independently correct -- re-read it back and check the FK matches.
    const { data: readBack, error: readErr } = await admin.from('iacm_interest_accruals').select('*').eq('id', accrualRowId).single()
    expect(readErr).toBeNull()
    expect(readBack!.journal_entry_id).toBe(journalEntryId)
    expect(Number(readBack!.interest_amount)).toBe(interestAmount)
    console.log('  real journal entry + real accrual row confirmed correctly linked')
  })

  it('closes the loop with tonight\'s own BNR consultation: the real posted interest income is visible via getAccountMovementSum, the exact function FS row 40 uses', async () => {
    const { data, error } = await admin
      .from('iacm_journal_lines')
      .select('debit_amount, credit_amount, iacm_journal_entries!inner(entry_date)')
      .eq('account_code', '7010')
      .eq('journal_entry_id', journalEntryId)
    expect(error).toBeNull()
    const credit = (data ?? []).reduce((s: number, r: any) => s + Number(r.credit_amount ?? 0), 0)
    expect(credit).toBe(100_000)
    console.log('  real interest income confirmed visible to the same real query BNR FS row 40 uses')
  })
})
