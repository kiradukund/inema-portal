// @ts-ignore
import ExcelJS from 'exceljs'
import { createAdminClient } from './supabase'
import { getAccountBalance } from './ledger'

// Built entirely from a fresh ExcelJS.Workbook() — no template file is ever
// read. The prior approach (loading public/bnr_template.xlsx and modifying
// it) kept triggering Excel's "we found a problem with some content" repair
// dialog even after stripping the Excel Tables that caused it; a repair
// warning on a document going to a financial regulator isn't something to
// tolerate, so this version has zero inherited OOXML state to go wrong.
// Scope note: this is a simplified 6-sheet balance-sheet-focused rebuild —
// no income statement, no gender/sector supplementary stats, and no
// Explanatory Note / Restructured / Written-Off sheets, unlike the real BNR
// template or the previous template-based version of this file.

const LOAN_SHEET_NAMES = {
  normal: 'A1.3. Normal Loans ',
  watch: 'A1.4. Watch ',
  substandard: 'A1.5. Substandard ',
  doubtful: 'A1.6. Doubtful ',
  loss: 'A1.7. Loss ',
} as const

const CLASS_INFO: Record<keyof typeof LOAN_SHEET_NAMES, { classNumber: number; provRate: number }> = {
  normal: { classNumber: 1, provRate: 0 },
  watch: { classNumber: 2, provRate: 0.01 },
  substandard: { classNumber: 3, provRate: 0.2 },
  doubtful: { classNumber: 4, provRate: 0.5 },
  loss: { classNumber: 5, provRate: 1.0 },
}

const NAVY = 'FF001F5B'
const WHITE = 'FFFFFFFF'
const ZEBRA = 'FFF9F9F9'

function applyHeaderStyle(cell: any) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  cell.font = { color: { argb: WHITE }, bold: true, size: 10 }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
}

function applyZebraRow(row: any, colCount: number, rowIndexInData: number) {
  const bg = rowIndexInData % 2 === 0 ? ZEBRA : WHITE
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    if (!cell.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
  }
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

// ── Loan classification sheets ────────────────────────────────────────────

const LOAN_HEADERS = [
  'No.', 'Names of Borrowers', 'National ID/Passport No.', 'Telephone No.', 'Gender', 'Age',
  'Relationship with NDFSP', 'Marital Status', 'Previous Loans Paid on Time', 'Purpose of Loan',
  'Branch', 'Type of Collateral', 'Amount of Collateral', 'District', 'Sector', 'Cell', 'Village',
  'Annual Interest Rate', 'Interest Calculation Method', 'Loan Officer', 'Amount Disbursed',
  'Date of Disbursement', 'Date of Maturity', 'Agreed Frequency of Repayment in Days',
  'Grace Period in Days', 'Agreed Date of First Payment', 'Date of Last Payment',
  'Date Arrears Started', 'Cut-Off Date', 'Total No. of Agreed Installments',
  'No. of Installments Paid', 'No. of Installments Outstanding', 'Principal Repaid',
  'Balance Outstanding', 'Eligible Collateral', 'Net Amount at Risk', 'Days in Arrears',
  'Classification', 'Provision Rate', 'Provision Required', 'Previous Provisions',
  'Additional Provisions Required',
]

// Same order as LOAN_HEADERS — index i's header is filled from values[LOAN_FIELD_KEYS[i]].
const LOAN_FIELD_KEYS = [
  'no', 'name', 'nationalId', 'phone', 'gender', 'age', 'relationship', 'marital', 'prevLoansPaid', 'purpose',
  'branch', 'collateralType', 'collateralAmount', 'district', 'sector', 'cell', 'village', 'annualRate', 'method', 'officer',
  'disbursedAmount', 'disbursementDate', 'maturityDate', 'freqDays', 'gracePeriod', 'firstPaymentDate', 'lastPaymentDate', 'arrearsStart', 'cutOffDate', 'totalInstallments',
  'installmentsPaid', 'installmentsOutstanding', 'amountRepaid', 'balanceOutstanding', 'eligibleCollateral', 'netAmountDue', 'daysOverdue', 'classCol', 'provRateCol', 'provRequired',
  'prevProvisions', 'addlProvisions',
]

const LOAN_COLUMN_WIDTHS = [
  5, 22, 17, 13, 8, 6, 16, 12, 15, 20,
  14, 15, 14, 12, 12, 12, 12, 10, 13, 18,
  13, 13, 13, 14, 11, 14, 13, 13, 11, 12,
  10, 10, 13, 15, 12, 14, 10, 10, 11, 14,
  12, 14,
]

const HEADER_ROW = 10
const DATA_START_ROW = 12

function buildLoanSheet(
  wb: any,
  sheetName: string,
  classInfo: { classNumber: number; provRate: number },
  loans: any[],
  reportDate: Date,
  today: Date
) {
  const ws = wb.addWorksheet(sheetName)
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }]

  LOAN_COLUMN_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  ws.getCell(2, 1).value = 'NDFSP Name: INEMA FINANCIAL SOLUTIONS Ltd'
  ws.getCell(4, 1).value = `Report Name: Loan Classification Report (${sheetName.replace(/^A1\.\d\.\s*/, '').trim().toUpperCase()})`

  const headerRow = ws.getRow(HEADER_ROW)
  LOAN_HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    applyHeaderStyle(cell)
  })
  headerRow.height = 42

  loans.forEach((l, i) => {
    const r = DATA_START_ROW + i
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

    LOAN_FIELD_KEYS.forEach((key, idx) => {
      const cell = row.getCell(idx + 1)
      const v = values[key]
      cell.value = v
      if (typeof v === 'number') cell.numFmt = '#,##0'
      else if (v instanceof Date) cell.numFmt = 'dd/mm/yyyy'
    })
    applyZebraRow(row, LOAN_HEADERS.length, i)
  })
}

// ── FS (balance sheet) sheet ───────────────────────────────────────────────

const FS_SHEET_NAME = 'A1.2. FS'
const FS_LABEL_COL = 3
const FS_FIRST_QUARTER_COL = 4 // D
const FS_QUARTER_COUNT = 5 // D..H, last one (H) is always the live/requested quarter

const FS_ROW_LABELS = [
  'Cash in Vault', 'Cash at Bank', 'Term Deposits', 'Gross Loans', 'Loan Loss Provisions',
  'Net Loans', 'NPLs', 'Fixed Assets (Gross)', 'Accumulated Depreciation', 'Net Fixed Assets',
  'Interest Receivable', 'Other Assets', 'TOTAL ASSETS', 'Total Liabilities', 'Total Equity',
  'Retained Profits', 'Profit for Period', 'Paid-up Capital', 'Total Equity & Liabilities',
]
const FS_FIRST_ROW = 6
const BOLD_ROWS = new Set(['TOTAL ASSETS', 'Total Equity & Liabilities'])

// Real historical figures from the official BNR master file (as last filed),
// keyed by the quarter label they belong to. Only line items that were
// actually populated in that filing are included — everything else for a
// historical quarter is left blank rather than guessed.
const HISTORICAL_FS_DATA: Record<string, Partial<Record<string, number>>> = {
  'Sep-25': {
    'Cash at Bank': 9076162, 'Gross Loans': 20200000, 'Fixed Assets (Gross)': 2500000,
    'Accumulated Depreciation': 0, 'Interest Receivable': 2138440, 'Other Assets': 535234,
    'Paid-up Capital': 30000000,
  },
  'Dec-25': {
    'Cash at Bank': 11440671, 'Gross Loans': 19924960, 'Fixed Assets (Gross)': 2500000,
    'Accumulated Depreciation': 500000, 'Interest Receivable': 1405000,
    'Paid-up Capital': 30000000,
  },
  'Mar-26': {
    'Cash in Vault': 11500, 'Cash at Bank': 3975464, 'Fixed Assets (Gross)': 2500000,
    'Accumulated Depreciation': 500000, 'Interest Receivable': 50000,
    'Paid-up Capital': 30000000,
  },
  'Jun-26': {
    'Cash at Bank': 1541804, 'Fixed Assets (Gross)': 2500000, 'Accumulated Depreciation': 500000,
    'Interest Receivable': 1275153, 'Other Assets': 879680, 'Retained Profits': 1861374,
    'Paid-up Capital': 30000000,
  },
}
Object.values(HISTORICAL_FS_DATA).forEach(row => {
  if (row['Fixed Assets (Gross)'] != null && row['Accumulated Depreciation'] != null) {
    row['Net Fixed Assets'] = row['Fixed Assets (Gross)'] - row['Accumulated Depreciation']
  }
})

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

// Steps a "Mon-YY" label back by 3 months, so the FS sheet's 5 columns
// always end with the requested quarter in column H, regardless of which
// quarter is actually being generated.
function stepQuarterLabelBack(label: string, stepsBack: number): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [monStr, yyStr] = label.split('-')
  let monthIdx = MONTHS.indexOf(monStr)
  let year = 2000 + Number(yyStr)
  let totalMonths = year * 12 + monthIdx - stepsBack * 3
  const newYear = Math.floor(totalMonths / 12)
  const newMonth = ((totalMonths % 12) + 12) % 12
  return `${MONTHS[newMonth]}-${String(newYear).slice(2)}`
}

function buildFsSheet(wb: any, requestedLabel: string, liveValues: Record<string, number | null>) {
  const ws = wb.addWorksheet(FS_SHEET_NAME)
  ws.views = [{ state: 'frozen', ySplit: 3 }]

  ws.getColumn(FS_LABEL_COL).width = 34
  for (let c = FS_FIRST_QUARTER_COL; c < FS_FIRST_QUARTER_COL + FS_QUARTER_COUNT; c++) ws.getColumn(c).width = 16

  ws.getCell(1, 1).value = 'NAME OF THE NDFSP: INEMA FINANCIAL SOLUTIONS LTD'
  ws.getCell(2, 1).value = 'DISTRICT: NYARUGENGE'

  const quarterLabels: string[] = []
  for (let i = FS_QUARTER_COUNT - 1; i >= 0; i--) quarterLabels.push(stepQuarterLabelBack(requestedLabel, i))

  const headerRow = ws.getRow(3)
  const denomCell = headerRow.getCell(FS_LABEL_COL)
  denomCell.value = 'DENOMINATION'
  applyHeaderStyle(denomCell)
  quarterLabels.forEach((label, i) => {
    const cell = headerRow.getCell(FS_FIRST_QUARTER_COL + i)
    cell.value = label
    applyHeaderStyle(cell)
  })
  headerRow.height = 22

  FS_ROW_LABELS.forEach((label, i) => {
    const r = FS_FIRST_ROW + i
    const row = ws.getRow(r)
    const labelCell = row.getCell(FS_LABEL_COL)
    labelCell.value = label
    if (BOLD_ROWS.has(label)) labelCell.font = { bold: true }

    quarterLabels.forEach((qLabel, qi) => {
      const col = FS_FIRST_QUARTER_COL + qi
      const isLiveColumn = qLabel === requestedLabel && qi === quarterLabels.length - 1
      const value = isLiveColumn ? liveValues[label] : HISTORICAL_FS_DATA[qLabel]?.[label]
      const cell = row.getCell(col)
      if (value !== null && value !== undefined) {
        cell.value = Math.round(value)
        cell.numFmt = '#,##0'
        if (BOLD_ROWS.has(label)) cell.font = { bold: true }
      }
    })
    applyZebraRow(row, FS_FIRST_QUARTER_COL + FS_QUARTER_COUNT - 1, i)
  })
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

  const dayBucket = (l: any) => getDaysOverdue(l.maturity_date, Number(l.balance_outstanding), today)
  const buckets: Record<keyof typeof LOAN_SHEET_NAMES, any[]> = {
    normal: allLoans.filter(l => dayBucket(l) === 0),
    watch: allLoans.filter(l => { const d = dayBucket(l); return d >= 1 && d < 90 }),
    substandard: allLoans.filter(l => { const d = dayBucket(l); return d >= 90 && d < 180 }),
    doubtful: allLoans.filter(l => { const d = dayBucket(l); return d >= 180 && d < 360 }),
    loss: allLoans.filter(l => dayBucket(l) >= 360),
  }

  // Ledger balances (opening balance + journal movements up to the quarter
  // end). null means the account has no opening balance row and no journal
  // entries yet — genuinely untracked, so that FS row stays blank rather
  // than showing a misleading zero.
  const ASSET_CODES = ['3010', '3020', '3030', '3040', '3050', '3060', '3210']
  const LIABILITY_CODES = ['4010', '4020', '4030', '4040', '4050', '4110', '4120', '4130', '4140']
  const EQUITY_CODES = ['5010', '5020']
  const allLedgerCodes = [...ASSET_CODES, ...LIABILITY_CODES, ...EQUITY_CODES]
  const ledgerValues = await Promise.all(allLedgerCodes.map(code => getAccountBalance(code, qEnd)))
  const ledger: Record<string, number | null> = {}
  allLedgerCodes.forEach((code, i) => { ledger[code] = ledgerValues[i] })

  const sumBy = (arr: any[], pick: (x: any) => number) => arr.reduce((s, x) => s + pick(x), 0)
  const sumIfAny = (codes: string[]) => {
    const present = codes.filter(c => ledger[c] !== null)
    if (present.length === 0) return null
    return present.reduce((s, c) => s + (ledger[c] ?? 0), 0)
  }

  const outstandingBalance = sumBy(allLoans, l => Number(l.balance_outstanding ?? 0))
  const nonNormalBuckets = [...buckets.watch, ...buckets.substandard, ...buckets.doubtful, ...buckets.loss]
  const nplBalance = sumBy(nonNormalBuckets, l => Number(l.balance_outstanding ?? 0))
  const loanLossProvisions =
    (Object.keys(LOAN_SHEET_NAMES) as Array<keyof typeof LOAN_SHEET_NAMES>)
      .reduce((s, key) => s + sumBy(buckets[key], l => Number(l.balance_outstanding ?? 0) * CLASS_INFO[key].provRate), 0)
  const netLoans = outstandingBalance - loanLossProvisions

  const paymentsThisQuarter = allPayments.filter(p => inRange(p.payment_date, qStart, qEnd))
  const expensesThisQuarter = allExpenses.filter(e => inRange(e.expense_date, qStart, qEnd))
  const interestIncome = sumBy(paymentsThisQuarter, p => Number(p.interest_portion ?? 0))
  const feesIncome = sumBy(paymentsThisQuarter, p => Number(p.fee_portion ?? 0))
  const totalExpensesThisQuarter = sumBy(expensesThisQuarter, e => Number(e.amount ?? 0))
  const profitForPeriod = interestIncome + feesIncome - totalExpensesThisQuarter

  const totalLiabilities = sumIfAny(LIABILITY_CODES)
  const totalEquityLedgerOnly = sumIfAny(EQUITY_CODES)
  const totalEquity = totalEquityLedgerOnly !== null ? totalEquityLedgerOnly + profitForPeriod : null

  // Net loans (not gross) roll into total assets — gross loans and loan loss
  // provisions are informational rows only, matching standard balance-sheet
  // convention (and the original BNR template's own total-assets formula).
  const assetRows: (number | null)[] = [ledger['3010'], ledger['3020'], null, netLoans, ledger['3210'], ledger['3030'], sumIfAny(['3040', '3050', '3060'])]
  const totalAssets = assetRows.some(v => v !== null) ? assetRows.reduce((s: number, v) => s + (v ?? 0), 0) : null

  const totalEquityAndLiabilities = (totalLiabilities !== null || totalEquity !== null)
    ? (totalLiabilities ?? 0) + (totalEquity ?? 0)
    : null

  const liveValues: Record<string, number | null> = {
    'Cash in Vault': ledger['3010'],
    'Cash at Bank': ledger['3020'],
    'Term Deposits': null,
    'Gross Loans': outstandingBalance,
    'Loan Loss Provisions': loanLossProvisions,
    'Net Loans': netLoans,
    'NPLs': nplBalance,
    'Fixed Assets (Gross)': null,
    'Accumulated Depreciation': null,
    'Net Fixed Assets': ledger['3210'],
    'Interest Receivable': ledger['3030'],
    'Other Assets': sumIfAny(['3040', '3050', '3060']),
    'TOTAL ASSETS': totalAssets,
    'Total Liabilities': totalLiabilities,
    'Total Equity': totalEquity,
    'Retained Profits': ledger['5020'],
    'Profit for Period': profitForPeriod,
    'Paid-up Capital': ledger['5010'],
    'Total Equity & Liabilities': totalEquityAndLiabilities,
  }

  const wb = new ExcelJS.Workbook()

  buildFsSheet(wb, quarterLabel(quarter), liveValues)
  ;(Object.keys(LOAN_SHEET_NAMES) as Array<keyof typeof LOAN_SHEET_NAMES>).forEach(key => {
    buildLoanSheet(wb, LOAN_SHEET_NAMES[key], CLASS_INFO[key], buckets[key], reportDate, today)
  })

  const buffer = await wb.xlsx.writeBuffer()
  return buffer as any
}
