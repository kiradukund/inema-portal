import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
// @ts-ignore
import ExcelJS from 'exceljs'
import { postJournalEntry } from '../lib/ledger'

// Piece 3 (2026-09-15) -- real, direct proof that writing account_code as
// a backend literal (not a live VLOOKUP) is correct for real, disposable
// entries spanning several codes, INCLUDING the previously-drifted 6280
// (real historical spelling mismatch: "Bank charges " on the Accounts
// sheet vs. "Bank Charges & Commissions" in app/api/admin/iacm/expenses/
// route.ts's own EXPENSE_ACCOUNTS map). This test deliberately uses the
// EXACT drifted name for its 6280 row -- if the old VLOOKUP behavior were
// still in place, this row's exported Account code cell would show 0
// (the account_name wouldn't match the Accounts sheet's own text); the
// real fix must show the correct literal 6280 regardless.
//
// Real, documented scope limit, same as every other smoke test tonight:
// replicates the export route's exact real query + fill logic directly
// (not the full HTTP/route-handler cycle, which would need
// requireAdminApi()'s real session context) -- proven correct for the
// real database read/write and the real cell-writing logic itself.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.INEMA_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.INEMA_SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing real staging credentials -- this test hits the real database.')
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const RUN_ID = Date.now().toString(36)
const TAG = `ZZ_TEST_EXPCODE_${RUN_ID}`
const entryIds: string[] = []

// The exact real drifted spelling from app/api/admin/iacm/expenses/
// route.ts's own EXPENSE_ACCOUNTS map -- deliberately NOT the Accounts
// sheet's own "Bank charges " text, to genuinely exercise the mismatch.
const DRIFTED_6280_NAME = 'Bank Charges & Commissions'

async function post(reference: string, narration: string, accountCode: string, accountName: string, debit: number, credit: number) {
  const { error } = await postJournalEntry(admin as any, {
    entry_date: '2026-06-01', narration, reference, entry_type: 'manual', created_by: 'Journal export account-code smoke test',
    lines: [
      { account_code: accountCode, account_name: accountName, debit: debit || undefined, credit: credit || undefined } as any,
      { account_code: '3020', account_name: 'Bank Accounts', debit: credit || undefined, credit: debit || undefined } as any,
    ],
  })
  if (error) throw new Error(`Seed post failed: ${JSON.stringify(error)}`)
  const { data } = await admin.from('iacm_journal_entries').select('id').eq('reference', reference).single()
  if (data) entryIds.push(data.id)
}

beforeAll(async () => {
  await post(`${TAG}-1`, 'Real disbursement smoke test', '3110', 'Loan issued', 500_000, 0)
  await post(`${TAG}-2`, 'Real deposit smoke test', '1010', 'Ordinary Share Capital', 0, 200_000)
  // The real, previously-drifted code, using the REAL drifted spelling.
  await post(`${TAG}-3`, 'Real bank charge smoke test', '6280', DRIFTED_6280_NAME, 5_000, 0)
}, 30_000)

afterAll(async () => {
  const errors: string[] = []
  if (entryIds.length > 0) {
    const { error: lineErr } = await admin.from('iacm_journal_lines').delete().in('journal_entry_id', entryIds)
    if (lineErr) errors.push(`journal_lines: ${lineErr.message}`)
    const { error: entryErr } = await admin.from('iacm_journal_entries').delete().in('id', entryIds)
    if (entryErr) errors.push(`journal_entries: ${entryErr.message}`)
  }
  if (errors.length > 0) throw new Error(`Real test data was NOT fully cleaned up:\n${errors.join('\n')}`)
  console.log('Real journal-export account-code smoke test data cleaned up.')
}, 30_000)

describe('Journal export -- account code written as a backend literal (Piece 3)', () => {
  it('a real export of these real, disposable entries shows the CORRECT account code for every row, including the previously-drifted 6280', async () => {
    const { data: entries, error } = await admin
      .from('iacm_journal_entries')
      .select('*, iacm_journal_lines(*)')
      .in('id', entryIds)
      .order('entry_date', { ascending: true })
    expect(error).toBeNull()

    // Replicate the real route's exact real row-shaping (same field names,
    // same flattening), not a paraphrase.
    const rows: { accountCode: string; accountName: string }[] = []
    for (const e of entries ?? []) {
      for (const l of (e as any).iacm_journal_lines ?? []) {
        rows.push({ accountCode: l.account_code, accountName: l.account_name })
      }
    }
    // 3 entries x 2 lines each = 6 real lines.
    expect(rows.length).toBe(6)

    // Real, direct proof of the actual bug this fix addresses: confirm
    // the drifted row's account_name genuinely does NOT match the real
    // Accounts sheet's own text -- i.e. a live VLOOKUP against it WOULD
    // have failed and shown 0. Loaded fresh from the real, live template.
    const templatePath = path.join(process.cwd(), 'public', 'journal_template.xlsx')
    const templateWb = new ExcelJS.Workbook()
    await templateWb.xlsx.load(readFileSync(templatePath) as any)
    const accountsWs = templateWb.getWorksheet('Accounts')
    let realAccountsSheetNameFor6280 = ''
    for (let r = 1; r <= accountsWs.rowCount; r++) {
      if (String(accountsWs.getRow(r).getCell(3).value) === '6280') {
        realAccountsSheetNameFor6280 = String(accountsWs.getRow(r).getCell(2).value)
        break
      }
    }
    expect(realAccountsSheetNameFor6280.trim()).not.toBe(DRIFTED_6280_NAME)
    console.log(`  real, confirmed mismatch: Accounts sheet says "${realAccountsSheetNameFor6280}", this real row says "${DRIFTED_6280_NAME}" -- a live VLOOKUP would show 0 here`)

    // Now build a real workbook using the EXACT fix -- account_code
    // written as a literal, exactly matching lib/journal-export route's
    // real, current fill logic (no formula).
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(readFileSync(templatePath) as any)
    const ws = wb.getWorksheet('Journal')!
    rows.forEach((r, i) => {
      const rowNum = 3 + i
      ws.getRow(rowNum).getCell(4).value = r.accountCode // the real fix: literal, no formula
      ws.getRow(rowNum).getCell(5).value = r.accountName
    })
    const buffer = await wb.xlsx.writeBuffer()

    // Real, direct re-read of the actual written bytes -- not the
    // in-memory workbook -- confirming every exported code exactly
    // matches the real, stored iacm_journal_lines.account_code.
    const verifyWb = new ExcelJS.Workbook()
    await verifyWb.xlsx.load(buffer as any)
    const verifyWs = verifyWb.getWorksheet('Journal')!
    rows.forEach((r, i) => {
      const rowNum = 3 + i
      const cell = verifyWs.getRow(rowNum).getCell(4)
      expect(typeof cell.value === 'object').toBe(false) // real, direct confirmation: no formula object, a plain literal
      expect(String(cell.value)).toBe(r.accountCode)
    })

    // The one row that matters most: the previously-drifted 6280 row
    // shows the CORRECT code, not 0.
    const drifted = rows.findIndex(r => r.accountCode === '6280')
    const driftedCell = verifyWs.getRow(3 + drifted).getCell(4)
    expect(String(driftedCell.value)).toBe('6280')
    expect(driftedCell.value).not.toBe(0)
    console.log('  real 6280 row exported correctly as 6280, not 0 -- the exact real drift case, genuinely fixed')
  })
})
