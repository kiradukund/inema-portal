// @ts-ignore
import ExcelJS from 'exceljs'
// @ts-ignore
import JSZip from 'jszip'
import { createAdminClient } from './supabase'
import { getAccountBalance, getAccountMovementSum } from './ledger'
import { getDaysOverdue, classifyByDays, type BnrClass } from './calculator'
// @ts-ignore
const { normalizeRelativeTargets, stripExcelTables, resolveExternalLinks, stripThreadedComments } = require('../scripts/lib/xlsx-sanitize')

// Generates the REAL 10-sheet, 140-row BNR template, filled from live data,
// by loading the most recently filed real report and adding one new
// column — not rebuilding a template from scratch. Every row's fill rule
// below was confirmed against the four real filed reports (Sep 2025, Dec
// 2025, Mar 2026, Jun 2026), not assumed. See docs/known-gaps.md for the
// residual unconfirmed items (row 57, WE counts, historical-quarter
// reconstruction limit).

// Real number/date formats, confirmed stable across all 4 real filings
// (checked every populated FS leaf cell and every classification-sheet
// disbursed-amount/date cell in all 4 quarters). The generator previously
// used plain '#,##0' and 'dd/mm/yyyy' — visually similar but not what the
// real template actually uses (accounting format shows negatives in
// parens and zero as "-"; dates render as "6-Apr-26", not "06/04/2026").
const ACCOUNTING_FMT = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"??_);_(@_)'
const DATE_FMT = 'd-mmm-yy'

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
// Keys are the NORMALISED (lower-cased, trimmed, whitespace-collapsed) form
// of a loan's economic_sector — see bnrSectorOf(). The real live values
// found on iacm_loans (2026-09-10 reconciliation) are "Commerce & Trade",
// "Health" and "Other"; the earlier keys ("commerce", "other", …) never
// matched any of them, so every loan silently fell through to "Others" and
// the whole portfolio collapsed into that one bucket while hasSectorData
// still gated it as a real computed split. Entries below now cover the real
// values plus the plausible synonyms.
const ECONOMIC_SECTOR_MAP: Record<string, typeof BNR_SECTORS[number]> = {
  agriculture: 'Agriculture, Livestock, Fishing',
  'agriculture, livestock, fishing': 'Agriculture, Livestock, Fishing',
  livestock: 'Agriculture, Livestock, Fishing',
  fishing: 'Agriculture, Livestock, Fishing',
  construction: 'Public Works',
  'public works': 'Public Works',
  commerce: 'Commerce, Restaurants, Hotels',
  'commerce & trade': 'Commerce, Restaurants, Hotels',
  'commerce and trade': 'Commerce, Restaurants, Hotels',
  trade: 'Commerce, Restaurants, Hotels',
  retail: 'Commerce, Restaurants, Hotels',
  hospitality: 'Commerce, Restaurants, Hotels',
  restaurants: 'Commerce, Restaurants, Hotels',
  hotels: 'Commerce, Restaurants, Hotels',
  transport: 'Transport, Warehouses, Communications',
  'transport, warehouses, communications': 'Transport, Warehouses, Communications',
  communications: 'Transport, Warehouses, Communications',
  warehouses: 'Transport, Warehouses, Communications',
  manufacturing: 'Others',
  services: 'Others',
  health: 'Others',
  other: 'Others',
  others: 'Others',
}

// Maps a raw iacm_loans.economic_sector value to its BNR portfolio sector.
// Case/whitespace-tolerant. An unrecognised or null value falls to "Others"
// — the only option, since the BNR template has exactly these 5 buckets and
// no "unknown". (Loans with a genuinely-null sector are therefore reported
// alongside genuinely-"other" ones; there is no schema/template support to
// separate them.)
export function bnrSectorOf(economicSector: string | null | undefined): typeof BNR_SECTORS[number] {
  const key = String(economicSector ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
  return ECONOMIC_SECTOR_MAP[key] ?? 'Others'
}
const SECTOR_ROWS_PORTFOLIO: Record<typeof BNR_SECTORS[number], number> = {
  'Agriculture, Livestock, Fishing': 81, 'Public Works': 82, 'Commerce, Restaurants, Hotels': 83,
  'Transport, Warehouses, Communications': 84, 'Others': 85,
}
const SECTOR_ROWS_DISBURSED: Record<typeof BNR_SECTORS[number], number> = {
  'Agriculture, Livestock, Fishing': 102, 'Public Works': 103, 'Commerce, Restaurants, Hotels': 104,
  'Transport, Warehouses, Communications': 105, 'Others': 106,
}

export const CLASS_INFO = {
  normal: { classNumber: 1, provRate: 0, sheet: 'A1.3. Normal Loans ' },
  watch: { classNumber: 2, provRate: 0.01, sheet: 'A1.4. Watch' },
  substandard: { classNumber: 3, provRate: 0.2, sheet: 'A1.5. Substandard' },
  doubtful: { classNumber: 4, provRate: 0.5, sheet: 'A1.6. Doubtful' },
  loss: { classNumber: 5, provRate: 1.0, sheet: 'A1.7 Loss' },
} as const
const CLASS_TOTAL_ROW: Record<keyof typeof CLASS_INFO, number> = { normal: 87, watch: 88, substandard: 89, doubtful: 90, loss: 91 }

type BnrBuckets = Record<keyof typeof CLASS_INFO, any[]>
const BNR_CLASS_KEY: Record<BnrClass, keyof typeof CLASS_INFO> = { 1: 'normal', 2: 'watch', 3: 'substandard', 4: 'doubtful', 5: 'loss' }
const BNR_CLASS_NAME: Record<BnrClass, string> = { 1: 'NORMAL', 2: 'WATCH', 3: 'SUBSTANDARD', 4: 'DOUBTFUL', 5: 'LOSS' }
const CLASS_ARREARS_ARTICLE: Record<BnrClass, string> = {
  1: 'Art. 39(1)(a) — 0 days in arrears',
  2: 'Art. 39(1)(b) — at least 1 day in arrears (1-89)',
  3: 'Art. 39(1)(c) — at least 90 days in arrears (90-179)',
  4: 'Art. 39(1)(d) — at least 180 days in arrears (180-359)',
  5: 'Art. 39(1)(e) — at least 360 days in arrears',
}

// Item E6 (2026-09-10): per-loan classification rationale (Article 42 —
// "reclassification must be immediate and documented"). classifyLoansForBnr()
// optionally records, for every loan, the basis for its final class: its own
// arrears age (Pass 1), whether Art. 39(2) cross-default raised it (Pass 2),
// and whether the Art. 47(c) restructured-loan floor raised it (Pass 3).
// generateBnrReport() feeds this into the internal GENERATOR NOTES sheet so a
// reviewer can see exactly why each loan sits where it does before filing.
export interface LoanClassRationale {
  finalClass: BnrClass
  ownDays: number       // getDaysOverdue(): -1 fully repaid, 0 not past due, else days past maturity
  ownClass: BnrClass    // Pass 1 — classification on this loan's own arrears age alone
  crossDefaultedFrom?: BnrClass   // set only when Pass 2 (Art. 39(2)) raised this loan
  crossDefaultDriver?: string     // loan_number of the past-due sibling that drove the cross-default
  restructureFloored?: boolean    // set only when Pass 3 (Art. 47(c)) raised this loan to Watch
}

// ─── Item E2 (2026-09-10): real Article 39 classification, replacing the
// "every loan -> Normal" hardcode that matched filed practice up to now.
// Kevin's deliberate decision as business owner: apply Regulation 65/04/2023
// Art. 39 going forward, with the arrears clock measured from the loan's
// maturity_date (the field the system actually stores) rather than a derived
// per-instalment schedule. Accepted floor: for a multi-instalment loan whose
// first missed instalment predates maturity, this understates the arrears
// age and can classify it one notch too favourably. classifyByDays() (E1)
// already carries the Art. 39 day boundaries; getDaysOverdue() returns 0 for
// a not-yet-matured or same-day loan and -1 for a fully-repaid one, both of
// which classifyByDays maps to Normal. Used by BOTH the FS classification
// totals and the per-loan classification sheets, so they can't diverge.
//
// Item E3 (2026-09-10): Article 39(2) cross-default. "If [an NDFSP] has more
// than one loan ... with the same borrower and any of the loans becomes
// past due, all other loans to that borrower ... must be considered past
// due and be classified and provided for accordingly." Implemented as: for
// a borrower with >1 LIVE loan (balance > 0), every live loan takes the
// worst class any one of them reaches. A fully-repaid loan (balance <= 0)
// does not participate — it is closed, not "past due", and can't be
// provisioned. NOT implemented: the regulation also extends this to
// "members in his or her close relationship" — INEMA has no related-parties
// data model, so only the same-borrower part is applied. Documented gap.
//
// Item E4 (2026-09-10): Article 47(c). "Restructured loans are classified as
// 'watch' loans once new payments begin on-time and in the agreed amounts.
// In case the restructured loan delays, it will pass through the normal
// classification of loans and facilities." Implemented as a floor: a live
// loan carrying restructured_from_loan_id (set by restructureLoan() in
// lib/ledger.ts) is pinned to at least Watch. If its own arrears age already
// puts it at Substandard or worse, that worse class stands ("pass through
// the normal classification"). The floor applies to the restructured
// facility itself only — a current restructured loan is not "past due", so
// it does NOT trigger Article 39(2) cross-default onto the borrower's other
// loans; hence this pass runs AFTER cross-default and does not feed it. ───
export function classifyLoansForBnr(
  loans: any[],
  asOf: Date,
  rationale?: Map<any, LoanClassRationale>, // Item E6 — optional per-loan basis, for the GENERATOR NOTES sheet
): BnrBuckets {
  // Pass 1 — classify each loan by its own arrears age.
  const classOf = new Map<any, BnrClass>()
  const daysOf = new Map<any, number>()
  const ownOf = new Map<any, BnrClass>()
  for (const l of loans) {
    const days = getDaysOverdue(l.maturity_date, Number(l.balance_outstanding ?? 0), asOf)
    const cls = classifyByDays(days)
    daysOf.set(l, days); ownOf.set(l, cls); classOf.set(l, cls)
  }

  // Pass 2 — Article 39(2) cross-default across a borrower's live loans.
  const byBorrower = new Map<string, any[]>()
  for (const l of loans) {
    if (Number(l.balance_outstanding ?? 0) <= 0) continue
    const bid = l.client_id ?? l.iacm_clients?.id
    if (bid == null) continue
    byBorrower.set(bid, [...(byBorrower.get(bid) ?? []), l])
  }
  const crossFrom = new Map<any, BnrClass>()
  const crossDriver = new Map<any, string>()
  for (const group of Array.from(byBorrower.values())) {
    if (group.length < 2) continue
    const worst = Math.max(...group.map((l: any) => ownOf.get(l)!)) as BnrClass
    const driver = group.find((l: any) => ownOf.get(l) === worst)
    for (const l of group) {
      if (ownOf.get(l)! < worst) {
        crossFrom.set(l, ownOf.get(l)!)
        crossDriver.set(l, String(driver?.loan_number ?? driver?.id ?? '?'))
      }
      classOf.set(l, worst)
    }
  }

  // Pass 3 — Article 47(c) restructured-loan floor (Watch minimum, non-propagating).
  const floored = new Set<any>()
  for (const l of loans) {
    if (l.restructured_from_loan_id == null) continue
    if (Number(l.balance_outstanding ?? 0) <= 0) continue
    if (classOf.get(l)! < 2) { classOf.set(l, 2); floored.add(l) }
  }

  const buckets: BnrBuckets = { normal: [], watch: [], substandard: [], doubtful: [], loss: [] }
  for (const l of loans) buckets[BNR_CLASS_KEY[classOf.get(l)!]].push(l)

  if (rationale) {
    for (const l of loans) {
      rationale.set(l, {
        finalClass: classOf.get(l)!,
        ownDays: daysOf.get(l)!,
        ownClass: ownOf.get(l)!,
        crossDefaultedFrom: crossFrom.get(l),
        crossDefaultDriver: crossDriver.get(l),
        restructureFloored: floored.has(l) || undefined,
      })
    }
  }
  return buckets
}

// ─── Item E6 (2026-09-10): render the per-loan classification rationale as
// human-readable lines for the GENERATOR NOTES sheet (Article 42 — the
// classification basis for every loan, documented, worst class first). ─────
export function buildClassificationRationaleLines(loans: any[], rationale: Map<any, LoanClassRationale>): string[] {
  const counts: Record<BnrClass, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const l of loans) { const r = rationale.get(l); if (r) counts[r.finalClass]++ }
  const summary = ([5, 4, 3, 2, 1] as BnrClass[])
    .filter(c => counts[c] > 0).map(c => `${BNR_CLASS_NAME[c]} ${counts[c]}`).join('  ·  ')

  const sorted = [...loans].sort((a, b) => {
    const ra = rationale.get(a), rb = rationale.get(b)
    const fa = ra?.finalClass ?? 1, fb = rb?.finalClass ?? 1
    if (fb !== fa) return fb - fa // worst class first
    return String(a.loan_number ?? '').localeCompare(String(b.loan_number ?? ''))
  })

  const lines: string[] = [
    `Loan classification rationale — Regulation 65/04/2023 Art. 42 (reclassification must be immediate and documented). ${loans.length} loan(s): ${summary || 'none'}.`,
  ]
  for (const l of sorted) {
    const r = rationale.get(l)
    if (!r) continue
    const who = `${l.iacm_clients?.full_name ?? '(unknown borrower)'} — ${l.loan_number ?? '(no loan number)'}`
    const bal = Number(l.balance_outstanding ?? 0)
    let reason: string
    if (bal <= 0) {
      reason = 'fully repaid (balance 0) — no live exposure; carried under Normal'
    } else if (r.crossDefaultedFrom != null) {
      reason =
        `${r.ownDays} day(s) past maturity — ${BNR_CLASS_NAME[r.ownClass]} on its own — raised to ` +
        `${BNR_CLASS_NAME[r.finalClass]} by Art. 39(2) cross-default: same borrower's loan ` +
        `${r.crossDefaultDriver} is past due at ${BNR_CLASS_NAME[r.finalClass]}` +
        (l.restructured_from_loan_id != null ? ' (also a restructured facility, Art. 47(c))' : '')
    } else if (r.restructureFloored) {
      reason =
        `${r.ownDays <= 0 ? 'not past due' : r.ownDays + ' day(s) past maturity'} — but this is a ` +
        `restructured facility; Art. 47(c): classified WATCH once new payments resume on time`
    } else if (r.finalClass === 1) {
      reason = 'not past due (0 days in arrears) — ' + CLASS_ARREARS_ARTICLE[1]
    } else {
      reason = `${r.ownDays} day(s) past maturity — ${CLASS_ARREARS_ARTICLE[r.finalClass]}` +
        (l.restructured_from_loan_id != null
          ? ' [restructured facility that has since delayed — Art. 47(c) sends it through the normal day-count classification]'
          : '')
    }
    lines.push(`${who} — bal ${bal.toLocaleString()} — ${BNR_CLASS_NAME[r.finalClass]}: ${reason}`)
  }
  return lines
}

// ─── Item E5 (2026-09-10): Article 45 — eligible-collateral haircuts. ───────
// Article 39(1)'s provisioning rates apply to the loan balance "net of
// eligible collaterals". Article 45 fixes the eligible share of each
// collateral kind:
//   cash / deposits with the NDFSP / Government & bank securities ...... 100%
//   registered land & buildings ...................................... 60%
//   movable assets (vehicles, equipment, stock, chattel, livestock) ... 40%
//   anything else — personal/third-party guarantees, unspecified
//   "other assets", "none", or an unrecognised label ................. 0%
// A personal guarantor is NOT eligible collateral under Article 45 (it is
// not cash, a security, land, or movable property pledged to the NDFSP), so
// INEMA's "Guarantor" loan-form option carries a 0% haircut. Keys are the
// real INEMA loan-form vocabulary (app/admin/iacm/loans/new: 'Other assets',
// 'Land & Building', 'Cash deposit', 'Guarantor', 'None') plus common
// synonyms, matched after lower-casing + whitespace-collapsing.
export const COLLATERAL_HAIRCUT: Record<string, number> = {
  // 100% — cash & near-cash, Government / bank securities
  'cash deposit': 1, 'cash': 1, 'cash collateral': 1, 'deposit': 1, 'deposits': 1,
  'term deposit': 1, 'fixed deposit': 1, 'savings': 1, 'blocked account': 1,
  'government securities': 1, 'treasury bills': 1, 'treasury bonds': 1, 't-bills': 1, 't-bonds': 1,
  'bank securities': 1, 'bank guarantee': 1,
  // 60% — registered immovable property
  'land & building': 0.6, 'land and building': 0.6, 'land': 0.6, 'building': 0.6, 'buildings': 0.6,
  'house': 0.6, 'plot': 0.6, 'mortgage': 0.6, 'immovable property': 0.6, 'real estate': 0.6,
  // 40% — movable assets
  'movable assets': 0.4, 'movable asset': 0.4, 'movable property': 0.4, 'vehicle': 0.4,
  'motor vehicle': 0.4, 'car': 0.4, 'motorcycle': 0.4, 'equipment': 0.4, 'machinery': 0.4,
  'inventory': 0.4, 'stock': 0.4, 'chattel': 0.4, 'furniture': 0.4, 'livestock': 0.4,
  // 0% — not eligible collateral under Article 45
  'guarantor': 0, 'guarantee': 0, 'personal guarantee': 0, 'third party guarantee': 0,
  'other assets': 0, 'other': 0, 'none': 0, '': 0,
}

// Value of a loan's collateral that Article 45 lets INEMA net off before
// provisioning. Returns 0 unless a positive collateral_amount is recorded;
// caps the eligible amount at the loan's own outstanding balance (excess
// collateral cannot drive the provision below zero).
export function eligibleCollateralValue(loan: any): number {
  const amount = Number(loan.collateral_amount ?? 0)
  if (!(amount > 0)) return 0
  const key = String(loan.collateral_type ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
  const haircut = COLLATERAL_HAIRCUT[key] ?? 0 // unrecognised kind -> not eligible
  const eligible = amount * haircut
  return Math.min(eligible, Math.max(0, Number(loan.balance_outstanding ?? 0)))
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
export async function sanitizeBuffer(buf: Buffer): Promise<Buffer> {
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
// ExcelJS represents data validations internally as a per-cell map, not a
// range. When it re-serializes a large contiguous validation range (e.g.
// the real template's collateral-type dropdown, L12:L1400) it sometimes
// splits it into two overlapping <dataValidation> elements instead of one
// (confirmed via direct inspection: always splits at row 100, e.g.
// "L100:L1400" + "L12:L1400" — the first fully contained in the second).
// Both rules define the identical dropdown, so this doesn't corrupt data
// or produce a wrong dropdown, and it doesn't compound across repeated
// regenerations (confirmed via 3 successive round trips, stays at 2, never
// grows) — but it's needless duplicate XML from an ExcelJS write-time
// quirk, not something the real template ever had. Merge same-rule
// entries back into one per sheet after every write.
async function dedupeDataValidations(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf)
  const colLetterOf = (ref: string) => (ref.match(/^[A-Z]+/) || [''])[0]
  const rowOf = (ref: string) => parseInt((ref.match(/\d+/) || ['0'])[0], 10)

  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue
    const file = zip.file(name)
    if (!file) continue
    const xml = await file.async('string')
    const blockMatch = xml.match(/<dataValidations[^>]*>([\s\S]*?)<\/dataValidations>/)
    if (!blockMatch) continue

    const entries = Array.from(blockMatch[1].matchAll(/<dataValidation\b([^>]*)\bsqref="([^"]+)"([^>]*)>([\s\S]*?)<\/dataValidation>|<dataValidation\b([^>]*)\bsqref="([^"]+)"([^>]*)\/>/g))
    if (entries.length < 2) continue

    type Entry = { attrsBefore: string; sqref: string; attrsAfter: string; inner: string; selfClosing: boolean }
    const parsed: Entry[] = entries.map(m => m[2] !== undefined
      ? { attrsBefore: m[1], sqref: m[2], attrsAfter: m[3], inner: m[4], selfClosing: false }
      : { attrsBefore: m[5], sqref: m[6], attrsAfter: m[7], inner: '', selfClosing: true })

    const groups = new Map<string, Entry[]>()
    for (const e of parsed) {
      const key = `${e.attrsBefore}|${e.attrsAfter}|${e.inner}`
      const list = groups.get(key) ?? []
      list.push(e)
      groups.set(key, list)
    }

    let changed = false
    const merged: Entry[] = []
    for (const list of Array.from(groups.values())) {
      if (list.length === 1) { merged.push(list[0]); continue }
      changed = true
      const col = colLetterOf(list[0].sqref.split(':')[0])
      const rows = list.flatMap(e => e.sqref.split(':').map(rowOf))
      const minRow = Math.min(...rows)
      const maxRow = Math.max(...rows)
      merged.push({ ...list[0], sqref: `${col}${minRow}:${col}${maxRow}` })
    }
    if (!changed) continue

    const serialize = (e: Entry) => e.selfClosing
      ? `<dataValidation${e.attrsBefore}sqref="${e.sqref}"${e.attrsAfter}/>`
      : `<dataValidation${e.attrsBefore}sqref="${e.sqref}"${e.attrsAfter}>${e.inner}</dataValidation>`
    const newBlock = `<dataValidations count="${merged.length}">${merged.map(serialize).join('')}</dataValidations>`
    zip.file(name, xml.replace(blockMatch[0], newBlock))
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export function flattenSharedFormulas(wb: any) {
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

// Real sheet names carry small, inconsistent whitespace differences across
// quarters — confirmed via direct inspection of all 4 real filings: e.g.
// "A1.3. Normal Loans" (Sep-25, Dec-25, Mar-26) vs "A1.3. Normal Loans "
// with a trailing space (Jun-26 only). wb.getWorksheet() does exact-string
// matching, so a hardcoded name only works for whichever quarter happened
// to match it — every other base file silently fails to find the sheet
// (fillClassificationSheet's own "not found" bailout, no error thrown).
// Found 2026-08-12 during the final pre-production re-study: generating
// from any base file except the exact Jun-26 one skipped filling the
// Normal Loans classification sheet entirely. Match by trimmed name instead.
function findWorksheet(wb: any, name: string): any {
  const exact = wb.getWorksheet(name)
  if (exact) return exact
  const target = name.trim().toLowerCase()
  return wb.worksheets.find((s: any) => String(s.name ?? '').trim().toLowerCase() === target)
}

const INSTITUTION_NAME = 'INEMA FINANCIAL SOLUTIONS Ltd'

// A JS Date written straight into an Excel cell serializes via its UTC
// components. quarterEndDate() returns a LOCAL date (new Date(y, m, 0)), so
// on a UTC+n machine it lands on the previous calendar day once ExcelJS
// serializes it (2026-09-30 local -> 2026-09-29T22:00Z -> renders "29-Sep").
// Re-anchor to UTC-midnight of the same calendar day before writing it to a
// cell. Same failure mode toLocalDateString() guards against elsewhere.
function toCellDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

// ─── Item C1 (2026-09-10): remove the leftover old-format "A1.3. Normal"
// duplicate sheet. It is a distinct sheet from the real "A1.3. Normal Loans "
// — a 44-column older-layout template artifact (header row 7, "Physical
// Guarantee(Collateral)" instead of the Type/Amount split), never populated,
// carried through unchanged from every base file. Confirmed a duplicate, not
// a needed sheet. ─────────────────────────────────────────────────────────
export function removeDuplicateNormalSheet(wb: any) {
  const dup = wb.worksheets.find((s: any) => String(s.name ?? '').trim().toLowerCase() === 'a1.3. normal')
  if (dup) wb.removeWorksheet(dup.id)
}

// ─── Item C2 + C3 (2026-09-10): fix the classification sheets' header block.
// Every real filing left "NDFSP Name" / "Code of Institution" as "0" and the
// "Reporting Period (Cut-off date)" as a stale inherited date on every
// classification sheet except "Normal Loans". The header layout varies
// sheet-to-sheet (label in col A or B; value in col B, C, or a stray col H),
// so this finds each label cell and writes the correct value immediately to
// its right, then sweeps stray "0" / pre-2025-date noise from the header
// band. Runs for every A1.3–A1.9 sheet, including A1.8/A1.9 which the
// classification fill loop never visits. Code of Institution is deliberately
// left blank: no real filing ever populated it and no confirmed BNR
// institution code exists — clearing the stray "0" without inventing a value.
export function fixClassificationHeaders(wb: any, quarter: string) {
  const asOf = quarterEndDate(quarter)
  for (const ws of wb.worksheets as any[]) {
    if (!/^A1\.[3-9]/.test(String(ws.name ?? ''))) continue

    const writeBesideLabel = (labelMatch: RegExp, value: any, fmt?: string) => {
      for (let r = 1; r <= 6; r++) {
        for (let c = 1; c <= 12; c++) {
          const t = normalizeHeader(ws.getRow(r).getCell(c).value)
          if (t && labelMatch.test(t)) {
            const v = ws.getRow(r).getCell(c + 1)
            v.value = value
            if (fmt && value != null) v.numFmt = fmt
            return
          }
        }
      }
    }

    writeBesideLabel(/^ndfsp name/, INSTITUTION_NAME)
    writeBesideLabel(/^code of institution/, null)
    writeBesideLabel(/^reporting period \(cut-?off date\)/, toCellDate(asOf), DATE_FMT)

    // Stray-noise sweep: a bare 0, or a Date before 2025, anywhere in the
    // header band (rows 2-6) is inherited junk — the real content there is
    // text labels or the cells just written above (a 2026 date, a name string).
    for (let r = 2; r <= 6; r++) {
      for (let c = 1; c <= 14; c++) {
        const cell = ws.getRow(r).getCell(c)
        const v = cell.value
        if (v === 0) cell.value = null
        else if (v instanceof Date && v.getFullYear() < 2025) cell.value = null
      }
    }
  }
}

// ─── FS sheet fill ─────────────────────────────────────────────────────
async function fillFsSheet(wb: any, quarter: string, allLoans: any[], notes: Notes) {
  const ws = findWorksheet(wb, FS_SHEET)
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
    if (typeof value === 'number') cell.numFmt = ACCOUNTING_FMT
    if (opts?.unconfirmed) flagCell(cell)
  }
  const formula = (row: number, template: string) => {
    ws.getRow(row).getCell(col).value = template.replace(/\{COL\}/g, C).replace(/\{PREVCOL\}/g, PC)
  }

  // Item E2 (2026-09-10): real Article 39 classification off maturity_date
  // (see classifyLoansForBnr). Replaces the "every loan -> Normal" hardcode.
  const buckets = classifyLoansForBnr(allLoans, asOf)
  const sumBal = (arr: any[]) => arr.reduce((s, l) => s + Number(l.balance_outstanding ?? 0), 0)
  // Provision = Σ (balance NET OF eligible collateral × Art. 39 rate).
  // Item E5 (2026-09-10): Art. 45 — eligibleCollateralValue() applies the
  // per-kind haircut and caps it at the loan's own balance. FS rows 87-91
  // still report GROSS classified balances (sumBal); only this provision
  // figure is net of collateral. Every real INEMA loan records
  // collateral_amount 0 today, so net == gross for the current portfolio —
  // this is correct forward-looking behaviour, no change to today's numbers.
  const netOfCollateral = (l: any) => Math.max(0, Number(l.balance_outstanding ?? 0) - eligibleCollateralValue(l))
  const provisions = (Object.keys(CLASS_INFO) as Array<keyof typeof CLASS_INFO>)
    .reduce((s, k) => s + (buckets as any)[k].reduce((t: number, l: any) => t + netOfCollateral(l) * CLASS_INFO[k].provRate, 0), 0)

  // ── A. BALANCE SHEET ──
  set(6, await getAccountBalance(ACCT.cashVault, asOf))
  set(7, await getAccountBalance(ACCT.bank, asOf))
  set(8, null) // term deposit — no account, confirmed always blank across all 4 real filings
  formula(5, '={COL}8+{COL}7+{COL}6')
  formula(9, '={COL}93')
  // Real filed pattern (confirmed 4/4 quarters, own-column value): this row
  // is always left genuinely blank, never a literal 0, even in quarters
  // where provisions are 0 — unlike rows 42-48/55 below, which is 0 in 3/4
  // quarters. Write the real computed figure only once it's nonzero (i.e.
  // once classification produces real provisions), matching how every real
  // filing to date has actually looked.
  set(10, provisions || null)
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
  // Confirmed real pattern (Jun-26 filing, cached values): row 30 does NOT
  // track account 1050's live, continuously-updated balance — it's
  // effectively FROZEN at whatever the prior column already reported.
  // Real F30 (Mar-26) = 1,861,374 = real E31 (Dec-25's own Profit/loss for
  // the period) + a one-time 1,800 correction; real G30 (Jun-26) = same
  // 1,861,374 as F30, completely unchanged despite Jun-26 posting real
  // profit (G31/G66 = 3,156,630.4) — i.e. retained earnings only moves via
  // a deliberate manual closing entry, not automatically each quarter.
  // Reading account 1050's live balance (5,018,004.4) reflects the ledger's
  // own running total, which is a different concept from what this row
  // reports. Carry forward the prior column's value, matching real
  // confirmed practice, until a real closing entry changes it.
  formula(30, '={PREVCOL}30')
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
  // No live data source for any of these income categories (INEMA has
  // never earned deposit/instrument/recovery/other income) — but unlike
  // most no-source rows, the real filed value is consistently a literal 0,
  // not blank (3 of 4 real filings; the 4th, Mar-26, is the one exception).
  // Writing 0 here matches confirmed real practice more closely than
  // leaving these blank.
  ;[42, 43, 44, 45, 46, 47, 48].forEach(r => set(r, 0))
  formula(39, '={COL}40+{COL}41+{COL}42+{COL}43+{COL}44')
  formula(49, '={COL}39+{COL}45+{COL}47+{COL}48+{COL}46')
  formula(50, '={COL}53+{COL}52+{COL}51')
  set(51, null); set(52, null)
  set(53, await getAccountMovementSum([ACCT.bankCharges], ytdStart, asOf, 'debit'))
  // Confirmed real formula pattern (Dec-25 filing): "=COL10-D10", i.e. this
  // period's provisions balance MINUS the prior period's — a delta, not the
  // flat balance. Matches the Explanatory Notes' own text for this row:
  // "when the loan provisions has been reduced compared to prior report
  // provision, the difference is recognised." Currently always 0 either
  // way (provisions are 0 while every loan defaults to Normal), but a flat
  // balance would overstate this row the moment provisions become nonzero.
  formula(54, '={COL}10-{PREVCOL}10')
  set(55, 0) // no write-off tracking; real filed value is 0 in 3/4 quarters, not blank — see row 42-48 comment
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
  // Sector split (rows 81-85, 102-106). Original gap: economic_sector was
  // unpopulated on every loan, so a split would silently dump everything
  // into "Others" and look real. As of 2026-09-10 some loans DO carry a
  // sector ("Commerce & Trade", "Health", "Other") — but the gate must
  // require at least one loan that maps to a REAL BNR bucket (not "Others"),
  // otherwise an all-unrecognised set still produces a misleading
  // everything-in-Others split. When it doesn't, leave the rows blank and
  // flag them, same as before.
  const hasSectorData = allLoans.some(l => l.economic_sector != null && bnrSectorOf(l.economic_sector) !== 'Others')
  if (hasSectorData) {
    for (const sector of BNR_SECTORS) {
      const inSector = outstanding.filter(l => bnrSectorOf(l.economic_sector) === sector)
      set(SECTOR_ROWS_PORTFOLIO[sector], sumBal(inSector))
    }
  } else {
    for (const row of Object.values(SECTOR_ROWS_PORTFOLIO)) set(row, null, { unconfirmed: true })
    notes.push(`FS rows 81-85 (sector split, portfolio): left blank — no loan carries an economic_sector that maps to a real BNR bucket (${allLoans.filter(l => l.economic_sector != null).length} of ${allLoans.length} have any value set, none recognised). Extend ECONOMIC_SECTOR_MAP if that changes.`)
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
      const inSector = allLoans.filter(l => bnrSectorOf(l.economic_sector) === sector)
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
// Matched against normalized real header text (see normalizeHeader below), not
// paraphrased column names — the real BNR template text was confirmed via
// direct inspection of all 4 filed reports' Normal/Watch/Substandard/Doubtful/
// Loss sheets. An earlier version of this map used exact strings that didn't
// match the real header text at all (e.g. "date of maturity" vs the real
// "Agreed Maturity Date", "amount disbursed" vs real "Disbursed amount",
// "district"/"sector"/"cell"/"village" vs real "Borrower's District" etc.) —
// since the lookup was a strict equality check, every one of those columns
// was silently never written into any generated classification sheet. Found
// 2026-08-12 during the final pre-production re-study; every entry below was
// re-derived from the real header row text, not guessed.
const HEADER_TEXT_TO_KEY: Record<string, string> = {
  'no': 'no', 'names of borrowers': 'name', 'id of the borrower': 'nationalId', 'telephone number': 'phone',
  'gender': 'gender', 'age': 'age', 'marital status (married/single/widow)': 'marital',
  'previous loans paid on time (yes/no)': 'prevLoansPaid', 'purpose of the loan': 'purpose',
  'collateral type': 'collateralType', 'guarantee(collateral) ammount': 'collateralAmount',
  "borrower's district": 'district', "borrower's sector": 'sector', "borrower's cell": 'cell', "borrower's village": 'village',
  'annual interest rate': 'annualRate', 'method of interest rate calculation (flat/declining)': 'method',
  'names of the loan officer': 'officer',
  'disbursed amount': 'disbursedAmount', 'date of loan disbursement': 'disbursementDate', 'agreed maturity date': 'maturityDate',
  'balance outstanding (principal)': 'balanceOutstanding', 'number of days overdue (arrears)': 'daysOverdue',
  // Added 2026-09-10: this header was never mapped, so column AG ("Amount
  // Repaid (Principal)") was never written OR cleared by the generator —
  // the only non-blank rows were stale values inherited from the base
  // file. Now sourced from iacm_loans.principal_repaid (maintained by
  // recomputeLoanFromPayments() from real iacm_payments rows).
  'amount repaid (principal)': 'amountRepaid',
  // Added 2026-09-10 (Item C3): the per-row "Cut Off Date (Report Date)"
  // column was never mapped — every row carried a stale inherited date
  // (2026-09-06 in the Jun-based Q3 file). Now written as the real quarter
  // end for every row.
  'cut off date (report date)': 'cutOffDate',
}

// Real header text varies slightly quarter-to-quarter and sheet-to-sheet —
// confirmed real examples: double internal spaces ("Round Number of
// Installments  paid"), inconsistent trailing spaces ("Eligible Collateral
// provided " vs no trailing space), case variance ("Disbursed amount" vs
// "Disbursed Amount"), and a mojibake byte in the "Relationship..." column
// that isn't even the same across sheets. Normalizing (strip non-ASCII,
// lowercase, trim, collapse internal whitespace) before lookup makes the
// match robust to all of these instead of requiring a byte-exact string.
function normalizeHeader(s: string): string {
  return String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function findHeaderRow(ws: any): number {
  for (let r = 1; r <= 15; r++) {
    for (let c = 1; c <= 10; c++) {
      if (normalizeHeader(ws.getRow(r).getCell(c).value).includes('names of borrowers')) return r
    }
  }
  return 10
}

// Exported for isolated smoke testing only (2026-09-10). Pure: mutates the
// given in-memory workbook, no I/O, no storage, no archive writes — safe to
// call directly from a test with disposable loan rows.
export async function fillClassificationSheet(wb: any, sheetName: string, classInfo: { classNumber: number; provRate: number }, loans: any[], reportDate: Date, today: Date, notes: Notes) {
  const ws = findWorksheet(wb, sheetName)
  if (!ws) { notes.push(`Sheet "${sheetName}" not found in base file — skipped.`); return }
  const headerRow = findHeaderRow(ws)
  const dataStartRow = headerRow + 2

  const colMap: Record<string, number> = {}
  const hRow = ws.getRow(headerRow)
  for (let c = 1; c <= hRow.cellCount; c++) {
    const text = normalizeHeader(hRow.getCell(c).value)
    const key = HEADER_TEXT_TO_KEY[text]
    if (key) colMap[key] = c
  }

  // NOT Math.max(ws.rowCount, ...): ws.rowCount reflects the sheet's full
  // ~1400-row extent, most of which is the (now-stripped) Excel Table's
  // per-row template formulas, not real loan data — confirmed via direct
  // inspection of the real Jun-26 filing (Table4202210, rows 12-1401).
  // Clearing all the way to ws.rowCount would wipe unrelated sheet content
  // far beyond any realistic loan count. A generous fixed buffer is enough
  // to clean up a shrinking loan list between quarters.
  const clearEnd = dataStartRow + Math.max(loans.length, 50) + 5
  for (let r = dataStartRow; r <= clearEnd; r++) {
    for (const c of Object.values(colMap)) ws.getRow(r).getCell(c).value = null
  }

  loans.forEach((l, i) => {
    const r = dataStartRow + i
    const row = ws.getRow(r)
    const client = l.iacm_clients ?? {}
    const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
    const values: Record<string, any> = {
      no: i + 1, name: client.full_name ?? '', nationalId: client.national_id ?? '', phone: client.phone ?? '',
      gender: cap(client.gender ?? ''), age: client.age ?? '', marital: cap(client.marital_status ?? ''),
      prevLoansPaid: client.previous_loans_paid === 'yes' ? 'yes' : client.previous_loans_paid === 'no' ? 'no' : 'not applicable',
      purpose: l.purpose ?? '', collateralType: l.collateral_type ?? '',
      // Real filed pattern (21/21 loans, Jun-26): blank, not 0, when no
      // collateral amount is on file — there's no collateral_amount tracking
      // for any real loan today.
      collateralAmount: l.collateral_amount != null ? Number(l.collateral_amount) : null,
      district: (client.district ?? '').toUpperCase(), sector: (client.sector ?? '').toUpperCase(),
      cell: (client.cell ?? '').toUpperCase(), village: (client.village ?? '').toUpperCase(),
      // Real filed pattern: a genuine percentage-formatted number (0.6 with
      // a "0%" numFmt), not a literal "60%" text string — confirmed via
      // direct inspection (real cell value 0.6, not the string "60%").
      annualRate: Number(l.interest_rate ?? 0) * 12,
      method: l.interest_method === 'declining' ? 'Declining' : 'Flat',
      officer: l.loan_officer ?? '', disbursedAmount: Number(l.disbursed_amount ?? 0),
      disbursementDate: l.disbursement_date ? new Date(l.disbursement_date) : null,
      maturityDate: l.maturity_date ? new Date(l.maturity_date) : null,
      balanceOutstanding: Number(l.balance_outstanding ?? 0),
      // Added 2026-09-10 (see HEADER_TEXT_TO_KEY): principal repaid to date,
      // from iacm_loans.principal_repaid. Written for every row now — the
      // 8 stale inherited values and 20 blanks in the Jun-based Q3 file
      // were the symptom of this column never being touched by the generator.
      amountRepaid: Number(l.principal_repaid ?? 0),
      // Added 2026-09-10 (Item C3): the report / cut-off date, same for
      // every row. `reportDate` here is the quarter-end passed in by
      // generateBnrReport (quarterEndDate(quarter)); toCellDate() re-anchors
      // it to UTC-midnight so ExcelJS doesn't shift it a day back.
      cutOffDate: toCellDate(reportDate),
      // Real filed pattern (confirmed 100% blank across all 3 checked real
      // quarters — Dec-25, Mar-26, Jun-26 — every loan, overdue or not):
      // this column is never actually filled in by the real filer. Real
      // days-overdue evidence used elsewhere (docs/known-gaps.md) is
      // computed independently from maturity_date, not read from this cell.
      daysOverdue: null,
    }
    for (const [key, col] of Object.entries(colMap)) {
      const cell = row.getCell(col)
      const v = values[key]
      cell.value = v
      if (key === 'annualRate') cell.numFmt = '0%'
      else if (typeof v === 'number') cell.numFmt = ACCOUNTING_FMT
      else if (v instanceof Date) cell.numFmt = DATE_FMT
    }
  })
}

// ─── Notes sheet, inserted first so it's the first thing anyone sees ────
// Exported for isolated smoke testing only (2026-09-10). Pure: mutates the
// given in-memory workbook, no I/O.
export function buildNotesSheet(wb: any, quarter: string, notes: Notes, classificationLines: string[] = []) {
  const ws = wb.addWorksheet('GENERATOR NOTES', { properties: { tabColor: { argb: 'FFFFC000' } } })
  // wb.worksheets is a computed getter (sorts a private _worksheets array by
  // each sheet's own orderNo) — it returns a fresh array every access, so
  // wb.worksheets.unshift(wb.worksheets.pop()) mutated a throwaway array
  // and never actually changed serialization order. Confirmed via direct
  // inspection: the notes sheet was being written LAST, not first as
  // intended (the very thing this comment says it's for). Set orderNo
  // directly instead — every other sheet keeps its relative order since
  // they all move up by the same 1.
  for (const s of wb.worksheets) { if (s !== ws) s.orderNo += 1 }
  ws.orderNo = 0
  // wb.views[0].activeTab is a raw sheet INDEX carried over from the base
  // file (e.g. "2", meaning whatever sheet used to be third) — inserting a
  // new first sheet shifts every real sheet's index by 1, so left alone
  // this would open on the wrong tab (confirmed: pointed at the stale
  // "A1.3. Normal" duplicate instead of the real Normal Loans sheet in a
  // direct test). Point it at the notes sheet itself instead, which is
  // also the more useful default — it's meant to be seen first.
  if (wb.views?.[0]) wb.views[0].activeTab = 0
  ws.getColumn(1).width = 100
  ws.getCell(1, 1).value = `⚠ INTERNAL REVIEW ONLY — DO NOT SEND THIS SHEET TO BNR (${quarter})`
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFC00000' } }
  ws.getCell(2, 1).value = 'This sheet exists so Kevin/Devotha can review flagged assumptions and known gaps before deciding what to file. Use the "Download for BNR Submission" option to get a copy without this sheet — that is the only version that should ever be sent to the regulator.'
  ws.getCell(2, 1).alignment = { wrapText: true }
  ws.getCell(3, 1).value = 'Cells highlighted in yellow on the FS sheet correspond to the flagged items below.'
  let r = 5
  ws.getCell(r, 1).value = 'Flagged / unconfirmed items:'
  ws.getCell(r, 1).font = { bold: true }
  r++
  for (const n of notes.list) { ws.getCell(r, 1).value = `• ${n}`; ws.getCell(r, 1).alignment = { wrapText: true }; r++ }
  r++
  // Item E6 (2026-09-10): per-loan classification rationale (Art. 42).
  if (classificationLines.length) {
    ws.getCell(r, 1).value = 'Loan classification rationale (Regulation 65/04/2023 Art. 42 — reclassification must be documented):'
    ws.getCell(r, 1).font = { bold: true }
    r++
    // first line is the summary sentence; the rest are one bullet per loan
    ws.getCell(r, 1).value = classificationLines[0]
    ws.getCell(r, 1).alignment = { wrapText: true }
    r++
    for (const line of classificationLines.slice(1)) {
      ws.getCell(r, 1).value = `• ${line}`
      ws.getCell(r, 1).alignment = { wrapText: true }
      r++
    }
    r++
  }
  ws.getCell(r, 1).value = 'Rows left blank by design (no data source exists in the current system):'
  ws.getCell(r, 1).font = { bold: true }
  r++
  ws.getCell(r, 1).value = '• FS rows 8, 13, 19, 23(=0), 24, 27, 28, 42-48, 51, 52, 55, 63, 65, 79, 96, 100, 109-111, 118-125, 130-140 — confirmed genuinely blank/zero across all 4 real historical filings, not missing from this generator.'
  ws.getCell(r, 1).alignment = { wrapText: true }
}

export async function generateBnrReport(
  quarter: string,
  baseFileBuffer?: Buffer,
  opts?: { forSubmission?: boolean }
): Promise<Buffer> {
  const base = baseFileBuffer ?? (await fetchMostRecentFiledReport())
  const sanitized = await sanitizeBuffer(base)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(sanitized as any)
  flattenSharedFormulas(wb)

  removeDuplicateNormalSheet(wb) // Item C1

  const notes = makeNotes()
  const allLoans = await fetchLoanData()
  const reportDate = quarterEndDate(quarter)

  await fillFsSheet(wb, quarter, allLoans, notes)

  // Item E2 (2026-09-10): real Article 39 classification off maturity_date
  // (see classifyLoansForBnr) — the SAME bucketing fillFsSheet uses for the
  // FS classification totals, so the per-loan sheets and the FS rows agree.
  // Item E6: capture the per-loan rationale for the GENERATOR NOTES sheet.
  const rationale = new Map<any, LoanClassRationale>()
  const buckets = classifyLoansForBnr(allLoans, reportDate, rationale)
  for (const key of Object.keys(CLASS_INFO) as Array<keyof typeof CLASS_INFO>) {
    await fillClassificationSheet(wb, CLASS_INFO[key].sheet, CLASS_INFO[key], (buckets as any)[key], reportDate, reportDate, notes)
  }

  fixClassificationHeaders(wb, quarter) // Items C2 + C3 (header block)

  buildNotesSheet(wb, quarter, notes, buildClassificationRationaleLines(allLoans, rationale))

  // The notes sheet is internal-review-only — it exists so Kevin/Devotha
  // can see flagged assumptions and known gaps before deciding what to
  // file, and must never reach BNR (see docs/known-gaps.md and the sheet's
  // own header). Building it unconditionally above (both variants share
  // the exact same fill logic) and removing it here for the submission
  // variant keeps the two outputs from ever silently diverging in the
  // data they contain — only this one sheet differs.
  if (opts?.forSubmission) {
    const notesWs = wb.worksheets.find((s: any) => s.name === 'GENERATOR NOTES')
    if (notesWs) wb.removeWorksheet(notesWs.id)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return dedupeDataValidations(buffer as any)
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
