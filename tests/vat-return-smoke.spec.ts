import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { postJournalEntry } from '../lib/ledger'
import { buildVatReturnSummary, type VatJournalLine } from '../lib/vat-return'

// Piece 1 -- real, direct integration smoke test against the real
// staging/production database, same real-disposable-data discipline as
// every other real DB test tonight: real entries, tagged for safe
// cleanup, real query (the exact shape the route itself uses), real
// classification, real teardown, self-verified clean afterward.
//
// Real, honest scope: this exercises the real database write/read and the
// real classification logic exactly as the route calls it -- not the full
// Next.js HTTP/route-handler cycle itself (which would need a running dev
// server), matching the same documented scope limit already used
// elsewhere for this kind of test.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.INEMA_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.INEMA_SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing real staging credentials -- this test hits the real database.')
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const RUN_ID = Date.now().toString(36)
const TAG = `ZZ_TEST_VAT_${RUN_ID}`
const PERIOD_START = '2026-01-01'
const PERIOD_END = '2026-12-31' // wide window; RUN_ID-tagged references keep this test isolated from any real data in range
const entryIds: string[] = []

async function post(entry_date: string, narration: string, entry_type: string, reference: string, debit: number, credit: number) {
  const { error } = await postJournalEntry(admin as any, {
    entry_date, narration, reference, entry_type, created_by: 'VAT Return smoke test',
    lines: [
      { account_code: '2530', account_name: 'VAT Control Account', debit: debit || undefined, credit: credit || undefined } as any,
      { account_code: '3020', account_name: 'Bank Accounts', debit: credit || undefined, credit: debit || undefined } as any,
    ],
  })
  if (error) throw new Error(`Seed post failed: ${JSON.stringify(error)}`)
  const { data } = await admin.from('iacm_journal_entries').select('id').eq('reference', reference).single()
  if (data) entryIds.push(data.id)
}

beforeAll(async () => {
  // 1. Real output VAT -- a credit, matching a real disbursement-fee line.
  await post('2026-06-05', 'Loan issued to VAT smoke test client', 'disbursement', `${TAG}-output`, 0, 7200)
  // 2. Real Input VAT -- a debit via the real split-expense entry_type.
  await post('2026-06-10', 'Recognition of rent payment made for VAT smoke test', 'expense', `${TAG}-input`, 76271, 0)
  // 3. Real, dedicated VAT payment (new Piece 1 route's own entry_type).
  await post('2026-06-15', 'Payment of quarterly VAT for smoke test period', 'vat_payment', `${TAG}-payment`, 91489, 0)
  // 4. Real historical-style manual settlement entry (pre-Piece-1 pattern).
  await post('2026-06-20', 'Payment of quarterly VAT from smoketest to smoketest', 'manual', `${TAG}-manual-payment`, 41235, 0)
}, 30_000)

afterAll(async () => {
  const errors: string[] = []
  if (entryIds.length > 0) {
    const { error: lineErr } = await admin.from('iacm_journal_lines').delete().in('journal_entry_id', entryIds)
    if (lineErr) errors.push(`journal_lines: ${lineErr.message}`)
    const { error: entryErr } = await admin.from('iacm_journal_entries').delete().in('id', entryIds)
    if (entryErr) errors.push(`journal_entries: ${entryErr.message}`)
  }
  // Real cleanup of any audit row this test's own route-level generation
  // wrote. iacm_vat_returns is now confirmed to exist in production
  // (2026-09-14) -- no reason to swallow a real delete error here anymore.
  const { error: vatReturnErr } = await admin.from('iacm_vat_returns').delete().eq('generated_by_name', 'VAT Return smoke test')
  if (vatReturnErr) errors.push(`iacm_vat_returns: ${vatReturnErr.message}`)
  if (errors.length > 0) throw new Error(`Real test data was NOT fully cleaned up:\n${errors.join('\n')}`)
  console.log('Real VAT-return smoke test data cleaned up.')
}, 30_000)

describe('VAT Return Summary -- real database smoke test (Piece 1)', () => {
  it('the real route query + real classification function correctly separate output/input/payment for real, disposable entries', async () => {
    const { data, error } = await admin
      .from('iacm_journal_lines')
      .select('debit_amount, credit_amount, iacm_journal_entries!inner(entry_date, narration, entry_type, reference)')
      .eq('account_code', '2530')
      .gte('iacm_journal_entries.entry_date', PERIOD_START)
      .lte('iacm_journal_entries.entry_date', PERIOD_END)
    expect(error).toBeNull()

    // Scope to just this run's own real disposable rows (real data may
    // also exist for 2530 in this wide window -- RUN_ID keeps this
    // assertion honest regardless of what else is really in staging).
    const ours = (data ?? []).filter((l: any) => (l.iacm_journal_entries.reference as string)?.includes(RUN_ID))
    expect(ours.length).toBe(4)

    const lines: VatJournalLine[] = ours.map((l: any) => ({
      entryDate: l.iacm_journal_entries.entry_date, narration: l.iacm_journal_entries.narration,
      entryType: l.iacm_journal_entries.entry_type, reference: l.iacm_journal_entries.reference,
      debitAmount: Number(l.debit_amount ?? 0), creditAmount: Number(l.credit_amount ?? 0),
    }))
    const summary = buildVatReturnSummary(lines, PERIOD_START, PERIOD_END)

    expect(summary.outputVat).toHaveLength(1)
    expect(summary.outputVat[0].amount).toBe(7200)

    expect(summary.inputVat).toHaveLength(1)
    expect(summary.inputVat[0].amount).toBe(76271)

    expect(summary.vatPayments).toHaveLength(2) // the dedicated vat_payment entry AND the historical-manual one
    const paidTotal = summary.vatPayments.reduce((s, l) => s + l.amount, 0)
    expect(paidTotal).toBe(91489 + 41235)

    expect(summary.unclassified).toHaveLength(0)

    const netPayable = summary.outputVat.reduce((s, l) => s + l.amount, 0) - summary.inputVat.reduce((s, l) => s + l.amount, 0)
    expect(netPayable).toBe(7200 - 76271)
    console.log('  real VAT return summary computed correctly:', { output: 7200, input: 76271, netPayable, paid: paidTotal })
  })

  it('the real iacm_vat_returns audit table exists and accepts a real insert (confirms the migration was applied)', async () => {
    const { error: insertErr } = await admin.from('iacm_vat_returns').insert({
      period_start: PERIOD_START, period_end: PERIOD_END,
      output_vat: 7200, input_vat: 76271, net_payable: 7200 - 76271, paid_this_period: 91489 + 41235,
      unclassified_count: 0, generated_by_name: 'VAT Return smoke test',
    })
    expect(insertErr).toBeNull()
    console.log('  real iacm_vat_returns row inserted and will be cleaned up in afterAll')
  })
})
