import { createAdminClient } from './supabase'
import { getDaysOverdue, MONTHLY_INTEREST_RATE } from './calculator'
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
  'First Payment Date', 'Sector of Activity', 'Final Payment Date',
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

// Computes this loan's real target values for every header in
// HEADERS_OF_INTEREST, as strings (matching the real archived file's
// own all-text convention — confirmed 2026-08-16 that even amounts and
// dates are stored as text, never real numbers). Undefined/blank
// entries are omitted entirely rather than written as empty strings, so
// a field with genuinely no value never creates a stray cell record.
function computeFieldValues(
  loan: any,
  client: any,
  acctMap: Map<string, string>,
  paymentMap: Map<string, number>,
  today: Date
): Record<string, string> {
  const { surname, forenames } = splitName(client.full_name ?? '')
  const days = getDaysOverdue(loan.maturity_date, Number(loan.balance_outstanding), today)
  const isOverdue = days > 0
  const scheduledPayment = Math.round(Number(loan.disbursed_amount ?? 0) * MONTHLY_INTEREST_RATE)

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
    'Account Status': 'A',
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
    'Actual Payment Amount': paymentMap.get(loan.id),
    'Amount Past Due': isOverdue ? Number(loan.balance_outstanding ?? 0) : 0,
    'Installments in Arrears': isOverdue ? Math.floor(days / (loan.repayment_frequency_days || 30)) : 0,
    'Days in Arrears': isOverdue ? days : 0,
    'Last Payment Date': toYyyymmdd(loan.last_payment_date) || undefined,
    'Interest Rate': Math.round(Number(loan.interest_rate ?? 0) * 12 * 10000) / 100,
    'First Payment Date': toYyyymmdd(loan.first_payment_date) || undefined,
    // Real, semantically-correct source (iacm_loans.economic_sector) —
    // confirmed 2026-08-17 to be null for every real loan today, so this
    // is currently inert (produces no visible cell either way), but
    // starts populating automatically the moment loan officers begin
    // recording it, with no further generator change needed.
    'Sector of Activity': loan.economic_sector || undefined,
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

  const loans = await fetchOutstandingLoans(supabase)
  const clients = loans.map((l: any) => l.iacm_clients).filter(Boolean)
  const acctMap = await assignAccountNumbers(supabase, clients)
  const paymentMap = await fetchLatestPaymentByLoan(supabase, loans.map((l: any) => l.id))
  const today = new Date()

  const targetByNationalId = new Map<string, Record<string, string>>()
  for (const loan of loans) {
    const client = loan.iacm_clients
    if (!client?.national_id) continue
    targetByNationalId.set(client.national_id, computeFieldValues(loan, client, acctMap, paymentMap, today))
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
    loanCount: loans.length,
    addedCount: toAdd.length,
    updatedCount,
    removedCount: toRemove.length,
    reportingMonth,
    submissionDate,
    filename,
  }
}
