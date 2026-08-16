// @ts-ignore
import * as XLSX from 'xlsx'
import { createAdminClient } from './supabase'
import { getDaysOverdue, MONTHLY_INTEREST_RATE } from './calculator'

// Fills the REAL CRB "Consumer" sheet (74 columns, confirmed via direct
// inspection of the real Aug-2026 and Jul-2026 filed .xls files) with a
// fresh snapshot of every currently-outstanding loan — NOT a continuation
// like the BNR generator. Kevin's explicit framing: CRB submissions are
// independent monthly snapshots, so this always starts from the most
// recently filed real .xls as a structural base, clears the Consumer
// sheet's data rows, and rewrites them from live data. The 6 other real
// sheets (Corporate, Shareholders, Directors, Collateral, Guarantors,
// Bounced Cheques) are never touched — they're genuinely empty template
// stubs in every real historical file and are carried forward byte-for-
// byte. See docs/known-gaps.md for every field left blank by design.

const CRB_BUCKET = 'crb-filed-reports'
const CONSUMER_SHEET = 'Consumer'

// Fixed, well-known administrative geography (30 districts / 5
// provinces + Kigali City) — not client-specific data, safe to hardcode.
// iacm_clients has no province field, only district/sector/cell/village.
const PROVINCE_BY_DISTRICT: Record<string, string> = {
  nyarugenge: 'Kigali City', gasabo: 'Kigali City', kicukiro: 'Kigali City',
  huye: 'Southern', nyanza: 'Southern', gisagara: 'Southern', nyaruguru: 'Southern',
  muhanga: 'Southern', kamonyi: 'Southern', ruhango: 'Southern', nyamagabe: 'Southern',
  musanze: 'Northern', gicumbi: 'Northern', rulindo: 'Northern', burera: 'Northern', gakenke: 'Northern',
  rwamagana: 'Eastern', nyagatare: 'Eastern', gatsibo: 'Eastern', kayonza: 'Eastern',
  kirehe: 'Eastern', ngoma: 'Eastern', bugesera: 'Eastern',
  rubavu: 'Western', nyabihu: 'Western', ngororero: 'Western', rusizi: 'Western',
  nyamasheke: 'Western', rutsiro: 'Western', karongi: 'Western',
}

// Header text (normalized: strip non-ASCII, lowercase, trim, collapse
// whitespace) -> internal key. Every one of the real 74 columns gets a
// key, even ones with no live data source — this is what makes the clear
// step below wipe stale/junk values from the base file's data rows
// instead of silently leaving them in place (the real historical files
// have known junk in several of these: Approval Date "9300"/"0001",
// Interest Rate a flat "13" that isn't INEMA's real rate, Last/First/Final
// Payment Date identical placeholder values). Keys with no entry in a
// given row's `values` object below are left genuinely blank, matching
// Kevin's explicit decision for Nature/Category/Sector/Employer/Income,
// extended here to every other field with no real schema source — see
// docs/known-gaps.md for the full list and reasoning.
const HEADER_TEXT_TO_KEY: Record<string, string> = {
  'salutation': 'salutation',
  'surname': 'surname',
  'forename or initial 1': 'forename1',
  'forename or initial 2': 'forename2',
  'forename or initial 3': 'forename3',
  'national id number': 'nationalId',
  'passport no': 'passportNo',
  'nationality': 'nationality',
  'tax no': 'taxNo',
  'driving license no': 'drivingLicenseNo',
  'social security number': 'ssn',
  'health insurance number': 'healthInsuranceNumber',
  'marital status': 'maritalStatus',
  'no of dependants': 'dependants',
  'gender': 'gender',
  'date of birth': 'dob',
  'place of birth': 'placeOfBirth',
  'postal address line 1 number': 'postalLine1',
  'postal address line 2 postal code': 'postalLine2',
  'physical address line 1': 'addrLine1',
  'physical address line 2': 'addrLine2',
  'physical address postal code': 'physicalPostalCode',
  'physical address plot number': 'plotNumber',
  'physical address province': 'province',
  'physical address district': 'district',
  'physical address sector': 'sector',
  'physical address cell': 'cell',
  'country': 'country',
  'email address': 'email',
  'residence type': 'residenceType',
  'work telephone': 'workPhone',
  'home telephone': 'homePhone',
  'mobile telephone': 'mobilePhone',
  'fascimile': 'fascimile',
  'employer name': 'employerName',
  'employer address line 1': 'employerAddr1',
  'employer address line 2': 'employerAddr2',
  'employer town': 'employerTown',
  'employer country': 'employerCountry',
  'occupation': 'occupation',
  'income': 'income',
  'income frequency': 'incomeFrequency',
  'group name': 'groupName',
  'group number': 'groupNumber',
  'account number': 'accountNumber',
  'old account number': 'oldAccountNumber',
  'account type': 'accountType',
  'account status': 'accountStatus',
  'classification': 'classification',
  'account owner': 'accountOwner',
  'joint loan participants': 'jointParticipants',
  'currency type': 'currency',
  'date opened': 'dateOpened',
  'date updated': 'dateUpdated',
  'terms duration': 'termsDuration',
  'repayment term': 'repaymentTerm',
  'opening balance / credit limit': 'openingBalance',
  'current balance': 'currentBalance',
  'available credit': 'availableCredit',
  'current balance indicator': 'balanceIndicator',
  'scheduled monthly payment amount': 'scheduledPayment',
  'actual payment amount': 'actualPayment',
  'amount past due': 'pastDue',
  'installments in arrears': 'installmentsArrears',
  'days in arrears': 'daysArrears',
  'date closed': 'dateClosed',
  'last payment date': 'lastPaymentDate',
  'interest rate': 'interestRate',
  'first payment date': 'firstPaymentDate',
  'nature': 'nature',
  'category': 'category',
  'sector of activity': 'sectorOfActivity',
  'approval date': 'approvalDate',
  'final payment date': 'finalPaymentDate',
}

function normalizeHeader(s: unknown): string {
  return String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function findSheetName(wb: any, name: string): string | undefined {
  if (wb.Sheets[name]) return name
  const target = name.trim().toLowerCase()
  return wb.SheetNames.find((n: string) => n.trim().toLowerCase() === target)
}

// Real Rwandan-convention full_name is "SURNAME Forename [Forename2]
// [Forename3]" (surname first, often all-caps) — confirmed against the
// real archived file's Surname/Forename columns matching this pattern for
// every checked row. iacm_clients only stores one `full_name` field, no
// separate surname/forename columns, so this is a real, new heuristic
// split, not an established pattern reused from elsewhere in the
// codebase. Flagged in docs/known-gaps.md: a name that isn't in
// surname-first order will split wrong.
function splitName(fullName: string): { surname: string; forenames: string[] } {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { surname: '', forenames: [] }
  return { surname: parts[0], forenames: parts.slice(1, 4) }
}

function genderCode(g: string | null | undefined): string {
  if (g === 'male') return 'M'
  if (g === 'female') return 'F'
  return ''
}

function maritalCode(m: string | null | undefined): string {
  switch ((m ?? '').toLowerCase()) {
    case 'married': return 'M'
    case 'single': return 'S'
    case 'divorced': return 'D'
    case 'widowed': return 'W'
    default: return ''
  }
}

// 1=Normal, 2=Watch(1-89d), 3=Substandard(90-179d), 4=Doubtful(180-359d),
// 5=Loss(360+d) — the same day thresholds already used in the BNR UI's
// own sheet descriptions (app/admin/iacm/reports/bnr/page.tsx). Unlike
// BNR, which defaults every loan to Normal by deliberate policy (real
// filed BNR practice — see lib/bnr-report.ts), CRB computes this for
// real: Kevin's explicit decision, based on real evidence that at least
// one real CRB filing (Muhorakeye Providence, Jul-2026) reported genuine
// non-Normal arrears.
function classifyByDays(days: number): number {
  if (days <= 0) return 1
  if (days <= 89) return 2
  if (days <= 179) return 3
  if (days <= 359) return 4
  return 5
}

// Pure Y/M/D formatting off UTC getters — safe here specifically because
// the inputs are either (a) Postgres `date` columns, which arrive as
// plain "YYYY-MM-DD" strings with no time component, so `new Date(...)`
// parses them as UTC midnight per the ISO date-only spec, or (b) a fresh
// `new Date()` passed in by the caller for "today". Using UTC getters on
// both keeps this immune to the local-time day-shift bug already found
// and fixed elsewhere (lib/ledger.ts's toLocalDateString).
function toYyyymmdd(d: string | Date | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

async function fetchMostRecentFiledCrbReport(): Promise<Buffer> {
  const supabase = createAdminClient()
  const { data: reports, error } = await supabase
    .from('iacm_crb_filed_reports')
    .select('*')
    .order('submission_date', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const latest = (reports ?? [])[0]
  if (!latest) throw new Error('No filed CRB report found to use as a structural base — archive at least one real filed .xls first.')
  const { data, error: dlErr } = await supabase.storage.from(CRB_BUCKET).download(latest.storage_path)
  if (dlErr || !data) throw new Error(`Failed to download base CRB report: ${dlErr?.message}`)
  return Buffer.from(await data.arrayBuffer())
}

async function fetchOutstandingLoans(supabase: any) {
  const { data, error } = await supabase
    .from('iacm_loans')
    .select('*, iacm_clients(*)')
    .gt('balance_outstanding', 0)
  if (error) throw new Error(error.message)
  return data ?? []
}

// Most recent iacm_payments row per loan_id, used for "Actual Payment
// Amount" — the real column reads as "the last actual payment received",
// not a running total (the adjacent "Scheduled Monthly Payment Amount"
// column is the recurring figure; this one tracks real activity).
async function fetchLatestPaymentByLoan(supabase: any, loanIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (loanIds.length === 0) return map
  const { data, error } = await supabase
    .from('iacm_payments')
    .select('loan_id, payment_date, total_amount')
    .in('loan_id', loanIds)
    .order('payment_date', { ascending: false })
  if (error) throw new Error(error.message)
  for (const row of data ?? []) {
    if (!map.has(row.loan_id)) map.set(row.loan_id, Number(row.total_amount))
  }
  return map
}

// Assigns a durable IFSNNNN account number the first time a client is
// ever included in a CRB export, persisted to iacm_clients.account_number
// so it never changes again (Kevin's explicit decision #4). Sequential
// across the whole table, not per-run — finds the current max in use and
// continues from there. This feature is low-frequency and admin-only
// (one person triggers a monthly report), so a simple max-then-increment
// is safe without extra locking.
async function assignAccountNumbers(supabase: any, clients: any[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const byId = new Map<string, any>()
  for (const c of clients) byId.set(c.id, c)
  const missing = Array.from(byId.values()).filter((c: any) => !c.account_number)
  for (const c of Array.from(byId.values())) if (c.account_number) map.set(c.id, c.account_number)
  if (missing.length === 0) return map

  const { data: existing, error } = await supabase
    .from('iacm_clients')
    .select('account_number')
    .not('account_number', 'is', null)
  if (error) throw new Error(error.message)
  let maxSeq = 0
  for (const row of existing ?? []) {
    const m = /^IFS(\d+)$/.exec(row.account_number ?? '')
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10))
  }

  for (const c of missing) {
    maxSeq += 1
    const acct = `IFS${String(maxSeq).padStart(4, '0')}`
    const { error: updErr } = await supabase.from('iacm_clients').update({ account_number: acct }).eq('id', c.id)
    if (updErr) throw new Error(`Failed to assign account number to client ${c.id}: ${updErr.message}`)
    map.set(c.id, acct)
  }
  return map
}

export interface CrbGenerateResult {
  buffer: Buffer
  loanCount: number
  reportingMonth: string // YYYY-MM
  submissionDate: string // YYYY-MM-DD
}

export async function generateCrbReport(baseFileBuffer?: Buffer): Promise<CrbGenerateResult> {
  const supabase = createAdminClient()
  const base = baseFileBuffer ?? (await fetchMostRecentFiledCrbReport())

  // cellStyles/cellNF: without these, SheetJS's legacy .xls (BIFF8) reader
  // never populates column widths, per-cell number-format codes, or the
  // handful of real style refs the archived file carries — confirmed via
  // direct inspection: a pure no-op read-then-write with these options
  // omitted dropped all 257 of the original Consumer sheet's column
  // widths before any write even happened. Every sheet in the workbook
  // (not just Consumer) is affected, since SheetJS re-serializes the
  // whole in-memory model on write.
  const wb = XLSX.read(base, { type: 'buffer', cellStyles: true, cellNF: true })
  const sheetName = findSheetName(wb, CONSUMER_SHEET)
  if (!sheetName) throw new Error(`"${CONSUMER_SHEET}" sheet not found in base file.`)
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref'] as string)
  const headerRowIdx = range.s.r

  const colMap: Record<string, number> = {}
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellAddr = XLSX.utils.encode_cell({ r: headerRowIdx, c })
    const text = normalizeHeader(ws[cellAddr]?.v)
    const key = HEADER_TEXT_TO_KEY[text]
    if (key) colMap[key] = c
  }
  const foundKeys = new Set(Object.keys(colMap))
  const missingHeaders = Object.keys(HEADER_TEXT_TO_KEY).filter(h => !foundKeys.has(HEADER_TEXT_TO_KEY[h]))
  if (missingHeaders.length > 0) {
    throw new Error(`Base CRB file is missing expected Consumer sheet column(s): ${missingHeaders.join(', ')}`)
  }

  const loans = await fetchOutstandingLoans(supabase)
  const clients = loans.map((l: any) => l.iacm_clients).filter(Boolean)
  const acctMap = await assignAccountNumbers(supabase, clients)
  const paymentMap = await fetchLatestPaymentByLoan(supabase, loans.map((l: any) => l.id))
  const today = new Date()

  // Clear every mapped column across a generous row buffer, not just as
  // many rows as today's loan count — a shrinking loan list (a client
  // fully repays between months) must not leave last month's stale row
  // sitting below the new last row.
  const clearEnd = headerRowIdx + Math.max(loans.length, 50) + 5
  for (let r = headerRowIdx + 1; r <= clearEnd; r++) {
    for (const c of Object.values(colMap)) delete ws[XLSX.utils.encode_cell({ r, c })]
  }

  loans.forEach((l: any, i: number) => {
    const r = headerRowIdx + 1 + i
    const client = l.iacm_clients ?? {}
    const { surname, forenames } = splitName(client.full_name ?? '')
    const days = getDaysOverdue(l.maturity_date, Number(l.balance_outstanding), today)
    const isOverdue = days > 0
    const scheduledPayment = Math.round(Number(l.disbursed_amount ?? 0) * MONTHLY_INTEREST_RATE)

    const values: Record<string, string | number | undefined> = {
      surname,
      forename1: forenames[0],
      forename2: forenames[1],
      forename3: forenames[2],
      nationalId: client.national_id,
      maritalStatus: maritalCode(client.marital_status) || undefined,
      gender: genderCode(client.gender) || undefined,
      addrLine1: client.village || client.cell || undefined,
      province: PROVINCE_BY_DISTRICT[(client.district ?? '').toLowerCase()],
      district: client.district ? String(client.district).toUpperCase() : undefined,
      sector: client.sector ? String(client.sector).toUpperCase() : undefined,
      cell: client.cell ? String(client.cell).toUpperCase() : undefined,
      country: 'RWANDA',
      workPhone: client.phone,
      homePhone: client.phone,
      mobilePhone: client.phone,
      accountNumber: acctMap.get(client.id),
      accountType: 'I',
      accountStatus: 'A',
      accountOwner: 'O',
      currency: 'RWF',
      classification: classifyByDays(days),
      dateOpened: toYyyymmdd(l.disbursement_date) || undefined,
      dateUpdated: toYyyymmdd(today),
      openingBalance: Number(l.disbursed_amount ?? 0),
      currentBalance: Number(l.balance_outstanding ?? 0),
      balanceIndicator: 'C',
      scheduledPayment,
      actualPayment: paymentMap.get(l.id),
      pastDue: isOverdue ? Number(l.balance_outstanding ?? 0) : 0,
      installmentsArrears: isOverdue ? Math.floor(days / (l.repayment_frequency_days || 30)) : 0,
      daysArrears: isOverdue ? days : 0,
      lastPaymentDate: toYyyymmdd(l.last_payment_date) || undefined,
      interestRate: Math.round(Number(l.interest_rate ?? 0) * 12 * 10000) / 100,
      firstPaymentDate: toYyyymmdd(l.first_payment_date) || undefined,
      approvalDate: undefined,
      finalPaymentDate: toYyyymmdd(l.maturity_date) || undefined,
      // Everything else (salutation, passportNo, nationality, taxNo,
      // drivingLicenseNo, ssn, healthInsuranceNumber, dependants, dob,
      // placeOfBirth, postalLine1/2, addrLine2, physicalPostalCode,
      // plotNumber, email, residenceType, fascimile, employer*,
      // occupation, income, incomeFrequency, groupName/Number,
      // oldAccountNumber, jointParticipants, termsDuration,
      // repaymentTerm, availableCredit, dateClosed, nature, category,
      // sectorOfActivity) has no live source and is left undefined —
      // the cell is cleared above and never rewritten, so it renders
      // genuinely blank. See docs/known-gaps.md.
    }

    // Every populated cell in the real archived file — including amounts,
    // dates, and codes that look numeric — is stored as text (t:'s',
    // format "@"), never a real number. Confirmed by direct inspection:
    // "Current Balance" reads back as the string "2000000", not the
    // number 2000000. Writing real numbers here made them right-align
    // instead of left-align like every other cell, a visible difference
    // scanning down a column — so every value is written as text here,
    // matching the original's own convention exactly rather than
    // "improving" on it.
    for (const [key, col] of Object.entries(colMap)) {
      const v = values[key]
      if (v === undefined || v === '') continue
      const addr = XLSX.utils.encode_cell({ r, c: col })
      ws[addr] = { t: 's', v: String(v), z: '@' }
    }
  })

  const newMaxRow = headerRowIdx + loans.length
  if (newMaxRow > range.e.r) {
    range.e.r = newMaxRow
    ws['!ref'] = XLSX.utils.encode_range(range)
  }

  // Row heights do NOT survive this library's BIFF8 writer even with
  // cellStyles:true on both read and write — confirmed via the same
  // no-op test above. That's a real, unfixable-with-this-library gap
  // (2 rows in the real archived file had a non-default height), not
  // something these options can close. See docs/known-gaps.md.
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'biff8', cellStyles: true }) as Buffer
  const now = new Date()
  const reportingMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return {
    buffer,
    loanCount: loans.length,
    reportingMonth,
    submissionDate: now.toISOString().split('T')[0],
  }
}
