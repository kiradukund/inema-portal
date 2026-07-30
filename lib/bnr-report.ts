import fs from 'fs'
import path from 'path'
// @ts-ignore
import ExcelJS from 'exceljs'
import { createAdminClient } from './supabase'
import { getAccountBalance } from './ledger'

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'bnr_template.xlsx')

const LOAN_SHEET_NAMES = {
  normal: 'A1.3. Normal Loans ',
  watch: 'A1.4. Watch',
  substandard: 'A1.5. Substandard',
  doubtful: 'A1.6. Doubtful',
  loss: 'A1.7 Loss',
} as const

const CLASS_INFO: Record<keyof typeof LOAN_SHEET_NAMES, { classNumber: number; provRate: number }> = {
  normal: { classNumber: 1, provRate: 0 },
  watch: { classNumber: 2, provRate: 0.01 },
  substandard: { classNumber: 3, provRate: 0.2 },
  doubtful: { classNumber: 4, provRate: 0.5 },
  loss: { classNumber: 5, provRate: 1.0 },
}

// Maps the app's free-text economic sector choices to the 5 BNR-defined categories.
const ECONOMIC_SECTOR_MAP: Record<string, 'agriculture' | 'publicWorks' | 'commerce' | 'transport' | 'others'> = {
  'Agriculture': 'agriculture',
  'Construction': 'publicWorks',
  'Commerce & Trade': 'commerce',
  'Transport': 'transport',
  'Services': 'others',
  'Education': 'others',
  'Health': 'others',
  'Other': 'others',
}

// Column-header text -> semantic key. Order doesn't matter here since each
// predicate is specific enough not to collide with the others.
const COLUMN_MATCHERS: Array<[string, (t: string) => boolean]> = [
  ['no', t => t === 'no'],
  ['name', t => t.includes('names of borrowers')],
  ['nationalId', t => t.includes('id of the borrower')],
  ['phone', t => t.includes('telephone')],
  ['gender', t => t === 'gender'],
  ['age', t => t === 'age'],
  ['relationship', t => t.includes('relationship with the ndfsp')],
  ['marital', t => t.includes('marital status')],
  ['prevLoansPaid', t => t.includes('previous loans paid')],
  ['purpose', t => t.includes('purpose of the loan')],
  ['branch', t => t.includes('branch name')],
  ['collateralType', t => t === 'collateral type'],
  ['collateralAmount', t => t.includes('guarantee')],
  ['district', t => t.includes('district')],
  ['sector', t => t.includes('sector')],
  ['cell', t => t.includes('cell')],
  ['village', t => t.includes('village')],
  ['annualRate', t => t.includes('annual interest rate')],
  ['method', t => t.includes('method of interest')],
  ['officer', t => t.includes('loan officer')],
  ['disbursedAmount', t => t.includes('disbursed amount')],
  ['disbursementDate', t => t.includes('date of loan disbursement')],
  ['maturityDate', t => t.includes('maturity date')],
  ['freqDays', t => t.includes('frequency of repayment')],
  ['gracePeriod', t => t.includes('grace period')],
  ['firstPaymentDate', t => t.includes('date of first payment')],
  ['lastPaymentDate', t => t.includes('date of last payment')],
  ['arrearsStart', t => t.includes('arrears start')],
  ['cutOffDate', t => t.includes('cut off date')],
  ['totalInstallments', t => t.includes('total number of installments')],
  ['installmentsPaid', t => t.includes('installments') && t.includes('paid')],
  ['installmentsOutstanding', t => t.includes('installments outstanding')],
  ['amountRepaid', t => t.includes('amount repaid')],
  ['balanceOutstanding', t => t.includes('balance outstanding')],
  ['eligibleCollateral', t => t.includes('eligible collateral')],
  ['netAmountDue', t => t.includes('net amount due')],
  ['daysOverdue', t => t.includes('days overdue')],
  ['classCol', t => t === 'class'],
  ['provRateCol', t => t.includes('provisioning rate')],
  ['provRequired', t => t.includes('provision required')],
  ['prevProvisions', t => t.includes('previous provisions')],
  ['addlProvisions', t => t.includes('additional provisions')],
]

function norm(v: any): string {
  return String(v ?? '').trim().toLowerCase()
}

function findHeaderRow(ws: any): number {
  for (let r = 1; r <= 15; r++) {
    for (let c = 1; c <= 3; c++) {
      if (norm(ws.getRow(r).getCell(c).value) === 'names of borrowers') return r
    }
  }
  throw new Error(`Could not find "Names of Borrowers" header row in sheet ${ws.name}`)
}

function findDataStartRow(ws: any, headerRow: number): number {
  const next = norm(ws.getRow(headerRow + 1).getCell(1).value)
  return next.startsWith('column') ? headerRow + 2 : headerRow + 1
}

function buildColumnMap(ws: any, headerRow: number): Record<string, number> {
  const map: Record<string, number> = {}
  const row = ws.getRow(headerRow)
  for (let c = 1; c <= 60; c++) {
    const text = norm(row.getCell(c).value)
    if (!text) continue
    for (const [key, test] of COLUMN_MATCHERS) {
      if (map[key] !== undefined) continue
      if (test(text)) { map[key] = c; break }
    }
  }
  return map
}

function buildStyleTemplate(wb: any): Record<string, { style: any; numFmt: any }> {
  const ws = wb.getWorksheet(LOAN_SHEET_NAMES.normal)
  const headerRow = findHeaderRow(ws)
  const dataStart = findDataStartRow(ws, headerRow)
  const colMap = buildColumnMap(ws, headerRow)
  const sampleRow = ws.getRow(dataStart)
  const styles: Record<string, { style: any; numFmt: any }> = {}
  for (const [key, colIdx] of Object.entries(colMap)) {
    const cell = sampleRow.getCell(colIdx)
    styles[key] = { style: JSON.parse(JSON.stringify(cell.style || {})), numFmt: cell.numFmt }
  }
  return styles
}

function getDaysOverdue(maturityDate: string, balance: number, today: Date): number {
  if (balance <= 0) return -1
  const maturity = new Date(maturityDate)
  if (maturity >= today) return 0
  return Math.floor((today.getTime() - maturity.getTime()) / 86400000)
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d
}

function fillLoanSheet(
  wb: any,
  styleTemplate: Record<string, { style: any; numFmt: any }>,
  sheetKey: keyof typeof LOAN_SHEET_NAMES,
  loans: any[],
  reportDate: Date,
  today: Date
) {
  const ws = wb.getWorksheet(LOAN_SHEET_NAMES[sheetKey])
  const classInfo = CLASS_INFO[sheetKey]
  const headerRow = findHeaderRow(ws)
  const dataStart = findDataStartRow(ws, headerRow)
  const colMap = buildColumnMap(ws, headerRow)

  const clearEnd = Math.max(ws.rowCount, dataStart + loans.length + 5)
  for (let r = dataStart; r <= clearEnd; r++) {
    const row = ws.getRow(r)
    for (const colIdx of Object.values(colMap)) row.getCell(colIdx).value = null
  }

  loans.forEach((l, i) => {
    const r = dataStart + i
    const row = ws.getRow(r)
    const client = l.iacm_clients ?? {}
    const daysOverdue = Math.max(0, getDaysOverdue(l.maturity_date, Number(l.balance_outstanding), today))
    const balance = Number(l.balance_outstanding ?? 0)
    const paid = l.installments_paid ?? null
    const outstanding = l.installments_outstanding ?? null

    const prevLoansPaidText: Record<string, string> = { yes: 'yes', no: 'no', not_applicable: 'not applicable' }

    const values: Record<string, any> = {
      no: i + 1,
      name: client.full_name ?? '',
      nationalId: client.national_id ?? '',
      phone: client.phone ?? '',
      gender: client.gender ?? '',
      age: client.age ?? '',
      relationship: 'none',
      marital: client.marital_status ?? '',
      prevLoansPaid: prevLoansPaidText[client.previous_loans_paid] ?? 'not applicable',
      purpose: l.purpose ?? '',
      branch: 'Kigali, Nyarugenge',
      collateralType: l.collateral_type ?? '',
      collateralAmount: Number(l.collateral_amount ?? 0),
      district: client.district ?? '',
      sector: client.sector ?? '',
      cell: client.cell ?? '',
      village: client.village ?? '',
      annualRate: `${Math.round(Number(l.interest_rate ?? 0) * 12 * 100)}%`,
      method: l.interest_method === 'declining' ? 'Declining' : 'Flat',
      officer: l.loan_officer ?? '',
      disbursedAmount: Number(l.disbursed_amount ?? 0),
      disbursementDate: l.disbursement_date ? new Date(l.disbursement_date) : null,
      maturityDate: l.maturity_date ? new Date(l.maturity_date) : null,
      freqDays: `${l.repayment_frequency_days ?? 30} days`,
      gracePeriod: Number(l.grace_period_days ?? 0),
      firstPaymentDate: l.first_payment_date ? new Date(l.first_payment_date) : null,
      lastPaymentDate: (l.last_payment_date ?? l.first_payment_date) ? new Date(l.last_payment_date ?? l.first_payment_date) : null,
      arrearsStart: daysOverdue > 0 ? addDays(l.maturity_date, 1) : null,
      cutOffDate: reportDate,
      totalInstallments: paid != null && outstanding != null ? paid + outstanding : '',
      installmentsPaid: paid ?? 0,
      installmentsOutstanding: outstanding ?? '',
      amountRepaid: Number(l.principal_repaid ?? 0),
      balanceOutstanding: balance,
      eligibleCollateral: 0,
      netAmountDue: balance,
      daysOverdue,
      classCol: classInfo.classNumber,
      provRateCol: `${classInfo.provRate * 100}%`,
      provRequired: Math.round(balance * classInfo.provRate),
      prevProvisions: 0,
      addlProvisions: Math.round(balance * classInfo.provRate),
    }

    for (const [key, colIdx] of Object.entries(colMap)) {
      if (!(key in values)) continue
      const cell = row.getCell(colIdx)
      cell.value = values[key]
      const tmpl = styleTemplate[key]
      if (tmpl) {
        cell.style = tmpl.style
        if (tmpl.numFmt) cell.numFmt = tmpl.numFmt
      }
    }
  })
}

const FS_SHEET_NAME = 'A1.2. FS'
const FS_LABEL_COL = 3
const FS_FIRST_QUARTER_COL = 4

function quarterLabel(quarter: string): string {
  const [q, y] = quarter.split('-')
  const month: Record<string, string> = { Q1: 'Mar', Q2: 'Jun', Q3: 'Sep', Q4: 'Dec' }
  return `${month[q]}-${y.slice(2)}`
}

function quarterRange(quarter: string): { start: Date; end: Date } {
  const [q, yStr] = quarter.split('-')
  const y = Number(yStr)
  const startMonth: Record<string, number> = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 }
  const start = new Date(y, startMonth[q], 1)
  const end = new Date(y, startMonth[q] + 3, 0, 23, 59, 59)
  return { start, end }
}

function inRange(dateStr: string | null | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d >= start && d <= end
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// Quarter header cells (e.g. "Sep-26") are stored as real Date values with a
// display format, not strings — compare on month/year, not raw text.
function cellQuarterLabel(val: any): string {
  if (val instanceof Date) return `${MONTHS[val.getMonth()]}-${String(val.getFullYear()).slice(2)}`
  return norm(val)
}

function findOrCreateQuarterColumn(ws: any, label: string): number {
  const headerRowIdx = 3
  const headerRow = ws.getRow(headerRowIdx)
  let lastCol = FS_FIRST_QUARTER_COL - 1
  for (let c = FS_FIRST_QUARTER_COL; c <= 30; c++) {
    const val = headerRow.getCell(c).value
    if (!val) break
    if (cellQuarterLabel(val) === label.toLowerCase()) return c
    lastCol = c
  }
  const newCol = lastCol + 1
  const prevCell = headerRow.getCell(lastCol)
  const newCell = headerRow.getCell(newCol)
  newCell.value = label
  newCell.style = JSON.parse(JSON.stringify(prevCell.style || {}))
  return newCol
}

function buildItemRowMap(ws: any): Record<number, number> {
  const map: Record<number, number> = {}
  for (let r = 4; r <= 140; r++) {
    const text = String(ws.getCell(r, FS_LABEL_COL).value ?? '')
    const m = text.match(/(\d+)\s*\./)
    if (m) {
      const n = Number(m[1])
      if (!(n in map)) map[n] = r
    }
  }
  return map
}

function writeFsValue(ws: any, itemRows: Record<number, number>, col: number, itemNumber: number, value: number) {
  const row = itemRows[itemNumber]
  if (!row) return
  const cell = ws.getCell(row, col)
  cell.value = Math.round(value)
  cell.numFmt = '#,##0'
}

async function loadTemplate(): Promise<any> {
  const buf = fs.readFileSync(TEMPLATE_PATH)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as any)
  return wb
}

export async function generateBnrReport(quarter: string): Promise<Buffer> {
  const supabase = createAdminClient()

  const { data: loans } = await supabase.from('iacm_loans').select('*, iacm_clients(*)')
  const { data: payments } = await supabase.from('iacm_payments').select('*')
  const { data: expenses } = await supabase.from('iacm_expenses').select('*')

  const allLoans = loans ?? []
  const allPayments = payments ?? []
  const allExpenses = expenses ?? []
  const today = new Date()
  const { start: qStart, end: qEnd } = quarterRange(quarter)
  const reportDate = qEnd

  // Ledger balances (opening balance + journal movements up to the quarter
  // end) for the non-loan balance sheet accounts. null means the account has
  // no opening balance row and no journal entries yet — genuinely untracked,
  // so the corresponding FS row is left untouched rather than zeroed.
  const ledgerCodes = ['3010', '3020', '3030', '3040', '3050', '3060', '3210']
  const ledgerBalances = await Promise.all(ledgerCodes.map(code => getAccountBalance(code, qEnd)))
  const obMap: Record<string, number | null> = {}
  ledgerCodes.forEach((code, i) => { obMap[code] = ledgerBalances[i] })

  const dayBucket = (l: any) => getDaysOverdue(l.maturity_date, Number(l.balance_outstanding), today)
  const buckets: Record<keyof typeof LOAN_SHEET_NAMES, any[]> = {
    normal: allLoans.filter(l => dayBucket(l) === 0),
    watch: allLoans.filter(l => { const d = dayBucket(l); return d >= 1 && d < 90 }),
    substandard: allLoans.filter(l => { const d = dayBucket(l); return d >= 90 && d < 180 }),
    doubtful: allLoans.filter(l => { const d = dayBucket(l); return d >= 180 && d < 360 }),
    loss: allLoans.filter(l => dayBucket(l) >= 360),
  }

  const wb = await loadTemplate()
  const styleTemplate = buildStyleTemplate(wb)
  ;(Object.keys(LOAN_SHEET_NAMES) as Array<keyof typeof LOAN_SHEET_NAMES>).forEach(key => {
    fillLoanSheet(wb, styleTemplate, key, buckets[key], reportDate, today)
  })

  // ── A1.2. FS sheet ─────────────────────────────────────────────────────
  const wsFS = wb.getWorksheet(FS_SHEET_NAME)
  const col = findOrCreateQuarterColumn(wsFS, quarterLabel(quarter))
  const itemRows = buildItemRowMap(wsFS)

  const outstandingLoans = allLoans.filter(l => Number(l.balance_outstanding) > 0)
  const disbursedThisQuarter = allLoans.filter(l => inRange(l.disbursement_date, qStart, qEnd))
  const paymentsThisQuarter = allPayments.filter(p => inRange(p.payment_date, qStart, qEnd))
  const expensesThisQuarter = allExpenses.filter(e => inRange(e.expense_date, qStart, qEnd))

  const sumBy = (arr: any[], pick: (x: any) => number) => arr.reduce((s, x) => s + pick(x), 0)
  const sumWhere = (arr: any[], test: (x: any) => boolean, pick: (x: any) => number) =>
    sumBy(arr.filter(test), pick)
  const genderOf = (l: any) => l.iacm_clients?.gender
  const sectorOf = (l: any) => ECONOMIC_SECTOR_MAP[l.economic_sector] ?? 'others'

  // Balance sheet — only rows with a real ledger data source.
  if (obMap['3010'] !== null) writeFsValue(wsFS, itemRows, col, 2, obMap['3010']!)
  if (obMap['3020'] !== null) writeFsValue(wsFS, itemRows, col, 3, obMap['3020']!)
  writeFsValue(wsFS, itemRows, col, 5, sumBy(allLoans, l => Number(l.balance_outstanding ?? 0)))
  if (obMap['3210'] !== null) writeFsValue(wsFS, itemRows, col, 10, obMap['3210']!)
  if (obMap['3030'] !== null) writeFsValue(wsFS, itemRows, col, 11, obMap['3030']!)
  if (obMap['3040'] !== null || obMap['3050'] !== null || obMap['3060'] !== null) {
    writeFsValue(wsFS, itemRows, col, 12, (obMap['3040'] ?? 0) + (obMap['3050'] ?? 0) + (obMap['3060'] ?? 0))
  }

  // Income statement — quarter-period flows only, not cumulative.
  const interestIncome = sumBy(paymentsThisQuarter, p => Number(p.interest_portion ?? 0))
  const feesIncome = sumBy(paymentsThisQuarter, p => Number(p.fee_portion ?? 0))
  const bankCharges = sumWhere(expensesThisQuarter, e => e.category === 'bank_charges', e => Number(e.amount ?? 0))
  const personnel = sumWhere(expensesThisQuarter, e => e.category === 'personnel', e => Number(e.amount ?? 0))
  const adminCategories = ['rent', 'communication', 'stationery', 'transport', 'advertising', 'legal', 'maintenance', 'tax', 'other', 'petty_cash', 'depreciation']
  const admin = sumWhere(expensesThisQuarter, e => adminCategories.includes(e.category), e => Number(e.amount ?? 0))

  const financialIncome = interestIncome + feesIncome
  const totalIncome = financialIncome
  const financialExpenses = bankCharges
  const totalExpenses = financialExpenses + personnel + admin
  const profitBeforeDonations = totalIncome - totalExpenses

  writeFsValue(wsFS, itemRows, col, 32, interestIncome)
  writeFsValue(wsFS, itemRows, col, 33, feesIncome)
  writeFsValue(wsFS, itemRows, col, 31, financialIncome)
  writeFsValue(wsFS, itemRows, col, 41, totalIncome)
  writeFsValue(wsFS, itemRows, col, 45, bankCharges)
  writeFsValue(wsFS, itemRows, col, 42, financialExpenses)
  writeFsValue(wsFS, itemRows, col, 48, personnel)
  writeFsValue(wsFS, itemRows, col, 49, admin)
  writeFsValue(wsFS, itemRows, col, 51, totalExpenses)
  writeFsValue(wsFS, itemRows, col, 52, profitBeforeDonations)
  writeFsValue(wsFS, itemRows, col, 25, profitBeforeDonations)

  // Supplementary — loans outstanding by gender.
  const menOutstanding = outstandingLoans.filter(l => genderOf(l) === 'male')
  const womenOutstanding = outstandingLoans.filter(l => genderOf(l) === 'female')
  writeFsValue(wsFS, itemRows, col, 61, menOutstanding.length)
  writeFsValue(wsFS, itemRows, col, 62, womenOutstanding.length)
  writeFsValue(wsFS, itemRows, col, 66, sumBy(menOutstanding, l => Number(l.balance_outstanding ?? 0)))
  writeFsValue(wsFS, itemRows, col, 67, sumBy(womenOutstanding, l => Number(l.balance_outstanding ?? 0)))

  // Supplementary — loans outstanding by economic sector.
  const sectorItem: Record<string, number> = { agriculture: 71, publicWorks: 72, commerce: 73, transport: 74, others: 75 }
  for (const [sector, itemNum] of Object.entries(sectorItem)) {
    writeFsValue(wsFS, itemRows, col, itemNum, sumWhere(outstandingLoans, l => sectorOf(l) === sector, l => Number(l.balance_outstanding ?? 0)))
  }

  // Supplementary — loan classification (outstanding balances by bucket).
  const classItem: Record<keyof typeof LOAN_SHEET_NAMES, number> = { normal: 78, watch: 79, substandard: 80, doubtful: 81, loss: 82 }
  for (const [key, itemNum] of Object.entries(classItem) as Array<[keyof typeof LOAN_SHEET_NAMES, number]>) {
    writeFsValue(wsFS, itemRows, col, itemNum, sumBy(buckets[key], l => Number(l.balance_outstanding ?? 0)))
  }

  // Supplementary — loans disbursed this quarter, by gender.
  const menDisbursed = disbursedThisQuarter.filter(l => genderOf(l) === 'male')
  const womenDisbursed = disbursedThisQuarter.filter(l => genderOf(l) === 'female')
  writeFsValue(wsFS, itemRows, col, 86, menDisbursed.length)
  writeFsValue(wsFS, itemRows, col, 87, womenDisbursed.length)
  writeFsValue(wsFS, itemRows, col, 91, sumBy(menDisbursed, l => Number(l.disbursed_amount ?? 0)))
  writeFsValue(wsFS, itemRows, col, 92, sumBy(womenDisbursed, l => Number(l.disbursed_amount ?? 0)))

  // Supplementary — loans disbursed this quarter, by economic sector.
  const sectorDisbursedItem: Record<string, number> = { agriculture: 96, publicWorks: 97, commerce: 98, transport: 99, others: 100 }
  for (const [sector, itemNum] of Object.entries(sectorDisbursedItem)) {
    writeFsValue(wsFS, itemRows, col, itemNum, sumWhere(disbursedThisQuarter, l => sectorOf(l) === sector, l => Number(l.disbursed_amount ?? 0)))
  }

  // Supplementary — women-borrower financing summary (rows 113-117 track individual
  // women borrowers, confirmed against sample data matching rows 92/67 exactly).
  writeFsValue(wsFS, itemRows, col, 113, womenDisbursed.length)
  writeFsValue(wsFS, itemRows, col, 114, womenOutstanding.length)
  writeFsValue(wsFS, itemRows, col, 115, sumBy(womenDisbursed, l => Number(l.disbursed_amount ?? 0)))
  writeFsValue(wsFS, itemRows, col, 116, sumBy(womenOutstanding, l => Number(l.balance_outstanding ?? 0)))
  writeFsValue(wsFS, itemRows, col, 117, womenOutstanding.length)

  const buffer: Buffer = await wb.xlsx.writeBuffer()
  return buffer
}
