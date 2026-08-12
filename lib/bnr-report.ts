// @ts-ignore
import ExcelJS from 'exceljs'
// @ts-ignore
import JSZip from 'jszip'
import { createAdminClient } from './supabase'
import { getAccountBalance, getAccountMovementSum } from './ledger'
// @ts-ignore
const { normalizeRelativeTargets, stripExcelTables, resolveExternalLinks, stripThreadedComments } = require('../scripts/lib/xlsx-sanitize')

// Generates the REAL 10-sheet, 140-row BNR template, filled from live data,
// by loading the most recently filed real report and adding one new
// column — not rebuilding a template from scratch. Every row's fill rule
// below was confirmed against the four real filed reports (Sep 2025, Dec
// 2025, Mar 2026, Jun 2026), not assumed. See docs/known-gaps.md for the
// residual unconfirmed items (row 57, WE counts, historical-quarter
// reconstruction limit).

const FS_SHEET = 'A1.2. FS'
const FS_LABEL_COL = 3
const FS_DATA_START_COL = 4 // D
const FS_HEADER_ROW = 3
const CLASSIFICATION_TOTAL_COL_LABEL_ROW = 87 // rows 87-93 = classification totals block

// ─── Chart-of-accounts codes used only by this report (income-statement
// accounts are deliberately excluded from lib/ledger.ts's CHART_OF_ACCOUNTS
// — see that file's comment) ────────────────────────────────────────────
const ACCT = {
  cashVault: '3010', bank: '3020', ar: '3030', otherReceivables: ['3040', '3050', '3060'],
  ppeGross: '3210', accDep: '3220',
  shareholdersLoan: '2030', vat: '2530', paye: '2540', maternity: '2550', pension: '2560', cbhi: '2570',
  retainedEarnings: '1050', paidUpCapital: '1010',
  interestIncome: '7010', feeIncome: '7020',
  salaries: '6110', rent: '6210', bankCharges: '6280', misc: '6300',
}
const PAYABLES_FOR_ROW25 = [ACCT.vat, ACCT.paye, ACCT.maternity, ACCT.pension, ACCT.cbhi]

const BNR_SECTORS = ['Agriculture, Livestock, Fishing', 'Public Works', 'Commerce, Restaurants, Hotels', 'Transport, Warehouses, Communications', 'Others'] as const
const ECONOMIC_SECTOR_MAP: Record<string, typeof BNR_SECTORS[number]> = {
  agriculture: 'Agriculture, Livestock, Fishing',
  construction: 'Public Works',
  commerce: 'Commerce, Restaurants, Hotels',
  hospitality: 'Commerce, Restaurants, Hotels',
  transport: 'Transport, Warehouses, Communications',
  manufacturing: 'Others',
  services: 'Others',
  other: 'Others',
}
const SECTOR_ROWS_PORTFOLIO: Record<typeof BNR_SECTORS[number], number> = {
  'Agriculture, Livestock, Fishing': 81, 'Public Works': 82, 'Commerce, Restaurants, Hotels': 83,
  'Transport, Warehouses, Communications': 84, 'Others': 85,
}
const SECTOR_ROWS_DISBURSED: Record<typeof BNR_SECTORS[number], number> = {
  'Agriculture, Livestock, Fishing': 102, 'Public Works': 103, 'Commerce, Restaurants, Hotels': 104,
  'Transport, Warehouses, Communications': 105, 'Others': 106,
}

const CLASS_INFO = {
  normal: { classNumber: 1, provRate: 0, sheet: 'A1.3. Normal Loans ' },
  watch: { classNumber: 2, provRate: 0.01, sheet: 'A1.4. Watch' },
  substandard: { classNumber: 3, provRate: 0.2, sheet: 'A1.5. Substandard' },
  doubtful: { classNumber: 4, provRate: 0.5, sheet: 'A1.6. Doubtful' },
  loss: { classNumber: 5, provRate: 1.0, sheet: 'A1.7 Loss' },
} as const
const CLASS_TOTAL_ROW: Record<keyof typeof CLASS_INFO, number> = { normal: 87, watch: 88, substandard: 89, doubtful: 90, loss: 91 }

function getDaysOverdue(maturityDate: string, balance: number, today: Date): number {
  if (balance <= 0) return -1
  const maturity = new Date(maturityDate)
  if (maturity >= today) return 0
  return Math.floor((today.getTime() - maturity.getTime()) / 86400000)
}

function colLetter(col: number): string {
  let s = ''
  while (col > 0) { const m = (col - 1) % 26; s = String.fromCharCode(65 + m) + s; col = Math.floor((col - m) / 26) }
  return s
}

const QUARTER_MONTH: Record<string, string> = { Q1: 'Mar', Q2: 'Jun', Q3: 'Sep', Q4: 'Dec' }
function quarterLabel(quarter: string): string {
  const [q, y] = quarter.split('-')
  return `${QUARTER_MONTH[q]}-${y.slice(2)}`
}
function quarterEndDate(quarter: string): Date {
  const [q, yStr] = quarter.split('-')
  const y = Number(yStr)
  const endMonth: Record<string, number> = { Q1: 2, Q2: 5, Q3: 8, Q4: 11 }
  return new Date(y, endMonth[q] + 1, 0)
}

// ─── Sanitize a loaded workbook buffer the same way scripts/prepare-bnr-
// template.js does for the static template — the real filed reports carry
// the exact same OOXML issues (Tables, external links, threaded comments),
// confirmed by direct inspection. Runs at request time so the archived
// original in storage is never modified. ──────────────────────────────
async function sanitizeBuffer(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf)

  const sheetRelFiles = Object.keys(zip.files).filter((f: string) => /xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(f))
  for (const relPath of sheetRelFiles) {
    const relFile = zip.file(relPath)
    if (!relFile) continue
    const xml = await relFile.async('string')
    if (!/\/(comments|vmlDrawing)"/.test(xml)) continue
    zip.file(relPath, xml.replace(/<Relationship[^>]*Type="[^"]*\/(comments|vmlDrawing)"[^>]*\/>/g, ''))
    const sheetPath = relPath.replace('/_rels/', '/').replace('.rels', '')
    const sheetFile = zip.file(sheetPath)
    if (!sheetFile) continue
    const sheetXml = await sheetFile.async('string')
    zip.file(sheetPath, sheetXml.replace(/<legacyDrawing[^>]*\/>/g, ''))
  }
  for (const p of Object.keys(zip.files)) {
    if (/^xl\/comments\/comment\d+\.xml$/.test(p) || /^xl\/drawings\/commentsDrawing\d+\.vml$/.test(p)) zip.remove(p)
  }
  const contentTypesFile = zip.file('[Content_Types].xml')
  if (contentTypesFile) {
    let ct = await contentTypesFile.async('string')
    ct = ct.replace(/<Override PartName="\/xl\/comments\/comment\d+\.xml"[^>]*\/>/g, '')
    zip.file('[Content_Types].xml', ct)
  }

  await stripExcelTables(zip)
  await stripThreadedComments(zip)
  await resolveExternalLinks(zip)
  await normalizeRelativeTargets(zip)

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

// ─── Find the target quarter's column, or the next empty one after the
// last populated quarter column if it doesn't exist yet. ─────────────────
function findOrCreateQuarterColumn(ws: any, label: string): { col: number; prevCol: number } {
  const headerRow = ws.getRow(FS_HEADER_ROW)
  let lastCol = FS_DATA_START_COL - 1
  for (let c = FS_DATA_START_COL; c <= headerRow.cellCount + 5; c++) {
    const v = headerRow.getCell(c).value
    if (v == null) break
    const cellLabel = v instanceof Date
      ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][v.getMonth()]}-${String(v.getFullYear()).slice(2)}`
      : String(v)
    if (cellLabel === label) return { col: c, prevCol: c - 1 }
    lastCol = c
  }
  return { col: lastCol + 1, prevCol: lastCol }
}

// ExcelJS models Excel's shared formulas (one "master" cell defining the
// formula, other cells cloning it by reference) as a group — but writing a
// plain value/formula into what was a master cell doesn't un-share the
// clones still pointing at it, causing "Shared Formula master must exist
// above and or left of clone" on write. Confirmed against the real March
// 2026 file (row 9: G9 is a shared-formula master for range F9:I9;
// overwriting G9 alone broke H9/I9). Fix: immediately after load, rewrite
// every formula cell in every sheet as an independent (non-shared) formula
// with the same resolved text, before any of this module's own writes.
function flattenSharedFormulas(wb: any) {
  for (const ws of wb.worksheets) {
    ws.eachRow((row: any) => {
      row.eachCell((cell: any) => {
        if (cell.type === ExcelJS.ValueType.Formula && cell.formula) {
          cell.value = { formula: cell.formula, result: cell.result }
        }
      })
    })
  }
}

interface Notes { push(msg: string): void; list: string[] }
function makeNotes(): Notes { const list: string[] = []; return { push: (m: string) => list.push(m), list } }

function flagCell(cell: any) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } }
}

async function fetchLoanData() {
  const supabase = createAdminClient()
  const { data: loans } = await supabase.from('iacm_loans').select('*, iacm_clients(*)')
  return loans ?? []
}

// ─── FS sheet fill ─────────────────────────────────────────────────────
async function fillFsSheet(wb: any, quarter: string, allLoans: any[], notes: Notes) {
  const ws = wb.getWorksheet(FS_SHEET)
  const label = quarterLabel(quarter)
  const { col, prevCol } = findOrCreateQuarterColumn(ws, label)
  const C = colLetter(col)
  const PC = colLetter(prevCol)
  const asOf = quarterEndDate(quarter)
  const ytdStart = new Date(asOf.getFullYear(), 0, 1)

  // Write the header if this is a genuinely new column
  const headerCell = ws.getRow(FS_HEADER_ROW).getCell(col)
  if (headerCell.value == null) { headerCell.value = label }

  const set = (row: number, value: number | string | null, opts?: { unconfirmed?: boolean }) => {
    const cell = ws.getRow(row).getCell(col)
    cell.value = value
    if (typeof value === 'number') cell.numFmt = '#,##0'
    if (opts?.unconfirmed) flagCell(cell)
  }
  const formula = (row: number, template: string) => {
    ws.getRow(row).getCell(col).value = template.replace(/\{COL\}/g, C).replace(/\{PREVCOL\}/g, PC)
  }

  // Day-bucket classification — kept, NOT used to assign buckets right now.
  // See buckets below: every loan defaults to Normal as an interim policy
  // decision (confirmed against real evidence, not a guess — see
  // docs/known-gaps.md "Loan classification: real filings never use
  // anything but Normal"). Real day-count math is preserved here in case
  // that decision is revisited.
  const dayBucket = (l: any) => getDaysOverdue(l.maturity_date, Number(l.balance_outstanding), asOf)
  void dayBucket // reserved for when/if real day-count classification is reinstated

  // Interim policy (Kevin, 2026-08-12): every real filing submitted to
  // date classifies every loan as Normal regardless of days overdue — 12
  // real examples across all 4 filings, up to 325 days overdue, including
  // a repeat client (ruling out a first-time-only grace explanation). No
  // documented policy in the real Explanatory Notes sheet explains this;
  // if anything, the notes' own pre-submission checklist ("Check if Loans
  // are categorized as per regulation") argues classification SHOULD
  // follow day-count. Given the gap between documented expectation and
  // actual filed practice, Kevin chose to match real filed practice, not
  // the regulation's day-count formula. This is deliberately not the same
  // as the day-count buckets below being "correct but unused" — it's a
  // stated simplification, revisit if Devotha's answer or a future policy
  // change gives a real rule to apply instead.
  const buckets = {
    normal: allLoans,
    watch: [] as any[],
    substandard: [] as any[],
    doubtful: [] as any[],
    loss: [] as any[],
  }
  const sumBal = (arr: any[]) => arr.reduce((s, l) => s + Number(l.balance_outstanding ?? 0), 0)
  const provisions = (Object.keys(CLASS_INFO) as Array<keyof typeof CLASS_INFO>)
    .reduce((s, k) => s + sumBal((buckets as any)[k]) * CLASS_INFO[k].provRate, 0)

  // ── A. BALANCE SHEET ──
  set(6, await getAccountBalance(ACCT.cashVault, asOf))
  set(7, await getAccountBalance(ACCT.bank, asOf))
  set(8, null) // term deposit — no account, confirmed always blank across all 4 real filings
  formula(5, '={COL}8+{COL}7+{COL}6')
  formula(9, '={COL}93')
  set(10, provisions)
  formula(11, '={COL}9-{COL}10')
  formula(12, '=SUM({COL}89:{COL}92)')
  set(13, null)
  set(14, await getAccountBalance(ACCT.ppeGross, asOf))
  set(15, await getAccountBalance(ACCT.accDep, asOf))
  formula(16, '={COL}14-{COL}15')
  set(17, await getAccountBalance(ACCT.ar, asOf))
  const otherAssets = (await Promise.all(ACCT.otherReceivables.map(c => getAccountBalance(c, asOf)))).reduce((s: number, v) => s + (v ?? 0), 0)
  set(18, otherAssets)
  set(19, null)
  formula(20, '={COL}5+{COL}11+{COL}13+{COL}16+{COL}17+{COL}18+{COL}19')
  formula(21, '={COL}22+{COL}23+{COL}25')
  formula(22, '={COL}112')
  set(23, 0) // confirmed always exactly 0 (not blank) across all 4 real filings
  set(24, null)
  const row25 = await getAccountBalance(PAYABLES_FOR_ROW25[0], asOf).then(async v0 => {
    const rest = await Promise.all(PAYABLES_FOR_ROW25.slice(1).map(c => getAccountBalance(c, asOf)))
    return (v0 ?? 0) + rest.reduce((s: number, v) => s + (v ?? 0), 0)
  })
  set(25, row25) // confirmed exact formula: VAT+PAYE+Maternity+Pension+CBHI payables
  formula(26, '=SUM({COL}27:{COL}32)')
  set(27, null); set(28, null)
  set(29, null, { unconfirmed: true }) // "Other Equity" — real historical value once matched Shareholders' Loan, not a stable pattern; left blank, flagged
  notes.push(`FS row 29 (Other Equity): no confirmed source — historically inconsistent across filings (one quarter matched the Shareholders' Loan balance, which doesn't generalize). Left blank.`)
  set(30, await getAccountBalance(ACCT.retainedEarnings, asOf))
  formula(31, '={COL}66')
  set(32, await getAccountBalance(ACCT.paidUpCapital, asOf))
  formula(33, '={COL}26+{COL}21')
  formula(34, '=IF(ISNUMBER({COL}12),IF(ISNUMBER({COL}9),{COL}12/{COL}9,""),"")')
  formula(35, '=IF(ISNUMBER({COL}26),IF(ISNUMBER({COL}20),{COL}26/{COL}20,""),"")')
  formula(36, '=IF(ISNUMBER({COL}9),IF(ISNUMBER({COL}33),{COL}9/{COL}33,""),"")')
  formula(37, '=IF(ISNUMBER({COL}16),IF(ISNUMBER({COL}26),{COL}16/{COL}26,""),"")')

  // ── B. INCOME STATEMENT (year-to-date from Jan 1, confirmed against
  // real filed quarters — Personnel and Bank Charges reproduced exactly:
  // Mar-26 filed + real Apr-Jun ledger movement = Jun-26 filed, to the
  // exact rwf) ──
  set(40, await getAccountMovementSum([ACCT.interestIncome], ytdStart, asOf, 'credit'))
  set(41, await getAccountMovementSum([ACCT.feeIncome], ytdStart, asOf, 'credit'))
  ;[42, 43, 44, 45, 46, 47, 48].forEach(r => set(r, null)) // confirmed always 0/blank across all 4 real filings
  formula(39, '={COL}40+{COL}41+{COL}42+{COL}43+{COL}44')
  formula(49, '={COL}39+{COL}45+{COL}47+{COL}48+{COL}46')
  formula(50, '={COL}53+{COL}52+{COL}51')
  set(51, null); set(52, null)
  set(53, await getAccountMovementSum([ACCT.bankCharges], ytdStart, asOf, 'debit'))
  set(54, provisions) // loan-loss provision expense mirrors the current provisions balance (always 0 in practice so far)
  set(55, null)
  set(56, await getAccountMovementSum([ACCT.salaries], ytdStart, asOf, 'debit'))
  // Confirmed exact formula: Rent (6210) + Miscellaneous (6300), YTD, net
  // of credits — reproduces the real Jun-26 filing to the exact rwf
  // (1,662,187). The earlier "off by 30,000" reading was a bug in the date
  // range passed to getAccountMovementSum (a timezone conversion issue —
  // see toLocalDateString() in lib/ledger.ts), not a wrong formula; it was
  // silently dropping a real 30,000 credit reversal inside 6300.
  const adminExpense = await getAccountMovementSum([ACCT.rent, ACCT.misc], ytdStart, asOf, 'debit')
  set(57, adminExpense)
  set(58, null, { unconfirmed: true })
  notes.push(`FS row 58 (Non Operating Expenses): left blank — no schema category exists, but the real Dec-25 filing shows a one-off 22,300 here. Will need manual entry if this recurs.`)
  formula(59, '={COL}50+{COL}54+{COL}56+{COL}57+{COL}58+{COL}55')
  formula(60, '={COL}49-{COL}59')
  set(61, null, { unconfirmed: true })
  notes.push(`FS row 61 (Income Tax): left blank — no schema category exists, but the real Dec-25 filing shows a one-off 204,165 here (matching the real Corporate Income Tax journal entry). Will need manual entry if this recurs.`)
  formula(62, '={COL}60-{COL}61')
  set(63, null)
  formula(64, '={COL}62+{COL}63')
  set(65, null)
  formula(66, '={COL}64-{COL}65')
  formula(67, '=IF(ISNUMBER({COL}59),IF(ISNUMBER({COL}49),{COL}59/{COL}49,""),"")')
  formula(68, '=IF(ISNUMBER({COL}39),IF(ISNUMBER({COL}49),{COL}39/{COL}49,""),"")')
  formula(69, '=({COL}60)/(({COL}20+{PREVCOL}20)/2)')
  formula(70, '=({COL}60)/(({COL}26+{PREVCOL}26)/2)')

  // ── D. SUPPLEMENTARY INFORMATION ──
  // 73-86: cumulative OUTSTANDING portfolio (nets repayments) — confirmed
  // via exact match: total of this block = Gross Loans (row 9/93), all 4
  // real quarters.
  const outstanding = allLoans.filter(l => Number(l.balance_outstanding ?? 0) > 0)
  const outMen = outstanding.filter(l => l.iacm_clients?.gender === 'male')
  const outWomen = outstanding.filter(l => l.iacm_clients?.gender === 'female')
  set(73, outMen.length); set(74, outWomen.length); set(75, 0)
  formula(76, '={COL}73+{COL}74+{COL}75')
  set(77, sumBal(outMen)); set(78, sumBal(outWomen)); set(79, null)
  formula(80, '={COL}77+{COL}78+{COL}79')
  // Sector split (rows 81-85, 102-106): economic_sector is confirmed
  // unpopulated for every real loan (0 of 21 have it set) — computing a
  // split against this field would silently default everything into
  // "Others" and look like a real answer. Left blank instead; real
  // classification data doesn't exist in the schema for this.
  const hasSectorData = allLoans.some(l => l.economic_sector != null)
  if (hasSectorData) {
    for (const sector of BNR_SECTORS) {
      const inSector = outstanding.filter(l => (ECONOMIC_SECTOR_MAP[l.economic_sector] ?? 'Others') === sector)
      set(SECTOR_ROWS_PORTFOLIO[sector], sumBal(inSector))
    }
  } else {
    for (const row of Object.values(SECTOR_ROWS_PORTFOLIO)) set(row, null, { unconfirmed: true })
    notes.push(`FS rows 81-85 (sector split, portfolio): left blank — economic_sector is not populated on any real loan (0 of ${allLoans.length}). No live source exists for this split.`)
  }
  formula(86, '={COL}81+{COL}82+{COL}83+{COL}84+{COL}85')

  set(CLASS_TOTAL_ROW.normal, sumBal(buckets.normal))
  set(CLASS_TOTAL_ROW.watch, sumBal(buckets.watch))
  set(CLASS_TOTAL_ROW.substandard, sumBal(buckets.substandard))
  set(CLASS_TOTAL_ROW.doubtful, sumBal(buckets.doubtful))
  set(CLASS_TOTAL_ROW.loss, sumBal(buckets.loss))
  set(92, 0) // Restructured — no schema concept, confirmed always 0
  formula(93, '=SUM({COL}87:{COL}92)')

  // 94-107: lifetime DISBURSEMENT volume (does not net repayments) —
  // confirmed via exact match: total of this block = cumulative
  // iacm_loans disbursed count/value since inception, all verifiable
  // real quarters.
  const allMen = allLoans.filter(l => l.iacm_clients?.gender === 'male')
  const allWomen = allLoans.filter(l => l.iacm_clients?.gender === 'female')
  const sumDisb = (arr: any[]) => arr.reduce((s, l) => s + Number(l.disbursed_amount ?? 0), 0)
  set(94, allMen.length); set(95, allWomen.length); set(96, null)
  formula(97, '={COL}94+{COL}95+{COL}96')
  set(98, sumDisb(allMen)); set(99, sumDisb(allWomen)); set(100, null)
  formula(101, '={COL}98+{COL}99+{COL}100')
  if (hasSectorData) {
    for (const sector of BNR_SECTORS) {
      const inSector = allLoans.filter(l => (ECONOMIC_SECTOR_MAP[l.economic_sector] ?? 'Others') === sector)
      set(SECTOR_ROWS_DISBURSED[sector], sumDisb(inSector))
    }
  } else {
    for (const row of Object.values(SECTOR_ROWS_DISBURSED)) set(row, null, { unconfirmed: true })
    notes.push(`FS rows 102-106 (sector split, disbursement): left blank — same reason as rows 81-85, no live source.`)
  }
  formula(107, '={COL}102+{COL}103+{COL}104+{COL}105+{COL}106')

  set(108, await getAccountBalance(ACCT.shareholdersLoan, asOf))
  set(109, null); set(110, null); set(111, null)
  formula(112, '=SUM({COL}108:{COL}111)')

  // 113-117: WE (Women Entrepreneurs) stats. Confirmed count of women with
  // a CURRENTLY outstanding balance (same set as row 74), not lifetime
  // disbursement count — verified by reconstructing real per-loan gender +
  // balance data directly from the real Mar-26 and Jun-26 classification
  // sheets: real count was 2 women (Mar-26) and 7 women (Jun-26) with
  // balance>0, matching row 74 exactly both times. The real filing's own
  // WE figure (4) for Mar-26 doesn't match this independently-verified
  // count — real evidence points to that being an error in the Mar-26
  // filing itself, not a wrong mapping.
  set(113, outWomen.length)
  set(114, outWomen.length)
  formula(115, '={COL}99')
  formula(116, '={COL}78')
  set(117, outWomen.length)

  ;[118, 119, 120, 121, 122, 123, 124, 125].forEach(r => set(r, null)) // SME/YE — no segmentation field in schema

  set(126, allLoans.length)
  set(127, 0)
  formula(128, '={COL}101')
  set(129, 0)
  notes.push(`FS rows 126/128 (loan applications): wired to cumulative iacm_loans count/value since inception — confirmed exact match against the real Jun-26 filing. NOT reliable for regenerating quarters before Jun 2026: iacm_loans is missing 8 real loans that existed by Mar 2026 (confirmed: live query returns 6 loans/12,001,800 through Mar 31 vs the real filed 14 loans/30,600,000). Do not use this generator to reconstruct historical quarters.`)

  ;[130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140].forEach(r => set(r, null)) // staff/board/shareholder — no HR schema
}

// ─── Classification sheets ─────────────────────────────────────────────
const LOAN_FIELD_KEYS = [
  'no', 'name', 'nationalId', 'phone', 'gender', 'age', 'relationship', 'marital', 'prevLoansPaid', 'purpose',
  'branch', 'collateralType', 'collateralAmount', 'district', 'sector', 'cell', 'village', 'annualRate', 'method', 'officer',
  'disbursedAmount', 'disbursementDate', 'maturityDate', 'freqDays', 'gracePeriod', 'firstPaymentDate', 'lastPaymentDate', 'arrearsStart', 'cutOffDate', 'totalInstallments',
  'installmentsPaid', 'installmentsOutstanding', 'amountRepaid', 'balanceOutstanding', 'eligibleCollateral', 'netAmountDue', 'daysOverdue', 'classCol', 'provRateCol', 'provRequired',
  'prevProvisions', 'addlProvisions',
]
const HEADER_TEXT_TO_KEY: Record<string, string> = {
  'no': 'no', 'names of borrowers': 'name', 'id of the borrower': 'nationalId', 'telephone number': 'phone',
  'gender': 'gender', 'age': 'age', 'marital status (married/single/widow)': 'marital',
  'previous loans paid on time (yes/no)': 'prevLoansPaid', 'purpose of the loan': 'purpose',
  'type of collateral': 'collateralType', 'amount of collateral': 'collateralAmount',
  'district': 'district', 'sector': 'sector', 'cell': 'cell', 'village': 'village',
  'annual interest rate': 'annualRate', 'interest calculation method': 'method', 'loan officer': 'officer',
  'amount disbursed': 'disbursedAmount', 'date of disbursement': 'disbursementDate', 'date of maturity': 'maturityDate',
  'balance outstanding': 'balanceOutstanding', 'days in arrears': 'daysOverdue',
}

function findHeaderRow(ws: any): number {
  for (let r = 1; r <= 15; r++) {
    for (let c = 1; c <= 10; c++) {
      if (String(ws.getRow(r).getCell(c).value ?? '').toLowerCase().includes('names of borrowers')) return r
    }
  }
  return 10
}

async function fillClassificationSheet(wb: any, sheetName: string, classInfo: { classNumber: number; provRate: number }, loans: any[], reportDate: Date, today: Date, notes: Notes) {
  const ws = wb.getWorksheet(sheetName)
  if (!ws) { notes.push(`Sheet "${sheetName}" not found in base file — skipped.`); return }
  const headerRow = findHeaderRow(ws)
  const dataStartRow = headerRow + 2

  const colMap: Record<string, number> = {}
  const hRow = ws.getRow(headerRow)
  for (let c = 1; c <= hRow.cellCount; c++) {
    const text = String(hRow.getCell(c).value ?? '').trim().toLowerCase()
    const key = HEADER_TEXT_TO_KEY[text]
    if (key) colMap[key] = c
  }

  const clearEnd = Math.max(ws.rowCount, dataStartRow + loans.length + 5)
  for (let r = dataStartRow; r <= clearEnd; r++) {
    for (const c of Object.values(colMap)) ws.getRow(r).getCell(c).value = null
  }

  loans.forEach((l, i) => {
    const r = dataStartRow + i
    const row = ws.getRow(r)
    const client = l.iacm_clients ?? {}
    const daysOverdue = Math.max(0, getDaysOverdue(l.maturity_date, Number(l.balance_outstanding), today))
    const values: Record<string, any> = {
      no: i + 1, name: client.full_name ?? '', nationalId: client.national_id ?? '', phone: client.phone ?? '',
      gender: client.gender ?? '', age: client.age ?? '', marital: client.marital_status ?? '',
      prevLoansPaid: client.previous_loans_paid === 'yes' ? 'yes' : client.previous_loans_paid === 'no' ? 'no' : 'not applicable',
      purpose: l.purpose ?? '', collateralType: l.collateral_type ?? '', collateralAmount: Number(l.collateral_amount ?? 0),
      district: client.district ?? '', sector: client.sector ?? '', cell: client.cell ?? '', village: client.village ?? '',
      annualRate: `${Math.round(Number(l.interest_rate ?? 0) * 12 * 100)}%`, method: l.interest_method === 'declining' ? 'Declining' : 'Flat',
      officer: l.loan_officer ?? '', disbursedAmount: Number(l.disbursed_amount ?? 0),
      disbursementDate: l.disbursement_date ? new Date(l.disbursement_date) : null,
      maturityDate: l.maturity_date ? new Date(l.maturity_date) : null,
      balanceOutstanding: Number(l.balance_outstanding ?? 0), daysOverdue,
    }
    for (const [key, col] of Object.entries(colMap)) {
      const cell = row.getCell(col)
      const v = values[key]
      cell.value = v
      if (typeof v === 'number') cell.numFmt = '#,##0'
      else if (v instanceof Date) cell.numFmt = 'dd/mm/yyyy'
    }
  })
}

// ─── Notes sheet, inserted first so it's the first thing anyone sees ────
function buildNotesSheet(wb: any, quarter: string, notes: Notes) {
  const ws = wb.addWorksheet('GENERATOR NOTES', { properties: { tabColor: { argb: 'FFFFC000' } } })
  wb.worksheets.unshift(wb.worksheets.pop())
  ws.getColumn(1).width = 100
  ws.getCell(1, 1).value = `Auto-generated notes for the ${quarter} column — read before sending to BNR`
  ws.getCell(1, 1).font = { bold: true, size: 13 }
  ws.getCell(2, 1).value = 'Cells highlighted in yellow on the FS sheet correspond to the flagged items below.'
  let r = 4
  ws.getCell(r, 1).value = 'Flagged / unconfirmed items:'
  ws.getCell(r, 1).font = { bold: true }
  r++
  for (const n of notes.list) { ws.getCell(r, 1).value = `• ${n}`; ws.getCell(r, 1).alignment = { wrapText: true }; r++ }
  r++
  ws.getCell(r, 1).value = 'Rows left blank by design (no data source exists in the current system):'
  ws.getCell(r, 1).font = { bold: true }
  r++
  ws.getCell(r, 1).value = '• FS rows 8, 13, 19, 23(=0), 24, 27, 28, 42-48, 51, 52, 55, 63, 65, 79, 96, 100, 109-111, 118-125, 130-140 — confirmed genuinely blank/zero across all 4 real historical filings, not missing from this generator.'
  ws.getCell(r, 1).alignment = { wrapText: true }
}

export async function generateBnrReport(quarter: string, baseFileBuffer?: Buffer): Promise<Buffer> {
  const base = baseFileBuffer ?? (await fetchMostRecentFiledReport())
  const sanitized = await sanitizeBuffer(base)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(sanitized as any)
  flattenSharedFormulas(wb)

  const notes = makeNotes()
  const allLoans = await fetchLoanData()
  const reportDate = quarterEndDate(quarter)

  await fillFsSheet(wb, quarter, allLoans, notes)

  // Interim policy (Kevin, 2026-08-12) — same as fillFsSheet above: every
  // loan defaults to the Normal classification sheet, matching real filed
  // practice across all 4 real BNR filings (not day-count, which no real
  // filing has ever applied — see docs/known-gaps.md). Day-count logic
  // preserved but unused for now.
  const dayBucket = (l: any) => getDaysOverdue(l.maturity_date, Number(l.balance_outstanding), reportDate)
  void dayBucket
  const buckets = {
    normal: allLoans,
    watch: [] as any[],
    substandard: [] as any[],
    doubtful: [] as any[],
    loss: [] as any[],
  }
  for (const key of Object.keys(CLASS_INFO) as Array<keyof typeof CLASS_INFO>) {
    await fillClassificationSheet(wb, CLASS_INFO[key].sheet, CLASS_INFO[key], (buckets as any)[key], reportDate, reportDate, notes)
  }

  buildNotesSheet(wb, quarter, notes)

  const buffer = await wb.xlsx.writeBuffer()
  return buffer as any
}

async function fetchMostRecentFiledReport(): Promise<Buffer> {
  const supabase = createAdminClient()
  const { data: reports } = await supabase.from('iacm_bnr_filed_reports').select('*').order('period_end_date', { ascending: false }).limit(1)
  const latest = (reports ?? [])[0]
  if (!latest) throw new Error('No filed BNR report found to use as a base — upload at least one via the Filed Reports feature first.')
  const { data, error } = await supabase.storage.from('bnr-filed-reports').download(latest.storage_path)
  if (error || !data) throw new Error(`Failed to download base report: ${error?.message}`)
  return Buffer.from(await data.arrayBuffer())
}
