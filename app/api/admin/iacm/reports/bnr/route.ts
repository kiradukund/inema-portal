import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin'
// @ts-ignore
import ExcelJS from 'exceljs'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const quarter = req.nextUrl.searchParams.get('quarter') ?? 'Q3-2026'
    const supabase = createAdminClient()

    const { data: loans } = await supabase
      .from('iacm_loans').select('*, iacm_clients(*)')
      .in('status', ['active', 'completed'])

    const { data: payments } = await supabase
      .from('iacm_payments').select('*')

    const { data: expenses } = await supabase
      .from('iacm_expenses').select('*')

    const { data: openingBalances } = await supabase
      .from('iacm_opening_balances').select('*')

    const today = new Date()
    const allLoans = loans ?? []

    function getDaysOverdue(maturityDate: string, balance: number): number {
      if (balance <= 0) return -1
      const maturity = new Date(maturityDate)
      if (maturity >= today) return 0
      return Math.floor((today.getTime() - maturity.getTime()) / 86400000)
    }

    const normalLoans      = allLoans.filter(l => { const d = getDaysOverdue(l.maturity_date, Number(l.balance_outstanding)); return d === 0 })
    const watchLoans       = allLoans.filter(l => { const d = getDaysOverdue(l.maturity_date, Number(l.balance_outstanding)); return d >= 1 && d < 90 })
    const substandardLoans = allLoans.filter(l => { const d = getDaysOverdue(l.maturity_date, Number(l.balance_outstanding)); return d >= 90 && d < 180 })
    const doubtfulLoans    = allLoans.filter(l => { const d = getDaysOverdue(l.maturity_date, Number(l.balance_outstanding)); return d >= 180 && d < 360 })
    const lossLoans        = allLoans.filter(l => { const d = getDaysOverdue(l.maturity_date, Number(l.balance_outstanding)); return d >= 360 })

    const totalOutstanding = allLoans.reduce((s, l) => s + Number(l.balance_outstanding ?? 0), 0)
    const totalInterest    = (payments ?? []).reduce((s, p) => s + Number(p.interest_portion ?? 0), 0)
    const totalExpenses    = (expenses ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0)

    const obMap: Record<string, number> = {}
    ;(openingBalances ?? []).forEach((ob: any) => {
      obMap[ob.account_code] = Number(ob.debit_balance ?? 0) - Number(ob.credit_balance ?? 0)
    })

    const wb = new ExcelJS.Workbook()
    wb.creator = 'INEMA Financial Solutions Ltd'
    wb.created = today

    const NAVY  = '001F5B'
    const GOLD  = 'C9A84C'
    const LGREY = 'F2F2F2'
    const WHITE = 'FFFFFFFF'

    function addHeader(ws: any, row: number, col: number, val: string, bg = NAVY, fg = GOLD, bold = true, sz = 10) {
      const cell = ws.getCell(row, col)
      cell.value = val
      cell.font = { name: 'Arial', bold, color: { argb: 'FF' + fg }, size: sz }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    }

    function addVal(ws: any, row: number, col: number, val: any, bold = false, fmt = '#,##0') {
      const cell = ws.getCell(row, col)
      cell.value = val
      cell.font = { name: 'Arial', bold, size: 9 }
      cell.alignment = { horizontal: typeof val === 'number' ? 'right' : 'left', vertical: 'middle' }
      if (typeof val === 'number') cell.numFmt = fmt
    }

    // ── COVER SHEET ──────────────────────────────────────────────────────────
    const wsCover = wb.addWorksheet('Cover')
    wsCover.columns = [{ width: 5 }, { width: 40 }, { width: 35 }]
    addHeader(wsCover, 2, 2, 'NATIONAL BANK OF RWANDA', NAVY, GOLD, true, 14)
    addHeader(wsCover, 3, 2, 'REPORTING TEMPLATE — NON-DEPOSIT-TAKING FINANCIAL SERVICE PROVIDERS (Category III)', NAVY, 'FFFFFF', true, 11)
    addHeader(wsCover, 4, 2, `REPORTING PERIOD: ${quarter}`, NAVY, GOLD, true, 10)

    const coverInfo = [
      ['Institution Name:', 'INEMA Financial Solutions Ltd'],
      ['Report Date:', today.toLocaleDateString('en-RW')],
      ['Reporting Quarter:', quarter],
      ['Prepared By:', 'KUBWIMANA Devotha'],
      ['Phone:', '+250 788 834 132'],
      ['Email:', 'inemafinancialsolutionsltd@gmail.com'],
      ['Address:', '3rd Floor F3B-0A, Nyakabanda, Nyarugenge, Kigali'],
    ]
    coverInfo.forEach(([label, value], i) => {
      const r = 6 + i
      const c1 = wsCover.getCell(r, 2)
      c1.value = label; c1.font = { name: 'Arial', bold: true, size: 9 }
      c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
      const c2 = wsCover.getCell(r, 3)
      c2.value = value; c2.font = { name: 'Arial', size: 9 }
    })

    // ── A1.2 BALANCE SHEET ───────────────────────────────────────────────────
    const wsBS = wb.addWorksheet('A1.2. Balance Sheet')
    wsBS.columns = [{ width: 5 }, { width: 5 }, { width: 42 }, { width: 22 }, { width: 22 }]
    addHeader(wsBS, 1, 3, 'A1.2. BALANCE SHEET — INEMA Financial Solutions Ltd', NAVY, GOLD, true, 12)
    wsBS.mergeCells('C1:E1')
    addHeader(wsBS, 2, 3, 'Item', LGREY, '001F5B', true, 9)
    addHeader(wsBS, 2, 4, 'Current Quarter (RWF)', LGREY, '001F5B', true, 9)
    addHeader(wsBS, 2, 5, 'Previous Quarter (RWF)', LGREY, '001F5B', true, 9)

    const cashBank = obMap['3020'] ?? 1541804
    const cashVault = obMap['3010'] ?? 0
    const grossLoans = totalOutstanding
    const interestRec = obMap['3030'] ?? 1275153
    const otherRec = obMap['3040'] ?? 73370
    const prepaid = obMap['3050'] ?? 211864
    const caution = obMap['3060'] ?? 250000
    const ppe = obMap['3210'] ?? 2000000
    const paye = 164000, pension = 70000, maternity = 3000, cbhi = 1773, otherLiab = 27312
    const shareCapital = 30000000, retained = 1861374, currentProfit = totalInterest - totalExpenses

    const bsItems = [
      ['A. ASSETS', null, true, NAVY, GOLD],
      ['1. Cash in Vault', cashVault, false, LGREY, '001F5B'],
      ['2. Cash at Bank', cashBank, false, LGREY, '001F5B'],
      ['3. Gross Loans & Advances', grossLoans, false, LGREY, '001F5B'],
      ['4. Interest Receivable', interestRec, false, LGREY, '001F5B'],
      ['5. Other Receivables', otherRec, false, LGREY, '001F5B'],
      ['6. Prepaid Expenses', prepaid, false, LGREY, '001F5B'],
      ['7. Caution & Deposits', caution, false, LGREY, '001F5B'],
      ['8. Fixed Assets (Net)', ppe, false, LGREY, '001F5B'],
      ['TOTAL ASSETS', cashVault+cashBank+grossLoans+interestRec+otherRec+prepaid+caution+ppe, true, NAVY, GOLD],
      ['', null, false, WHITE, '000000'],
      ['B. LIABILITIES & EQUITY', null, true, NAVY, GOLD],
      ['1. PAYE Payable', paye, false, LGREY, '001F5B'],
      ['2. RSSB Pension Payable', pension, false, LGREY, '001F5B'],
      ['3. Maternity Payable', maternity, false, LGREY, '001F5B'],
      ['4. CBHI Payable', cbhi, false, LGREY, '001F5B'],
      ['5. Other Liabilities', otherLiab, false, LGREY, '001F5B'],
      ['Total Liabilities', paye+pension+maternity+cbhi+otherLiab, true, LGREY, '001F5B'],
      ['6. Share Capital', shareCapital, false, LGREY, '001F5B'],
      ['7. Retained Earnings', retained, false, LGREY, '001F5B'],
      ['8. Current Period Profit', currentProfit, false, LGREY, '001F5B'],
      ['Total Equity', shareCapital+retained+currentProfit, true, LGREY, '001F5B'],
      ['TOTAL LIABILITIES & EQUITY', paye+pension+maternity+cbhi+otherLiab+shareCapital+retained+currentProfit, true, NAVY, GOLD],
    ]

    bsItems.forEach(([label, value, bold, bg, fg], i) => {
      const r = i + 3
      const c = wsBS.getCell(r, 3)
      c.value = label
      c.font = { name: 'Arial', bold: bold as boolean, size: 9, color: { argb: 'FF' + fg } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }
      c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      if (value !== null) {
        const d = wsBS.getCell(r, 4)
        d.value = value
        d.font = { name: 'Arial', bold: bold as boolean, size: 9, color: { argb: 'FF' + fg } }
        d.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }
        d.numFmt = '#,##0'
        d.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    })

    // ── LOAN CLASSIFICATION SHEETS ───────────────────────────────────────────
    const loanHeaders = ['No.', 'Full Name', 'National ID', 'Phone', 'Gender', 'Age',
      'Marital Status', 'District', 'Loan Type', 'Disbursed Amount (RWF)',
      'Disbursement Date', 'Maturity Date', 'Frequency (days)', 'Grace Period',
      'First Payment Date', 'Principal Repaid (RWF)', 'Balance Outstanding (RWF)',
      'Days Overdue', 'Collateral Type', 'Loan Officer']

    const classSheets = [
      { name: 'A1.3. Normal Loans', loans: normalLoans, provRate: 0 },
      { name: 'A1.4. Watch (1-89d)', loans: watchLoans, provRate: 0.01 },
      { name: 'A1.5. Substandard', loans: substandardLoans, provRate: 0.20 },
      { name: 'A1.6. Doubtful', loans: doubtfulLoans, provRate: 0.50 },
      { name: 'A1.7. Loss (360+d)', loans: lossLoans, provRate: 1.00 },
    ]

    classSheets.forEach(({ name, loans: classLoans, provRate }) => {
      const ws = wb.addWorksheet(name)
      ws.columns = [
        { width: 5 }, { width: 4 }, { width: 22 }, { width: 16 }, { width: 10 },
        { width: 6 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 18 },
        { width: 14 }, { width: 14 }, { width: 12 }, { width: 10 }, { width: 14 },
        { width: 18 }, { width: 20 }, { width: 10 }, { width: 14 }, { width: 18 }
      ]

      const titleCell = ws.getCell(1, 2)
      titleCell.value = name
      titleCell.font = { name: 'Arial', bold: true, color: { argb: 'FF' + GOLD }, size: 12 }
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } }
      ws.mergeCells(1, 2, 1, 21)

      loanHeaders.forEach((h, i) => {
        const cell = ws.getCell(2, i + 2)
        cell.value = h
        cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 8 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      })
      ws.getRow(2).height = 40

      if (classLoans.length === 0) {
        ws.getCell(3, 2).value = 'No loans in this category for this reporting period'
        ws.getCell(3, 2).font = { name: 'Arial', italic: true, color: { argb: 'FF666666' }, size: 9 }
      }

      classLoans.forEach((l: any, i) => {
        const r = i + 3
        const client = l.iacm_clients ?? {}
        const daysOver = getDaysOverdue(l.maturity_date, Number(l.balance_outstanding))
        const rowData = [
          i + 1, client.full_name ?? '', client.national_id ?? '', client.phone ?? '',
          client.gender === 'male' ? 'M' : 'F', client.age ?? '',
          client.marital_status ?? '', client.district ?? '',
          l.loan_type ?? '', Number(l.disbursed_amount ?? 0),
          l.disbursement_date ? new Date(l.disbursement_date).toLocaleDateString('en-RW') : '',
          l.maturity_date ? new Date(l.maturity_date).toLocaleDateString('en-RW') : '',
          l.repayment_frequency_days ?? 30, l.grace_period_days ?? 0,
          l.first_payment_date ? new Date(l.first_payment_date).toLocaleDateString('en-RW') : '',
          Number(l.principal_repaid ?? 0), Number(l.balance_outstanding ?? 0),
          daysOver, l.collateral_type ?? 'Other assets', l.loan_officer ?? 'KUBWIMANA Devotha',
        ]
        rowData.forEach((v, j) => {
          const cell = ws.getCell(r, j + 2)
          cell.value = v
          cell.font = { name: 'Arial', size: 8 }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF9F9F9' : 'FFFFFFFF' } }
          cell.alignment = { horizontal: typeof v === 'number' ? 'right' : 'left', vertical: 'middle' }
          if (typeof v === 'number') cell.numFmt = '#,##0'
        })
      })

      // Totals row
      const tr = classLoans.length + 3
      const totalCell = ws.getCell(tr, 2)
      totalCell.value = 'TOTAL'
      totalCell.font = { name: 'Arial', bold: true, color: { argb: 'FF' + GOLD }, size: 9 }
      totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } }

      const totalDisbursed = classLoans.reduce((s: number, l: any) => s + Number(l.disbursed_amount ?? 0), 0)
      const totalRepaid = classLoans.reduce((s: number, l: any) => s + Number(l.principal_repaid ?? 0), 0)
      const totalOutstanding2 = classLoans.reduce((s: number, l: any) => s + Number(l.balance_outstanding ?? 0), 0)

      ;[[10, totalDisbursed], [16, totalRepaid], [17, totalOutstanding2]].forEach(([col, val]) => {
        const cell = ws.getCell(tr, col as number)
        cell.value = val
        cell.font = { name: 'Arial', bold: true, color: { argb: 'FF' + GOLD }, size: 9 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } }
        cell.numFmt = '#,##0'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      })
    })

    // ── A1.8 INCOME STATEMENT ────────────────────────────────────────────────
    const wsIS = wb.addWorksheet('A1.8. Income Statement')
    wsIS.columns = [{ width: 5 }, { width: 5 }, { width: 42 }, { width: 22 }, { width: 22 }]
    addHeader(wsIS, 1, 3, 'A1.8. INCOME STATEMENT — INEMA Financial Solutions Ltd', NAVY, GOLD, true, 12)
    wsIS.mergeCells('C1:E1')
    addHeader(wsIS, 2, 3, `Period: ${quarter}`, NAVY, 'FFFFFF', true, 9)
    wsIS.mergeCells('C2:E2')

    const expByCategory = (expenses ?? []).reduce((acc: any, e: any) => {
      acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount)
      return acc
    }, {})

    const isItems = [
      ['A. INCOME', null, true, NAVY, GOLD],
      ['1. Interest Income on Loans', totalInterest, false, LGREY, '001F5B'],
      ['2. Fees & Commission Income', 0, false, LGREY, '001F5B'],
      ['3. Penalty Income (Late Fees)', 0, false, LGREY, '001F5B'],
      ['TOTAL INCOME', totalInterest, true, NAVY, GOLD],
      ['', null, false, WHITE, '000000'],
      ['B. EXPENSES', null, true, NAVY, GOLD],
      ['1. Personnel Expenses', (expByCategory['personnel'] ?? 0), false, LGREY, '001F5B'],
      ['2. Rent & Utilities', (expByCategory['rent'] ?? 0), false, LGREY, '001F5B'],
      ['3. Communication', (expByCategory['communication'] ?? 0), false, LGREY, '001F5B'],
      ['4. Bank Charges', (expByCategory['bank_charges'] ?? 0), false, LGREY, '001F5B'],
      ['5. Stationery & Supplies', (expByCategory['stationery'] ?? 0), false, LGREY, '001F5B'],
      ['6. Transport & Travel', (expByCategory['transport'] ?? 0), false, LGREY, '001F5B'],
      ['7. Depreciation', (expByCategory['depreciation'] ?? 0), false, LGREY, '001F5B'],
      ['8. Other Expenses', (expByCategory['other'] ?? 0) + (expByCategory['petty_cash'] ?? 0), false, LGREY, '001F5B'],
      ['TOTAL EXPENSES', totalExpenses, true, NAVY, GOLD],
      ['', null, false, WHITE, '000000'],
      ['NET PROFIT / (LOSS)', totalInterest - totalExpenses, true, NAVY, GOLD],
    ]

    isItems.forEach(([label, value, bold, bg, fg], i) => {
      const r = i + 3
      const c = wsIS.getCell(r, 3)
      c.value = label
      c.font = { name: 'Arial', bold: bold as boolean, size: 9, color: { argb: 'FF' + fg } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }
      c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      if (value !== null) {
        const d = wsIS.getCell(r, 4)
        d.value = value
        d.font = { name: 'Arial', bold: bold as boolean, size: 9, color: { argb: 'FF' + fg } }
        d.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }
        d.numFmt = '#,##0'
        d.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    })

    // Generate buffer and return as file download
    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="INEMA_BNR_Report_${quarter}.xlsx"`,
      },
    })
  } catch (e: any) {
    console.error('BNR report error:', e)
    return NextResponse.json({ success: false, error: e?.message ?? 'Failed' }, { status: 500 })
  }
}
