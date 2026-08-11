import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
// @ts-ignore
import ExcelJS from 'exceljs'
import { requireAdminApi } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'journal_template.xlsx')
const JOURNAL_SHEET_NAME = 'Journal'
const DATA_START_ROW = 3

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
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const { data: entries } = await supabase
      .from('iacm_journal_entries')
      .select('*, iacm_journal_lines(*)')
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })

    const rows: JournalRow[] = []

    // No synthetic "Opening Balance" block here anymore — iacm_opening_balances
    // (the 30-Jun-2026 reconciled snapshot) is still the source getAccountBalance()
    // uses for every live balance figure (Total Assets, Retained Earnings, the
    // dashboard, this page's own trial-balance boxes), untouched by this change.
    // This export is purely the transaction-level record now: the real Jan-1,
    // 2026 opening position is already in here as an actual journal entry
    // (from the historical backfill), so a second, differently-dated opening
    // summary on top of it was redundant and confusing, not informative.

    // Journal entries — iacm_journal_entries is a header table (one row per
    // transaction); the actual debit/credit lines live in the related
    // iacm_journal_lines, embedded here. Each line becomes one Journal-sheet
    // row, all sharing the header's date/narration. Matches the same query
    // shape already used by the Journal list page (page.tsx).
    ;(entries ?? []).forEach((e: any) => {
      ;(e.iacm_journal_lines ?? []).forEach((l: any) => {
        rows.push({
          date: new Date(e.entry_date),
          narration: e.narration,
          accountCode: l.account_code,
          accountName: l.account_name,
          debit: Number(l.debit_amount ?? 0),
          credit: Number(l.credit_amount ?? 0),
        })
      })
    })

    const buf = fs.readFileSync(TEMPLATE_PATH)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as any)
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
    return new NextResponse(Buffer.from(buffer), {
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
