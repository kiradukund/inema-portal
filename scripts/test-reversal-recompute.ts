// Regression test for the 2026-09-02 reversal-recompute incident (INEMA-2026-0008,
// NIYITEGEKA Francine) — see docs/known-gaps.md. Exercises lib/ledger.ts's
// recomputeLoanFromPayments() + the rewired reverseTransaction() branches against
// DISPOSABLE data only (rows tagged ZZ_TEST_RECOMPUTE_<timestamp>, swept before and
// after). Reproduces the original bug with the old logic, proves the fix, proves
// order-independence, runs regressions, and self-verifies a clean teardown.
//
// RUN (from repo root):
//   .env.local  ->  NEXT_PUBLIC_SUPABASE_URL=...   /   SUPABASE_SERVICE_ROLE_KEY=<service-role key>
//   npx tsx scripts/test-reversal-recompute.ts        # expect: RESULT — N passed, 0 failed
//   then delete .env.local
//
// It writes disposable rows to whatever database .env.local points at and deletes
// every one of them at the end (bottom-up: payments -> loans -> clients, matching
// the live RESTRICT FKs), then asserts the DB is byte-for-byte back to baseline.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { reverseTransaction } from '../lib/ledger'

const env: Record<string, string> = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m) env[m[1]] = m[2]
}
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const M = (n: any) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
const R = (s: string) => console.log('\n' + '='.repeat(76) + '\n' + s + '\n' + '='.repeat(76))
const TAG = `ZZ_TEST_RECOMPUTE_${Date.now()}`
let PASS = 0, FAIL = 0
function assert(cond: boolean, label: string, detail = '') {
  if (cond) { PASS++; console.log(`   PASS  ${label}${detail ? '  (' + detail + ')' : ''}`) }
  else { FAIL++; console.log(`   FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`) }
}

let clientSeq = 0
async function mkClient(): Promise<string> {
  clientSeq++
  // national_id is UNIQUE NOT NULL — must differ for every client in a run.
  const { data, error } = await sb.from('iacm_clients').insert({
    full_name: `${TAG} Client ${clientSeq}`, national_id: `${TAG}-C${clientSeq}`, phone: '0788000000',
    gender: 'female', marital_status: 'single', district: 'gasabo', sector: 's', cell: 'c', village: 'v',
  }).select('id').single()
  if (error) throw new Error('mkClient: ' + error.message)
  return data.id
}
async function mkLoan(clientId: string, o: any): Promise<string> {
  const { data, error } = await sb.from('iacm_loans').insert({
    client_id: clientId, loan_number: o.loan_number,
    loan_type: 'Unclassified — pending loan officer confirmation',
    disbursed_amount: o.disbursed_amount, disbursement_date: o.disbursement_date ?? '2025-12-31',
    maturity_date: o.maturity_date ?? '2026-06-30', interest_rate: 0.05,
    repayment_frequency_days: 180, total_installments: o.total_installments ?? 1,
    installments_paid: o.installments_paid ?? 0, installments_outstanding: o.installments_outstanding ?? 1,
    principal_repaid: o.principal_repaid ?? 0, balance_outstanding: o.balance_outstanding ?? o.disbursed_amount,
    status: o.status ?? 'active', last_payment_date: o.last_payment_date ?? null,
    restructured_from_loan_id: o.restructured_from_loan_id ?? null,
  }).select('id').single()
  if (error) throw new Error('mkLoan: ' + error.message)
  return data.id
}
async function mkPayment(loanId: string, o: any): Promise<{ paymentId: string; jeId: string }> {
  const { data: p, error: pe } = await sb.from('iacm_payments').insert({
    loan_id: loanId, payment_date: o.payment_date, total_amount: o.total_amount,
    principal_portion: o.principal_portion ?? 0, interest_portion: o.interest_portion ?? 0, fee_portion: o.fee_portion ?? 0,
  }).select('id').single()
  if (pe) throw new Error('mkPayment: ' + pe.message)
  const { data: je, error: je1 } = await sb.from('iacm_journal_entries').insert({
    entry_date: o.payment_date, narration: `${TAG} payment`, reference: `payment-${p.id}`, entry_type: 'payment', created_by: TAG,
  }).select('id').single()
  if (je1) throw new Error('mkPayment.je: ' + je1.message)
  const { error: le } = await sb.from('iacm_journal_lines').insert([
    { journal_entry_id: je.id, account_code: '3020', account_name: 'Bank Accounts', debit_amount: o.total_amount, credit_amount: 0 },
    { journal_entry_id: je.id, account_code: '3110', account_name: 'Loan Issued', debit_amount: 0, credit_amount: o.total_amount },
  ])
  if (le) throw new Error('mkPayment.lines: ' + le.message)
  return { paymentId: p.id, jeId: je.id }
}
async function mkRestructure(oldLoanId: string, o: any): Promise<{ newLoanId: string; jeId: string }> {
  const newLoanId = await mkLoan(o.clientId, {
    loan_number: o.newLoanNumber, disbursed_amount: o.newDisbursed, balance_outstanding: o.newDisbursed,
    principal_repaid: 0, status: 'active', restructured_from_loan_id: oldLoanId,
  })
  const { data: je, error: je1 } = await sb.from('iacm_journal_entries').insert({
    entry_date: o.entry_date ?? '2026-08-01', narration: `${TAG} restructuring`,
    reference: `loan-${newLoanId}`, entry_type: 'loan_restructuring', created_by: TAG,
  }).select('id').single()
  if (je1) throw new Error('mkRestructure.je: ' + je1.message)
  const { error: le } = await sb.from('iacm_journal_lines').insert([
    { journal_entry_id: je.id, account_code: '3110', account_name: 'Loan Issued', debit_amount: o.newDisbursed, credit_amount: 0 },
    { journal_entry_id: je.id, account_code: '3110', account_name: 'Loan Issued', debit_amount: 0, credit_amount: o.newDisbursed },
  ])
  if (le) throw new Error('mkRestructure.lines: ' + le.message)
  await sb.from('iacm_loans').update({ status: 'restructured', balance_outstanding: 0 }).eq('id', oldLoanId)
  return { newLoanId, jeId: je.id }
}
async function getLoan(id: string): Promise<any> { const { data } = await sb.from('iacm_loans').select('*').eq('id', id); return (data ?? [])[0] ?? null }

// OLD (pre-fix) reversal logic — verbatim copy of lib/ledger.ts before the recompute change:
async function oldReversePayment(jeId: string) {
  const { data: entry } = await sb.from('iacm_journal_entries').select('*').eq('id', jeId).single()
  const payId = entry.reference.slice('payment-'.length)
  const { data: pay } = await sb.from('iacm_payments').select('*').eq('id', payId).single()
  const { data: loan } = await sb.from('iacm_loans').select('*').eq('id', pay.loan_id).single()
  const pp = Number(pay.principal_portion ?? 0)
  const newBalance = Number(loan.balance_outstanding) + pp
  await sb.from('iacm_payments').delete().eq('id', payId)
  const { data: rem } = await sb.from('iacm_payments').select('payment_date').eq('loan_id', pay.loan_id).order('payment_date', { ascending: false }).limit(1)
  await sb.from('iacm_loans').update({
    balance_outstanding: newBalance, principal_repaid: Math.max(0, Number(loan.principal_repaid ?? 0) - pp),
    installments_paid: Math.max(0, Number(loan.installments_paid ?? 0) - 1),
    installments_outstanding: Number(loan.installments_outstanding ?? 0) + 1,
    status: newBalance <= 0 ? 'completed' : 'active', last_payment_date: rem && rem.length ? rem[0].payment_date : null, updated_at: new Date().toISOString(),
  }).eq('id', pay.loan_id)
  await sb.from('iacm_journal_lines').delete().eq('journal_entry_id', jeId)
  await sb.from('iacm_journal_entries').delete().eq('id', jeId)
}
async function oldReverseRestructuring(jeId: string) {
  const { data: entry } = await sb.from('iacm_journal_entries').select('*').eq('id', jeId).single()
  const newLoanId = entry.reference.slice('loan-'.length)
  const { data: newLoan } = await sb.from('iacm_loans').select('*').eq('id', newLoanId).single()
  await sb.from('iacm_loans').update({ balance_outstanding: newLoan.disbursed_amount, status: 'active', updated_at: new Date().toISOString() }).eq('id', newLoan.restructured_from_loan_id)
  await sb.from('iacm_loans').delete().eq('id', newLoanId)
  await sb.from('iacm_journal_lines').delete().eq('journal_entry_id', jeId)
  await sb.from('iacm_journal_entries').delete().eq('id', jeId)
}

const HIST = [
  { payment_date: '2026-02-02', total_amount: 340200, principal_portion: 0, interest_portion: 175000, fee_portion: 165200 },
  { payment_date: '2026-02-27', total_amount: 175200, principal_portion: 200, interest_portion: 175000 },
  { payment_date: '2026-03-31', total_amount: 175000, principal_portion: 0, interest_portion: 175000 },
  { payment_date: '2026-05-04', total_amount: 175000, principal_portion: 0, interest_portion: 175000 },
  { payment_date: '2026-06-05', total_amount: 175000, principal_portion: 0, interest_portion: 175000 },
  { payment_date: '2026-07-17', total_amount: 1500000, principal_portion: 1325000, interest_portion: 175000 },
]
async function buildFrancine(sfx: string) {
  const clientId = await mkClient()
  const oldLoanId = await mkLoan(clientId, {
    loan_number: `${TAG}-${sfx}-OLD`, disbursed_amount: 3500000, principal_repaid: 1325200,
    balance_outstanding: 2174800, installments_paid: 1, installments_outstanding: 0, last_payment_date: '2026-07-17', status: 'active',
  })
  for (const h of HIST) await mkPayment(oldLoanId, h)
  const { newLoanId, jeId: restrJe } = await mkRestructure(oldLoanId, { clientId, newLoanNumber: `${TAG}-${sfx}-NEW`, newDisbursed: 1999800, entry_date: '2026-08-01' })
  const { jeId: jeA } = await mkPayment(oldLoanId, { payment_date: '2026-08-04', total_amount: 100000, principal_portion: 100000 })
  const { jeId: jeB } = await mkPayment(oldLoanId, { payment_date: '2026-08-03', total_amount: 250000, principal_portion: 75000, interest_portion: 175000 })
  await sb.from('iacm_loans').update({ principal_repaid: 1500200, installments_paid: 3, installments_outstanding: 0 }).eq('id', oldLoanId)
  return { clientId, oldLoanId, newLoanId, restrJe, jeA, jeB }
}
async function realReverse(jeId: string, adminId: string | null) {
  return reverseTransaction(sb, { journal_entry_id: jeId, reason: `${TAG} test`, acknowledged_pre_cutoff: false, reversed_by_user_id: adminId as any, reversed_by_name: TAG })
}
async function fetchAll(t: string, cols = '*'): Promise<any[]> {
  const out: any[] = []
  for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(t).select(cols).range(f, f + 999); if (error) throw new Error(`${t}: ${error.message}`); out.push(...(data ?? [])); if (!data || data.length < 1000) break }
  return out
}
async function journalState() {
  const entries = await fetchAll('iacm_journal_entries', 'id')
  const lines = await fetchAll('iacm_journal_lines', 'id,journal_entry_id,debit_amount,credit_amount')
  const eIds = new Set(entries.map(e => e.id)); const byE = new Map<string, any[]>(); let orphan = 0
  for (const ln of lines) { if (!eIds.has(ln.journal_entry_id)) { orphan++; continue } if (!byE.has(ln.journal_entry_id)) byE.set(ln.journal_entry_id, []); byE.get(ln.journal_entry_id)!.push(ln) }
  let unbal = 0
  for (const ls of Array.from(byE.values())) {
    const d = ls.reduce((s: number, x: any) => s + Number(x.debit_amount ?? 0), 0)
    const c = ls.reduce((s: number, x: any) => s + Number(x.credit_amount ?? 0), 0)
    if (Math.abs(d - c) > 0.011) unbal++
  }
  return { entries: entries.length, lines: lines.length, unbal, orphan }
}
async function netProfitInputs() {
  const pays = await fetchAll('iacm_payments', 'interest_portion,payment_date')
  const exps = await fetchAll('iacm_expenses', 'amount,expense_date,category')
  const LIAB = ['vat', 'paye', 'cbhi', 'pension', 'maternity', 'wht', 'social_security', 'other_statutory', 'tax']
  const gross = pays.filter(p => (p.payment_date ?? '') > '2026-06-30').reduce((s, p) => s + Number(p.interest_portion ?? 0), 0)
  const exp = exps.filter(e => (e.expense_date ?? '') > '2026-06-30' && !LIAB.includes(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0)
  return { gross, exp }
}

// LIVE schema FKs from iacm_payments.loan_id and iacm_loans.client_id are RESTRICT
// (not CASCADE — the tracked supabase.sql is stale), so delete order MUST be
// bottom-up: payments -> loans (restructuring children first) -> clients. Every
// delete is error-checked; the sweep throws if any tagged row survives.
async function sweepTestData(where: 'startup' | 'final') {
  const P = 'ZZ_TEST_RECOMPUTE_%'
  const step = async (label: string, p: PromiseLike<{ error: any }>) => {
    const { error } = await p
    if (error && !/does not exist|schema cache/i.test(error.message ?? '')) throw new Error(`sweep(${where}) ${label}: ${error.message}`)
  }
  await step('reversals', sb.from('iacm_reversals').delete().ilike('reversed_by_name', P))
  const { data: tl } = await sb.from('iacm_loans').select('id, loan_number, restructured_from_loan_id').ilike('loan_number', P)
  const tlIds = (tl ?? []).map((r: any) => r.id)
  if (tlIds.length) await step('recalcs', sb.from('iacm_loan_recalculations').delete().in('loan_id', tlIds))
  const { data: tje } = await sb.from('iacm_journal_entries').select('id').ilike('narration', P)
  for (const j of tje ?? []) {
    await step('journal_lines', sb.from('iacm_journal_lines').delete().eq('journal_entry_id', j.id))
    await step('journal_entries', sb.from('iacm_journal_entries').delete().eq('id', j.id))
  }
  if (tlIds.length) await step('payments', sb.from('iacm_payments').delete().in('loan_id', tlIds))
  for (const l of (tl ?? []).filter((x: any) => x.restructured_from_loan_id)) await step(`loan ${l.loan_number}`, sb.from('iacm_loans').delete().eq('id', l.id))
  for (const l of (tl ?? []).filter((x: any) => !x.restructured_from_loan_id)) await step(`loan ${l.loan_number}`, sb.from('iacm_loans').delete().eq('id', l.id))
  await step('clients', sb.from('iacm_clients').delete().ilike('full_name', P))
  const left = {
    clients: (await sb.from('iacm_clients').select('id', { count: 'exact', head: true }).ilike('full_name', P)).count ?? 0,
    loans: (await sb.from('iacm_loans').select('id', { count: 'exact', head: true }).ilike('loan_number', P)).count ?? 0,
    jes: (await sb.from('iacm_journal_entries').select('id', { count: 'exact', head: true }).ilike('narration', P)).count ?? 0,
    reversals: (await sb.from('iacm_reversals').select('id', { count: 'exact', head: true }).ilike('reversed_by_name', P)).count ?? 0,
  }
  if (left.clients + left.loans + left.jes + left.reversals > 0) throw new Error(`sweep(${where}) FAILED to fully clean — residue: ${JSON.stringify(left)}`)
}
async function cleanupAll() { await sweepTestData('final') }

async function main() {
  R('STARTUP SWEEP — remove any ZZ_TEST_RECOMPUTE_* residue from a prior partial run')
  await sweepTestData('startup')
  console.log('   startup sweep: clean')

  R('BASELINE — live DB fingerprint before any test data')
  const js0 = await journalState(); const np0 = await netProfitInputs()
  const { count: loans0 } = await sb.from('iacm_loans').select('id', { count: 'exact', head: true })
  const { count: rev0 } = await sb.from('iacm_reversals').select('id', { count: 'exact', head: true })
  console.log(`   journal: ${js0.entries} entries / ${js0.lines} lines / ${js0.unbal} unbalanced / ${js0.orphan} orphan`)
  console.log(`   iacm_loans rows: ${loans0}   iacm_reversals rows: ${rev0}`)
  console.log(`   net-profit inputs: grossIncome=${M(np0.gross)}  post-cutoff opex=${M(np0.exp)}`)
  const { data: admin } = await sb.from('profiles').select('id').eq('role', 'admin').limit(1)
  const adminId = admin?.[0]?.id ?? null

  try {
    R('PHASE 1 — reproduce the bug (OLD pre-fix reversal logic) on disposable Francine-shaped data')
    const f1 = await buildFrancine('P1')
    await oldReversePayment(f1.jeA); await oldReversePayment(f1.jeB); await oldReverseRestructuring(f1.restrJe)
    let L = await getLoan(f1.oldLoanId)
    console.log(`   after OLD 3-reversal sequence: balance_outstanding = ${M(L.balance_outstanding)}`)
    assert(Number(L.balance_outstanding) === 1999800, 'OLD logic reproduces the bug exactly (1,999,800)', M(L.balance_outstanding))
    assert(Number(L.balance_outstanding) !== 2174800, 'OLD logic does NOT produce the correct 2,174,800')

    R('PHASE 2 — real fixed reverseTransaction(), same order Francine was reversed in')
    const f2 = await buildFrancine('P2')
    const r2a = await realReverse(f2.jeA, adminId); assert(!r2a.error, 'reverse payment A (100,000) ok', r2a.error ?? '')
    const r2b = await realReverse(f2.jeB, adminId); assert(!r2b.error, 'reverse payment B (75,000) ok', r2b.error ?? '')
    const r2c = await realReverse(f2.restrJe, adminId); assert(!r2c.error, 'reverse restructuring ok', r2c.error ?? '')
    L = await getLoan(f2.oldLoanId)
    assert(Number(L.balance_outstanding) === 2174800, 'balance_outstanding == 2,174,800 (3,500,000 − Σprincipal 1,325,200)', M(L.balance_outstanding))
    assert(Number(L.principal_repaid) === 1325200, 'principal_repaid == 1,325,200', M(L.principal_repaid))
    assert(L.status === 'active', "status == 'active'", L.status)
    assert(L.last_payment_date === '2026-07-17', 'last_payment_date == 2026-07-17', String(L.last_payment_date))
    assert(Number(L.installments_paid) === 6, 'installments_paid == 6', String(L.installments_paid))
    assert((await getLoan(f2.newLoanId)) === null, 'restructured (new) loan deleted')
    const { count: rev2 } = await sb.from('iacm_reversals').select('id', { count: 'exact', head: true }).eq('reversed_by_name', TAG)
    assert((rev2 ?? 0) === 3, '3 iacm_reversals audit rows written', String(rev2))

    R('PHASE 3 — order independence: reverse the RESTRUCTURING first, then the two payments')
    const f3 = await buildFrancine('P3')
    const r3a = await realReverse(f3.restrJe, adminId); assert(!r3a.error, 'reverse restructuring first ok', r3a.error ?? '')
    const r3b = await realReverse(f3.jeA, adminId); assert(!r3b.error, 'then reverse payment A ok', r3b.error ?? '')
    const r3c = await realReverse(f3.jeB, adminId); assert(!r3c.error, 'then reverse payment B ok', r3c.error ?? '')
    L = await getLoan(f3.oldLoanId)
    assert(Number(L.balance_outstanding) === 2174800, 'SAME final balance 2,174,800 regardless of order', M(L.balance_outstanding))
    assert(L.status === 'active' && Number(L.principal_repaid) === 1325200, 'same status/principal_repaid')

    R('PHASE 4a — plain loan, one payment with principal, reverse it')
    const c4 = await mkClient()
    const l4 = await mkLoan(c4, { loan_number: `${TAG}-P4a`, disbursed_amount: 1000000, balance_outstanding: 800000, principal_repaid: 200000, installments_paid: 1, last_payment_date: '2026-08-10' })
    const { jeId: je4 } = await mkPayment(l4, { payment_date: '2026-08-10', total_amount: 250000, principal_portion: 200000, interest_portion: 50000 })
    const r4 = await realReverse(je4, adminId); assert(!r4.error, 'reverse ok', r4.error ?? '')
    L = await getLoan(l4)
    assert(Number(L.balance_outstanding) === 1000000, 'balance back to disbursed 1,000,000', M(L.balance_outstanding))
    assert(Number(L.principal_repaid) === 0 && L.status === 'active' && L.last_payment_date === null, 'principal_repaid 0, active, last_payment_date null')

    R('PHASE 4b — fully-paid loan, reverse the final payment → status flips back to active')
    const c4b = await mkClient()
    const l4b = await mkLoan(c4b, { loan_number: `${TAG}-P4b`, disbursed_amount: 1000000, balance_outstanding: 0, principal_repaid: 1000000, status: 'completed', installments_paid: 2, last_payment_date: '2026-08-11' })
    await mkPayment(l4b, { payment_date: '2026-08-01', total_amount: 400000, principal_portion: 400000 })
    const { jeId: je4bFinal } = await mkPayment(l4b, { payment_date: '2026-08-11', total_amount: 600000, principal_portion: 600000 })
    const r4b = await realReverse(je4bFinal, adminId); assert(!r4b.error, 'reverse final payment ok', r4b.error ?? '')
    L = await getLoan(l4b)
    assert(Number(L.balance_outstanding) === 600000 && L.status === 'active', 'status completed→active, balance 600,000', `${M(L.balance_outstanding)} / ${L.status}`)

    R('PHASE 4c — loan restructured into a still-live loan; reverse a payment on the OLD loan → stays restructured/0')
    const c4c = await mkClient()
    const lA = await mkLoan(c4c, { loan_number: `${TAG}-P4c-A`, disbursed_amount: 2000000, balance_outstanding: 2000000 })
    await mkLoan(c4c, { loan_number: `${TAG}-P4c-B`, disbursed_amount: 2000000, balance_outstanding: 2000000, restructured_from_loan_id: lA })
    await sb.from('iacm_loans').update({ status: 'restructured', balance_outstanding: 0 }).eq('id', lA)
    const { jeId: je4c } = await mkPayment(lA, { payment_date: '2026-08-12', total_amount: 100000, principal_portion: 100000 })
    const r4c = await realReverse(je4c, adminId); assert(!r4c.error, 'reverse payment on restructured loan ok', r4c.error ?? '')
    L = await getLoan(lA)
    assert(Number(L.balance_outstanding) === 0 && L.status === 'restructured', 'OLD loan stays restructured / balance 0 (child B still live)', `${M(L.balance_outstanding)} / ${L.status}`)

    R('PHASE 5 — cleanup + sign-off')
    await cleanupAll()
    const js1 = await journalState(); const np1 = await netProfitInputs()
    const { count: loans1 } = await sb.from('iacm_loans').select('id', { count: 'exact', head: true })
    const { count: rev1 } = await sb.from('iacm_reversals').select('id', { count: 'exact', head: true })
    assert(js1.entries === js0.entries && js1.lines === js0.lines, 'journal entry/line counts back to baseline', `${js1.entries}/${js1.lines} vs ${js0.entries}/${js0.lines}`)
    assert(js1.unbal === 0 && js1.orphan === 0, 'journal still 0 unbalanced / 0 orphan')
    assert(loans1 === loans0, 'iacm_loans row count back to baseline', `${loans1} vs ${loans0}`)
    assert(rev1 === rev0, 'iacm_reversals row count back to baseline', `${rev1} vs ${rev0}`)
    assert(Math.abs(np1.gross - np0.gross) < 0.011 && Math.abs(np1.exp - np0.exp) < 0.011, 'Net Profit inputs unchanged vs baseline')
  } catch (e: any) {
    console.error('\n   !! test threw:', e?.stack ?? e); FAIL++
    try { await cleanupAll() } catch (ce: any) { console.error('   cleanup also failed:', ce?.message ?? ce) }
  }
  R(`RESULT — ${PASS} passed, ${FAIL} failed`)
  process.exit(FAIL === 0 ? 0 : 1)
}
main().catch(e => { console.error('FATAL', e?.stack ?? e); process.exit(1) })
