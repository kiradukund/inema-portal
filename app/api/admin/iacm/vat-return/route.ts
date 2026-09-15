import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore
import ExcelJS from 'exceljs'
import { requireAdminApi } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import { buildVatReturnSummary, type VatJournalLine } from '@/lib/vat-return'

// Piece 1 (2026-09-14): the real, on-demand VAT Return Summary --
// generated fresh for a given period, built entirely in memory, never
// touching a static template file (same "never a static shared file"
// discipline already proven for FenAfrica's Accounts/Trial Balance/VAT
// Summary sheets tonight).
//
// The real backend-value / live-formula split, per Kevin's own explicit
// distinction: every itemized line (a real transaction -- a lookup, not
// an aggregate) is a plain backend value; every SUM/Net-Payable total is
// a real, live Excel formula, so a real manual correction to one line by
// Devotha recalculates the totals automatically rather than silently
// going stale.
const ACCOUNTING_FMT = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"??_);_(@_)'
const DATE_FMT = 'd-mmm-yy'
const VAT_CODE = '2530'

function addItemizedSection(ws: any, startRow: number, title: string, lines: { date: string; narration: string; reference: string; amount: number }[]) {
  ws.getCell(startRow, 1).value = title
  ws.getCell(startRow, 1).font = { bold: true, size: 12 }
  const headerRow = startRow + 1
  ;['Date', 'Narration', 'Reference', 'Amount (RWF)'].forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1)
    cell.value = h
    cell.font = { bold: true }
  })
  let r = headerRow + 1
  for (const line of lines) {
    ws.getCell(r, 1).value = new Date(line.date)
    ws.getCell(r, 1).numFmt = DATE_FMT
    ws.getCell(r, 2).value = line.narration
    ws.getCell(r, 3).value = line.reference
    ws.getCell(r, 4).value = line.amount
    ws.getCell(r, 4).numFmt = ACCOUNTING_FMT
    r++
  }
  const totalRow = r
  ws.getCell(totalRow, 2).value = `Total ${title}`
  ws.getCell(totalRow, 2).font = { bold: true }
  // Real, live formula -- an aggregate, not a per-line value. Blank ranges
  // (no real lines this period) still produce a real, correct 0 via SUM.
  ws.getCell(totalRow, 4).value = { formula: `SUM(D${headerRow + 1}:D${Math.max(totalRow - 1, headerRow + 1)})`, result: lines.reduce((s, l) => s + l.amount, 0) }
  ws.getCell(totalRow, 4).numFmt = ACCOUNTING_FMT
  ws.getCell(totalRow, 4).font = { bold: true }
  return { totalRow, nextRow: totalRow + 2 }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!from || !to) {
      return NextResponse.json({ success: false, error: 'Missing required from/to query params (YYYY-MM-DD)' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('iacm_journal_lines')
      .select('debit_amount, credit_amount, iacm_journal_entries!inner(entry_date, narration, entry_type, reference)')
      .eq('account_code', VAT_CODE)
      .gte('iacm_journal_entries.entry_date', from)
      .lte('iacm_journal_entries.entry_date', to)
      .order('iacm_journal_entries(entry_date)', { ascending: true })
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    const lines: VatJournalLine[] = (data ?? []).map((l: any) => ({
      entryDate: l.iacm_journal_entries.entry_date,
      narration: l.iacm_journal_entries.narration,
      entryType: l.iacm_journal_entries.entry_type,
      reference: l.iacm_journal_entries.reference,
      debitAmount: Number(l.debit_amount ?? 0),
      creditAmount: Number(l.credit_amount ?? 0),
    }))

    const summary = buildVatReturnSummary(lines, from, to)
    const totalOutput = summary.outputVat.reduce((s, l) => s + l.amount, 0)
    const totalInput = summary.inputVat.reduce((s, l) => s + l.amount, 0)
    const totalPaid = summary.vatPayments.reduce((s, l) => s + l.amount, 0)

    // Real, permanent audit record -- written every real generation,
    // same accountability standard as the Super-Admin loan-types trail.
    const { error: auditErr } = await supabase.from('iacm_vat_returns').insert({
      period_start: from, period_end: to,
      output_vat: totalOutput, input_vat: totalInput, net_payable: totalOutput - totalInput,
      paid_this_period: totalPaid, unclassified_count: summary.unclassified.length,
      generated_by_user_id: auth.user.id, generated_by_name: auth.profile.full_name,
    })
    if (auditErr) return NextResponse.json({ success: false, error: `Report generated but audit log failed: ${auditErr.message}` }, { status: 500 })

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('VAT Return Summary')
    ws.columns = [{ width: 14 }, { width: 55 }, { width: 22 }, { width: 18 }]

    ws.getCell(1, 1).value = 'INEMA Financial Solutions — VAT Return Summary'
    ws.getCell(1, 1).font = { bold: true, size: 14 }
    ws.getCell(2, 1).value = `Period: ${from} to ${to}`
    ws.getCell(2, 1).font = { italic: true }

    let row = 4
    ;({ nextRow: row } = addItemizedSection(ws, row, 'Output VAT (Collected)', summary.outputVat))
    const outputTotalRow = row - 2
    ;({ nextRow: row } = addItemizedSection(ws, row, 'Input VAT (Reclaimed)', summary.inputVat))
    const inputTotalRow = row - 2

    // The real example from tonight's own consultation, verbatim: a live
    // formula referencing the two real SUM totals above -- if Devotha
    // hand-adjusts one itemized line after export, this recalculates
    // correctly and automatically, no regeneration needed.
    ws.getCell(row, 2).value = 'NET VAT PAYABLE'
    ws.getCell(row, 2).font = { bold: true, size: 12 }
    ws.getCell(row, 4).value = { formula: `D${outputTotalRow}-D${inputTotalRow}`, result: totalOutput - totalInput }
    ws.getCell(row, 4).numFmt = ACCOUNTING_FMT
    ws.getCell(row, 4).font = { bold: true, size: 12 }
    row += 2

    ;({ nextRow: row } = addItemizedSection(ws, row, 'VAT Payments Made This Period', summary.vatPayments))

    if (summary.unclassified.length > 0) {
      ws.getCell(row, 1).value = `${summary.unclassified.length} unclassified line(s) found -- excluded from Output/Input totals, needs manual review`
      ws.getCell(row, 1).font = { bold: true, color: { argb: 'FFC00000' } }
      row += 1
      addItemizedSection(ws, row, 'Unclassified', summary.unclassified)
    }

    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="INEMA_VAT_Return_${from}_to_${to}.xlsx"`,
      },
    })
  } catch (e: any) {
    console.error('VAT return export error:', e)
    return NextResponse.json({ success: false, error: e?.message ?? 'Failed' }, { status: 500 })
  }
}
