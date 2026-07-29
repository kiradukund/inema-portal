import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
// @ts-ignore
import ExcelJS from 'exceljs'
import { requireAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'journal_template.xlsx')
const JOURNAL_SHEET_NAME = 'Journal'
const DATA_START_ROW = 3
// Opening balances are recorded as of the start of the current reporting
// quarter (Q3 2026 = 1 July 2026), matching the BNR report's default quarter.
const OPENING_BALANCE_DATE = new Date(2026, 6, 1)

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function monthLabel(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
}

function dayLabel(d: Date): string {
  return `${d.getDate()}-${MONTH_NAMES[d.getMonth()].slice(0, 3)}-${String(d.getFullYear()).slice(2)}`
}

interface JournalRow {
  date: Date
  narration: string
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

export async function GET() {
  try {
    await requireAdmin()
    const supabase = createAdminClient()

    const [{ data: openingBalances }, { data: entries }] = await Promise.all([
      supabase.from('iacm_opening_balances').select('*'),
      supabase.from('iacm_journal_entries').select('*').order('entry_date', { ascending: true }).order('created_at', { ascending: true }),
    ])

    const rows: JournalRow[] = []

    // Opening balances — one row per account, as of OPENING_BALANCE_DATE.
    // iacm_opening_balances doesn't carry an account_name column reliably in
    // all seed data, so fall back to the account code if it's missing.
    ;(openingBalances ?? []).forEach((ob: any) => {
      const debit = Number(ob.debit_balance ?? 0)
      const credit = Number(ob.credit_balance ?? 0)
      if (debit === 0 && credit === 0) return
      rows.push({
        date: OPENING_BALANCE_DATE,
        narration: 'Opening Balance',
        accountCode: ob.account_code,
        accountName: ob.account_name || ob.account_code,
        debit,
        credit,
      })
    })

    // Journal entries — iacm_journal_entries is a flat table where each row
    // is already one debit/credit line (no separate lines table), so each
    // row maps directly to one Journal-sheet row.
    ;(entries ?? []).forEach((e: any) => {
      rows.push({
        date: new Date(e.entry_date),
        narration: e.description,
        accountCode: e.account_code,
        accountName: e.account_name,
        debit: Number(e.debit ?? 0),
        credit: Number(e.credit ?? 0),
      })
    })

    const buf = fs.readFileSync(TEMPLATE_PATH)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.getWorksheet(JOURNAL_SHEET_NAME)
    if (!ws) throw new Error(`"${JOURNAL_SHEET_NAME}" sheet not found in journal_template.xlsx`)

    // Capture a style template from the first existing data row (if any)
    // before wiping it, so regenerated rows keep the template's look.
    const sampleRow = ws.getRow(DATA_START_ROW)
    const styleByCol: Record<number, any> = {}
    const numFmtByCol: Record<number, any> = {}
    for (let c = 1; c <= 7; c++) {
      const cell = sampleRow.getCell(c)
      styleByCol[c] = JSON.parse(JSON.stringify(cell.style || {}))
      numFmtByCol[c] = cell.numFmt
    }

    const clearEnd = Math.max(ws.rowCount, DATA_START_ROW + rows.length + 5)
    for (let r = DATA_START_ROW; r <= clearEnd; r++) {
      const row = ws.getRow(r)
      for (let c = 1; c <= 7; c++) row.getCell(c).value = null
    }

    rows.forEach((r, i) => {
      const rowNum = DATA_START_ROW + i
      const row = ws.getRow(rowNum)
      const values = [monthLabel(r.date), dayLabel(r.date), r.narration, r.accountCode, r.accountName, r.debit || null, r.credit || null]
      values.forEach((v, idx) => {
        const c = idx + 1
        const cell = row.getCell(c)
        cell.value = v
        cell.style = styleByCol[c]
        if (numFmtByCol[c]) cell.numFmt = numFmtByCol[c]
      })
    })

    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="INEMA_Journal_Q3_2026.xlsx"',
      },
    })
  } catch (e: any) {
    console.error('Journal export error:', e)
    return NextResponse.json({ success: false, error: e?.message ?? 'Failed' }, { status: 500 })
  }
}
