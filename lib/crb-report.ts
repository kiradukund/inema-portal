import { createAdminClient } from './supabase'
import { getDaysOverdue, MONTHLY_INTEREST_RATE, classifyByDays } from './calculator'
import { readConsumerRoster, applyRowFieldUpdates, applyRowInsertion, runStage5RowRemoval } from './crb-biff8-patcher'

// Fills the REAL CRB "Consumer" sheet with a fresh snapshot of every
// currently-outstanding loan — NOT a continuation like the BNR
// generator, but a genuine EDIT of last month's real filed file: this
// computes the real diff against live data (who's new, who's fully
// repaid, whose values changed) and applies exactly those changes via
// `lib/crb-biff8-patcher.ts`'s byte-level BIFF8 patcher — the same
// insert/update/remove primitives proven across Stages 1-5 and the
// chained repeat-use test, 2026-08-17. Every OTHER byte in the file
// (fonts, fills, borders, row heights, the 6 non-Consumer sheets, and
// any field this generator has no live source for) survives completely
// untouched, because nothing is ever cleared-and-rewritten from scratch.
// See docs/known-gaps.md for the full history of how this was built.

const CRB_BUCKET = 'crb-filed-reports'

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

// The real header text this generator has a live data source for — the
// only columns `readConsumerRoster`/`applyRowFieldUpdates` ever touch.
// Every other real header (Nature, Category, Employer*, Income*, etc.)
// is deliberately excluded, so a diff-based update never clears or
// overwrites anything a human may have entered there — see
// docs/known-gaps.md for the full blank-by-design list and reasoning.
// Salutation and Sector of Activity added 2026-08-17 after a full
// 74-column audit confirmed real sources exist for both — see the
// comments on `salutationCode()` and `economicSector` below. Terms
// Duration and Repayment Term added 2026-08-17 after pulling the live
// (not the stale tracked supabase.sql) schema found a real column,
// iacm_loans.total_installments, that was missing from every earlier
// pass — see the comments on those two fields in computeFieldValues().
// Nationality, Date of Birth, and Occupation added 2026-08-17 once
// iacm_clients.nationality/date_of_birth/occupation existed for real —
// the New Loan form (app/admin/iacm/loans/new/page.tsx) now collects
// all three directly from Devotha as part of recording a loan.
// Nature and Category added 2026-08-23: confirmed both real BNR code
// tables carry the identical catch-all code "39" (AUTRES CREDITS A
// DECAISSEMENT / Other Disbursement Credits) — see natureCode()/
// categoryCode() below and docs/bnr-codification-reference.json.
// INEMA's loan_type is still too coarse to justify anything more
// specific than that catch-all except for the one confirmed case
// (Salary Advance), so this is no longer the "not granular enough,
// leave blank" gap docs/known-gaps.md describes from 2026-08-23's
// earlier entry — every loan now gets a real, defensible code.
const HEADERS_OF_INTEREST = [
  'Salutation', 'Surname', 'Forename or Initial 1', 'Forename or Initial 2', 'Forename or Initial 3',
  'National ID Number', 'Nationality', 'Marital Status', 'Gender', 'Date of Birth', 'Occupation',
  'Physical Address Line 1', 'Physical Address Province', 'Physical Address District',
  'Physical Address Sector', 'Physical Address Cell', 'Country',
  'Work Telephone', 'Home Telephone', 'Mobile Telephone',
  'Account Number', 'Account Type', 'Account Status', 'Classification', 'Account Owner',
  'Currency Type', 'Date Opened', 'Date Updated', 'Terms Duration', 'Repayment Term',
  'Opening Balance / Credit Limit', 'Current Balance', 'Current Balance Indicator',
  'Scheduled Monthly Payment Amount', 'Actual Payment Amount', 'Amount Past Due',
  'Installments in Arrears', 'Days in Arrears', 'Last Payment Date', 'Interest Rate',
  'First Payment Date', 'Nature', 'Category', 'Sector of Activity', 'Final Payment Date',
  // Added 2026-09-07 (Item 1 of the real CRB field-correction plan,
  // grounded in TransUnion's real Data Specification Document v1.9):
  // "Date Closed" -- the date the loan account was closed, mandatory
  // only when Account Status reflects an actually-closed account.
  // Previously entirely absent from this list, meaning this generator
  // never touched or cleared this cell for any loan.
  'Date Closed',
]

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

// Real archived data (7 preserved rows, confirmed 2026-08-17) shows
// "Mr" for every male client and "Mrs" for every female client — no
// "Miss"/"Ms" ever actually used despite `marital_status` existing as a
// schema field, so this deliberately doesn't attempt a marital-status-
// aware Miss/Mrs distinction (that field is null for all 21 real
// current clients anyway — see docs/known-gaps.md). Confident, gender-
// only derivation matching the real, observed convention exactly.
function salutationCode(g: string | null | undefined): string {
  if (g === 'male') return 'Mr'
  if (g === 'female') return 'Mrs'
  return ''
}

// Maps INEMA's free-text iacm_loans.economic_sector to the real BNR
// 4-digit sector code — see docs/bnr-codification-reference.json
// ("sectorOfActivity.inemaMapping"), confirmed 2026-08-23 against the
// real BNR codification sources. Unmapped/unrecognised text (a future
// economic_sector value not in this list) is left blank rather than
// guessed, same policy as Nature/Category.
const ECONOMIC_SECTOR_TO_BNR_CODE: Record<string, string> = {
  'Other': '0001',
  'Health': '9200',
  'Commerce & Trade': '6000',
}

function economicSectorCode(sector: string | null | undefined): string | undefined {
  if (!sector) return undefined
  return ECONOMIC_SECTOR_TO_BNR_CODE[sector]
}

// Nature and Category — confirmed 2026-08-23, both real BNR code
// tables independently define code "39" as AUTRES CREDITS A
// DECAISSEMENT (Other Disbursement Credits), sitting outside the
// short/medium/long-term buckets each table otherwise organises around.
// Both tables' OTHER codes (Nature 13/24/33, Category 19/20/21/22...)
// require picking a maturity or product bucket first — 39 is the one
// code in each table that doesn't, making it the genuine "not otherwise
// classified" catch-all for any real disbursement credit (which every
// INEMA loan is — none are signature/guarantee-type facilities, the
// other family of codes these tables cover). See
// docs/bnr-codification-reference.json for the full tables.
const NATURE_CATCHALL_CODE = '39'
const CATEGORY_CATCHALL_CODE = '39'

// The one loan_type value specific enough for a real code more precise
// than the catch-all: a Salary Advance is short-term (Nature 13 =
// AUTRES CREDITS A COURT TERME) and personal-purpose (Category 40 =
// CREDITS PERSONNELS). Every other loan_type — including "individual"
// and "Unclassified — pending loan officer confirmation" — falls
// through to the catch-all rather than guessing a maturity/purpose
// bucket with no real basis.
const LOAN_TYPE_NATURE_CODE: Record<string, string> = { 'Salary Advance': '13' }
const LOAN_TYPE_CATEGORY_CODE: Record<string, string> = { 'Salary Advance': '40' }

function natureCode(loanType: string | null | undefined): string {
  return LOAN_TYPE_NATURE_CODE[loanType ?? ''] ?? NATURE_CATCHALL_CODE
}
function categoryCode(loanType: string | null | undefined): string {
  return LOAN_TYPE_CATEGORY_CODE[loanType ?? ''] ?? CATEGORY_CATCHALL_CODE
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

// Loan classification by days in arrears — 1=Normal(0-29d) .. 5=Loss(360+d).
// The day-boundary rule now lives in ONE place, lib/calculator.ts's
// classifyByDays() (imported above), shared with the dashboard portfolio
// chart, the Loan Portfolio page, and the BNR report page's descriptive
// copy — see that function's comment and docs/bnr-codification-reference.json.
// Unlike BNR, which defaults every loan to Normal by deliberate policy
// (real filed BNR practice — see lib/bnr-report.ts), CRB computes this
// for real: Kevin's explicit decision, based on real evidence that at
// least one real CRB filing (Muhorakeye Providence, Jul-2026) reported
// genuine non-Normal arrears.

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

async function fetchMostRecentCrbFile(supabase: any): Promise<Buffer> {
  // `submission_date` is a plain date column with no time component, so
  // on any day this runs more than once (a real, observed case: a test
  // run followed by a real click, both on 2026-08-17), two rows can tie
  // on it — PostgREST doesn't guarantee which tied row comes back first.
  // `uploaded_at` is a real timestamp already on this table; ordering by
  // it as a tiebreaker makes "most recent" unambiguous regardless of how
  // many times this runs on the same calendar day.
  const { data: reports, error } = await supabase
    .from('iacm_crb_filed_reports')
    .select('*')
    .order('submission_date', { ascending: false })
    .order('uploaded_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const latest = (reports ?? [])[0]
  if (!latest) throw new Error('No filed CRB report found to use as a structural base — archive at least one real filed .xls first.')
  const { data, error: dlErr } = await supabase.storage.from(CRB_BUCKET).download(latest.storage_path)
  if (dlErr || !data) throw new Error(`Failed to download base CRB report: ${dlErr?.message}`)
  return Buffer.from(await data.arrayBuffer())
}

// Every generation becomes the base for the NEXT one — "editing forward
// from last month's real submission," per Kevin's explicit framing,
// matching exactly how the chained repeat-use test proved this works.
async function archiveGeneratedReport(supabase: any, buffer: Buffer, filename: string, submissionDate: string): Promise<void> {
  const { error: uploadErr } = await supabase.storage.from(CRB_BUCKET).upload(filename, buffer, {
    contentType: 'application/vnd.ms-excel',
    upsert: true,
  })
  if (uploadErr) throw new Error(`Failed to archive generated CRB report: ${uploadErr.message}`)
  const { error: insertErr } = await supabase.from('iacm_crb_filed_reports').insert({
    submission_date: submissionDate,
    original_filename: filename,
    storage_path: filename,
    file_size_bytes: buffer.length,
  })
  if (insertErr) throw new Error(`Failed to record archived CRB report: ${insertErr.message}`)
}

// Item 2 of the real CRB field-correction plan (2026-09-07), grounded
// in TransUnion's real Data Specification Document v1.9 -- replaced
// fetchOutstandingLoans() (which only ever selected balance_outstanding
// > 0, removed entirely once this and Item 6's wiring landed — no
// longer has any real caller) as the real source feeding
// generateCrbReport(). Fetches EVERY real loan regardless of balance,
// since a fully-repaid
// loan must still be reported (with an updated Account Status and Date
// Closed, Items 2/5), never silently dropped from the file the way
// fetchOutstandingLoans()'s balance filter caused.
export async function fetchAllLoans(supabase: any) {
  const { data, error } = await supabase
    .from('iacm_loans')
    .select('*, iacm_clients(*)')
  if (error) throw new Error(error.message)
  return data ?? []
}

// The Consumer sheet is keyed one row per national_id (readConsumerRoster/
// targetByNationalId), but a real client can have more than one real
// loan over time -- a pre-existing constraint of this generator, not
// something introduced here. This picks which single loan represents
// that client's row:
// - Any currently-active (balance > 0) loan wins, since that's the real,
//   current state to report. If a client somehow has more than one
//   active loan simultaneously (a real, pre-existing ambiguity, not
//   solved here), the most recently disbursed one wins, deterministically.
// - Otherwise every one of the client's loans is fully repaid -- the
//   most recently closed one (by last_payment_date, falling back to
//   disbursement_date if that's ever missing) represents the client,
//   since that's the real, most current closure event.
export function pickRepresentativeLoan(loans: any[]): any {
  const active = loans.filter(l => Number(l.balance_outstanding ?? 0) > 0)
  if (active.length > 0) {
    return active.sort((a, b) => new Date(b.disbursement_date).getTime() - new Date(a.disbursement_date).getTime())[0]
  }
  return loans.sort((a, b) => {
    const aDate = a.last_payment_date ?? a.disbursement_date
    const bDate = b.last_payment_date ?? b.disbursement_date
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })[0]
}

// Groups fetchAllLoans()'s flat list by client national_id and reduces
// each group to its one representative loan via pickRepresentativeLoan()
// -- the real shape generateCrbReport()'s per-client target computation
// needs (Step 6).
export function groupLoansByRepresentative(loans: any[]): Map<string, any> {
  const byNationalId = new Map<string, any[]>()
  for (const loan of loans) {
    const nid = loan.iacm_clients?.national_id
    if (!nid) continue
    const list = byNationalId.get(nid) ?? []
    list.push(loan)
    byNationalId.set(nid, list)
  }
  const result = new Map<string, any>()
  for (const nid of Array.from(byNationalId.keys())) {
    result.set(nid, pickRepresentativeLoan(byNationalId.get(nid)!))
  }
  return result
}

export interface AccountStatusResult {
  status: string       // 'A' | 'T' | 'C' — Active, Early Settlement, Account Closed
  dateClosed?: string  // YYYYMMDD, only ever set alongside 'T'/'C'
}

// Item 3 of the real CRB field-correction plan (2026-09-07), grounded
// in TransUnion's real Data Specification Document v1.9's real
// Account Status code list and Date Closed's own real, conditional
// rule ("mandatory if the credit account is closed, written off or
// paid up") — replaces the hardcoded 'A' every row got before, and is
// the single source both "Account Status" and "Date Closed" in
// computeFieldValues() draw from (Item 5, wired in as its own later
// step), so the two fields can never disagree with each other.
//
// Deliberately does NOT attempt 'W' (Written Off) or 'X' (Paid up
// default) — there is no real data signal in iacm_loans distinguishing
// a genuine bad-debt write-off from an ordinary full repayment, and
// guessing wrong there is worse than leaving it a real, manual,
// exceptional case. 'P' (Paid Up) is also deliberately not used here —
// its own real spec description ("can be active e.g. Revolving
// Credit") is specific to revolving-type facilities INEMA doesn't
// have (every real Account Type is 'I', Instalment).
export function determineAccountStatus(loan: any): AccountStatusResult {
  if (Number(loan.balance_outstanding ?? 0) > 0) {
    return { status: 'A' }
  }
  if (!loan.last_payment_date) {
    // Balance is 0 with no real payment ever recorded (e.g. a waived
    // loan) — 'C' is the safest generic default; no real event date
    // exists to put in Date Closed.
    return { status: 'C' }
  }
  const closedEarly = loan.maturity_date
    ? new Date(loan.last_payment_date).getTime() < new Date(loan.maturity_date).getTime()
    : false
  return {
    status: closedEarly ? 'T' : 'C',
    dateClosed: toYyyymmdd(loan.last_payment_date),
  }
}

// Most recent iacm_payments row per loan_id, used for "Actual Payment
// Amount" — the real column reads as "the last actual payment received",
// not a running total (the adjacent "Scheduled Monthly Payment Amount"
// column is the recurring figure; this one tracks real activity).
export async function fetchLatestPaymentByLoan(supabase: any, loanIds: string[]): Promise<Map<string, number>> {
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

// Item 4 of the real CRB field-correction plan (2026-09-07), grounded
// in TransUnion's real Data Specification Document v1.9: "First
// Payment Date — the date the first payment WAS MADE" — a genuine,
// past, actual event, not a scheduled/contractual one. Mirrors
// fetchLatestPaymentByLoan() above exactly, ordered ascending instead
// of descending so the FIRST real payment per loan wins. Deliberately
// independent of loan.first_payment_date (the iacm_loans column),
// which this report no longer trusts for this field — that column may
// serve a different, legitimate purpose elsewhere in the app (e.g. a
// scheduled/expected date shown to a loan officer), and real data
// showed it holding future dates for loans with zero real payments,
// which is exactly what this field must never contain.
export async function fetchFirstPaymentByLoan(supabase: any, loanIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (loanIds.length === 0) return map
  const { data, error } = await supabase
    .from('iacm_payments')
    .select('loan_id, payment_date')
    .in('loan_id', loanIds)
    .order('payment_date', { ascending: true })
  if (error) throw new Error(error.message)
  for (const row of data ?? []) {
    if (!map.has(row.loan_id)) map.set(row.loan_id, row.payment_date)
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
export async function assignAccountNumbers(supabase: any, clients: any[]): Promise<Map<string, string>> {
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

// Computes this loan's real target values for every header in
// HEADERS_OF_INTEREST, as strings (matching the real archived file's
// own all-text convention — confirmed 2026-08-16 that even amounts and
// dates are stored as text, never real numbers). Undefined/blank
// entries are omitted entirely rather than written as empty strings, so
// a field with genuinely no value never creates a stray cell record.
export function computeFieldValues(
  loan: any,
  client: any,
  acctMap: Map<string, string>,
  paymentMap: Map<string, number>,
  today: Date,
  // Defaults to empty for any other/future caller that doesn't have a
  // real payment map handy -- generateCrbReport() itself now always
  // passes a real one (Item 6), so this default is no longer load-
  // bearing there, just a safe fallback.
  firstPaymentMap: Map<string, string> = new Map()
): Record<string, string> {
  const { surname, forenames } = splitName(client.full_name ?? '')
  const days = getDaysOverdue(loan.maturity_date, Number(loan.balance_outstanding), today)
  const isOverdue = days > 0
  const scheduledPayment = Math.round(Number(loan.disbursed_amount ?? 0) * MONTHLY_INTEREST_RATE)
  // Item 5 of the real CRB field-correction plan (2026-09-07) — computed
  // once, reused for both Account Status and Date Closed below, so the
  // two fields can never disagree with each other the way the real,
  // pre-existing data does today.
  const accountStatus = determineAccountStatus(loan)

  const raw: Record<string, string | number | undefined> = {
    'Salutation': salutationCode(client.gender) || undefined,
    'Surname': surname,
    'Forename or Initial 1': forenames[0],
    'Forename or Initial 2': forenames[1],
    'Forename or Initial 3': forenames[2],
    'National ID Number': client.national_id,
    'Nationality': client.nationality || undefined,
    'Marital Status': maritalCode(client.marital_status) || undefined,
    'Gender': genderCode(client.gender) || undefined,
    'Date of Birth': toYyyymmdd(client.date_of_birth) || undefined,
    'Occupation': client.occupation || undefined,
    'Physical Address Line 1': client.village || client.cell || undefined,
    'Physical Address Province': PROVINCE_BY_DISTRICT[(client.district ?? '').toLowerCase()],
    'Physical Address District': client.district ? String(client.district).toUpperCase() : undefined,
    'Physical Address Sector': client.sector ? String(client.sector).toUpperCase() : undefined,
    'Physical Address Cell': client.cell ? String(client.cell).toUpperCase() : undefined,
    'Country': 'RWANDA',
    'Work Telephone': client.phone,
    'Home Telephone': client.phone,
    'Mobile Telephone': client.phone,
    'Account Number': acctMap.get(client.id),
    'Account Type': 'I',
    // Item 5, real fix (2026-09-07): was hardcoded 'A' for every loan
    // regardless of real status -- see determineAccountStatus() above.
    'Account Status': accountStatus.status,
    'Account Owner': 'O',
    'Currency Type': 'RWF',
    'Classification': classifyByDays(days),
    'Date Opened': toYyyymmdd(loan.disbursement_date) || undefined,
    'Date Updated': toYyyymmdd(today),
    // Real source, found 2026-08-17 pulling the live schema directly
    // (absent from the tracked supabase.sql). Currently 1 for every real
    // loan (unused in practice today, same situation as economic_sector
    // below) — wired in anyway so it starts reflecting real values the
    // moment loan officers set it per loan, with no further generator
    // change needed.
    'Terms Duration': loan.total_installments,
    // BUL (bullet — principal due in full at maturity) vs MTH (monthly
    // installments), derived from the same real total_installments
    // field: exactly 1 installment means a single bullet payment: more
    // than 1 means a real monthly repayment schedule. Kevin's confirmed
    // rule, 2026-08-17 — not a guess like the earlier, abandoned attempt
    // to infer this from repayment_frequency_days alone.
    'Repayment Term': Number(loan.total_installments ?? 1) > 1 ? 'MTH' : 'BUL',
    'Opening Balance / Credit Limit': Number(loan.disbursed_amount ?? 0),
    'Current Balance': Number(loan.balance_outstanding ?? 0),
    'Current Balance Indicator': 'C',
    'Scheduled Monthly Payment Amount': scheduledPayment,
    // Item 1, real fix (2026-09-07): 0, not blank, when no real payment
    // has occurred yet -- matches the real spec's own Mandatory flag for
    // this field.
    'Actual Payment Amount': paymentMap.get(loan.id) ?? 0,
    'Amount Past Due': isOverdue ? Number(loan.balance_outstanding ?? 0) : 0,
    'Installments in Arrears': isOverdue ? Math.floor(days / (loan.repayment_frequency_days || 30)) : 0,
    'Days in Arrears': isOverdue ? days : 0,
    'Last Payment Date': toYyyymmdd(loan.last_payment_date) || undefined,
    'Interest Rate': Math.round(Number(loan.interest_rate ?? 0) * 12 * 10000) / 100,
    // Item 3, real fix (2026-09-07): sourced from firstPaymentMap (the
    // real, actual first payment date -- see fetchFirstPaymentByLoan()),
    // not loan.first_payment_date, which real data showed holding
    // future, scheduled values -- exactly what the real spec says this
    // field must never contain ("the date the first payment WAS MADE").
    // Correctly blank/omitted when no real payment has happened yet.
    'First Payment Date': toYyyymmdd(firstPaymentMap.get(loan.id)) || undefined,
    // Item 2, real fix (2026-09-07): only ever set alongside a genuinely
    // closed Account Status (T/C) -- see determineAccountStatus() above.
    // undefined (correctly omitted) for an active loan, matching the
    // real spec's own conditional rule instead of never being written
    // at all.
    'Date Closed': accountStatus.dateClosed,
    // Fixed 2026-08-23 — see natureCode()/categoryCode() above. Was
    // previously excluded entirely (no confident mapping existed);
    // now every loan gets a real, defensible code via the catch-all.
    'Nature': natureCode(loan.loan_type),
    'Category': categoryCode(loan.loan_type),
    // Real, semantically-correct source (iacm_loans.economic_sector),
    // converted to the real BNR 4-digit code — fixed 2026-08-23; this
    // previously wrote INEMA's raw English text ("Other", "Health",
    // "Commerce & Trade") straight into the CRB file, which isn't a
    // valid value for this field. See economicSectorCode() above and
    // docs/bnr-codification-reference.json.
    'Sector of Activity': economicSectorCode(loan.economic_sector),
    'Final Payment Date': toYyyymmdd(loan.maturity_date) || undefined,
  }

  const values: Record<string, string> = {}
  for (const [header, v] of Object.entries(raw)) {
    if (v === undefined || v === '') continue
    values[header] = String(v)
  }
  return values
}

export interface CrbGenerateResult {
  buffer: Buffer
  loanCount: number
  addedCount: number
  updatedCount: number
  removedCount: number
  reportingMonth: string // YYYY-MM
  submissionDate: string // YYYY-MM-DD
  filename: string
}

// baseFileBufferOverride: test-only hook, not used by the live route —
// lets verification re-run the real diff-and-patch logic against a
// specific base file (e.g. the real pre-corruption archive) instead of
// whatever is currently "most recent," without needing to touch/roll
// back real archive state to test against an earlier point in time.
export async function generateCrbReport(baseFileBufferOverride?: Buffer): Promise<CrbGenerateResult> {
  const supabase = createAdminClient()
  const baseBuffer = baseFileBufferOverride ?? (await fetchMostRecentCrbFile(supabase))

  // Item 6, real fix (2026-09-07): fetchAllLoans() + groupLoansByRepresentative()
  // replace fetchOutstandingLoans() -- every real loan is now considered,
  // not just currently-outstanding ones, so a fully-repaid client is
  // updated to a real closed status (Items 2/3/5) instead of vanishing
  // from the report the way the old balance-filtered fetch caused.
  const allLoans = await fetchAllLoans(supabase)
  const representativeByNationalId = groupLoansByRepresentative(allLoans)
  const representativeLoans = Array.from(representativeByNationalId.values())
  const clients = representativeLoans.map((l: any) => l.iacm_clients).filter(Boolean)
  const acctMap = await assignAccountNumbers(supabase, clients)
  const paymentMap = await fetchLatestPaymentByLoan(supabase, representativeLoans.map((l: any) => l.id))
  const firstPaymentMap = await fetchFirstPaymentByLoan(supabase, representativeLoans.map((l: any) => l.id))
  const today = new Date()

  const targetByNationalId = new Map<string, Record<string, string>>()
  for (const nationalId of Array.from(representativeByNationalId.keys())) {
    const loan = representativeByNationalId.get(nationalId)!
    const client = loan.iacm_clients
    if (!client?.national_id) continue
    targetByNationalId.set(nationalId, computeFieldValues(loan, client, acctMap, paymentMap, today, firstPaymentMap))
  }

  const currentRoster = readConsumerRoster(baseBuffer, HEADERS_OF_INTEREST)
  const currentIds = new Set(currentRoster.rowsByNationalId.keys())
  const targetIds = new Set(targetByNationalId.keys())

  const toRemove = Array.from(currentIds).filter(id => !targetIds.has(id))
  const toAdd = Array.from(targetIds).filter(id => !currentIds.has(id))
  const toUpdate = Array.from(targetIds).filter(id => currentIds.has(id))

  // Removals first: row numbers shift after each one, so re-derive the
  // current roster fresh before every single removal rather than trusting
  // row numbers computed before any edits happened.
  let buffer = baseBuffer
  for (const nationalId of toRemove) {
    const roster = readConsumerRoster(buffer, HEADERS_OF_INTEREST)
    const entry = roster.rowsByNationalId.get(nationalId)
    if (!entry) continue // already gone, e.g. duplicate national_id edge case
    const result = runStage5RowRemoval(buffer, entry.row)
    buffer = result.buffer
  }

  // Updates: no removal happens in this loop, so no row renumbers — a
  // single fresh roster read up front is enough for every update call.
  const rosterAfterRemovals = readConsumerRoster(buffer, HEADERS_OF_INTEREST)
  let updatedCount = 0
  for (const nationalId of toUpdate) {
    const entry = rosterAfterRemovals.rowsByNationalId.get(nationalId)
    if (!entry) continue
    const target = targetByNationalId.get(nationalId)!
    const result = applyRowFieldUpdates(buffer, entry.row, target)
    buffer = result.buffer
    if (Object.keys(result.changedFields).length > 0) updatedCount++
  }

  // Insertions last: each one always appends at "current last row + 1",
  // re-derived fresh inside applyRowInsertion on every call.
  for (const nationalId of toAdd) {
    const target = targetByNationalId.get(nationalId)!
    const result = applyRowInsertion(buffer, target)
    buffer = result.buffer
  }

  const reportingMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`
  const submissionDate = today.toISOString().split('T')[0]
  // CRBTTYYYYMMDDVVV.BBB.xls — Kevin's confirmed spec. VVV is the daily
  // sequence number; hardcoded to "001" since there's no real rule yet
  // for what a same-day second generation should use (no real historical
  // file shows more than one filing per day to confirm a pattern against)
  // — a second report generated on the same date will overwrite the same
  // filename. Flagged as a decision Kevin can revisit, not silently
  // assumed. BBB=730 is fixed, matching both real archived filings'
  // ".730" suffix.
  const filename = `CRBTT${submissionDate.replace(/-/g, '')}001.730.xls`

  await archiveGeneratedReport(supabase, buffer, filename, submissionDate)

  return {
    buffer,
    // representativeLoans.length, not allLoans.length -- this counts
    // real reported rows (one per client), matching what "loanCount"
    // has always meant here, now that a client can have more than one
    // real loan in the underlying data (Item 2).
    loanCount: representativeLoans.length,
    addedCount: toAdd.length,
    updatedCount,
    removedCount: toRemove.length,
    reportingMonth,
    submissionDate,
    filename,
  }
}
