// Smoke test for the manual restructuring-amount feature (2026-09-03).
// - Decisive pure-function check: buildRestructureBreakdown(2,000,000, 4) must
//   produce Francine's real paper schedule 194,400 / 100,000 / 100,000 / 2,100,000.
// - DB flow: a disposable old loan is restructured with a MANUAL amount that
//   differs from its outstanding balance; the manual amount must flow through to
//   the new loan's disbursed_amount / balance_outstanding / fee / VAT / journal,
//   then reverse cleanly. Disposable data only (ZZ_TEST_RESTRUCTURE_<ts>).
//
// RUN (repo root):  .env.local -> NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   npx tsx scripts/test-restructure-manual-amount.ts     # expect: RESULT — N passed, 0 failed
//   then delete .env.local
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { restructureLoan, reverseTransaction } from '../lib/ledger'
import { buildRestructureBreakdown } from '../lib/calculator'

const env: Record<string, string> = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m) env[m[1]] = m[2]
}
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const M = (n: any) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
const R = (s: string) => console.log('\n' + '='.repeat(76) + '\n' + s + '\n' + '='.repeat(76))
const TAG = `ZZ_TEST_RESTRUCTURE_${Date.now()}`
let PASS = 0, FAIL = 0
const assert = (c: boolean, label: string, detail = '') => {
  if (c) { PASS++; console.log(`   PASS  ${label}${detail ? '  (' + detail + ')' : ''}`) }
  else { FAIL++; console.log(`   FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`) }
}

const created = { clients: [] as string[], loans: [] as string[] }

async function fetchAll(t: string, cols = '*'): Promise<any[]> {
  const out: any[] = []
  for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(t).select(cols).range(f, f + 999); if (error) throw new Error(`${t}: ${error.message}`); out.push(...(data ?? [])); if (!data || data.length < 1000) break }
  return out
}
async function journalState() {
  const entries = await fetchAll('iacm_journal_entries', 'id')
  const lines = await fetchAll('iacm_journal_lines', 'journal_entry_id,debit_amount,credit_amount')
  const eIds = new Set(entries.map((e: any) => e.id)); const byE = new Map<string, any[]>(); let orphan = 0
  for (const ln of lines) { if (!eIds.has(ln.journal_entry_id)) { orphan++; continue } if (!byE.has(ln.journal_entry_id)) byE.set(ln.journal_entry_id, []); byE.get(ln.journal_entry_id)!.push(ln) }
  let unbal = 0
  for (const ls of Array.from(byE.values())) {
    const d = ls.reduce((s: number, x: any) => s + Number(x.debit_amount ?? 0), 0)
    const c = ls.reduce((s: number, x: any) => s + Number(x.credit_amount ?? 0), 0)
    if (Math.abs(d - c) > 0.011) unbal++
  }
  return { entries: entries.length, lines: lines.length, unbal, orphan }
}
async function sweep(where: 'startup' | 'final') {
  const P = 'ZZ_TEST_RESTRUCTURE_%'
  const step = async (label: string, p: PromiseLike<{ error: any }>) => {
    const { error } = await p
    if (error && !/does not exist|schema cache/i.test(error.message ?? '')) throw new Error(`sweep(${where}) ${label}: ${error.message}`)
  }
  await step('reversals', sb.from('iacm_reversals').delete().ilike('reversed_by_name', P))
  const { data: tje } = await sb.from('iacm_journal_entries').select('id').ilike('narration', `%ZZ_TEST_RESTRUCTURE_%`)
  for (const j of tje ?? []) {
    await step('journal_lines', sb.from('iacm_journal_lines').delete().eq('journal_entry_id', j.id))
    await step('journal_entries', sb.from('iacm_journal_entries').delete().eq('id', j.id))
  }
  // loans/clients: the restructured NEW loan has a real INEMA-.... number (no
  // tag), so delete every tracked loan id explicitly, then prefix-sweep clients
  // (cascade would be blocked by the RESTRICT FK anyway — payments first).
  const trackedLoans = Array.from(new Set(created.loans))
  if (trackedLoans.length) {
    await step('payments', sb.from('iacm_payments').delete().in('loan_id', trackedLoans))
    // restructuring children first (restructured_from_loan_id set)
    const { data: rows } = await sb.from('iacm_loans').select('id,restructured_from_loan_id').in('id', trackedLoans)
    for (const r of (rows ?? []).filter((x: any) => x.restructured_from_loan_id)) await step(`loan ${r.id}`, sb.from('iacm_loans').delete().eq('id', r.id))
    for (const r of (rows ?? []).filter((x: any) => !x.restructured_from_loan_id)) await step(`loan ${r.id}`, sb.from('iacm_loans').delete().eq('id', r.id))
  }
  await step('clients', sb.from('iacm_clients').delete().ilike('full_name', P))
  // hard post-condition
  const left = {
    clients: (await sb.from('iacm_clients').select('id', { count: 'exact', head: true }).ilike('full_name', P)).count ?? 0,
    jes: (await sb.from('iacm_journal_entries').select('id', { count: 'exact', head: true }).ilike('narration', `%ZZ_TEST_RESTRUCTURE_%`)).count ?? 0,
    reversals: (await sb.from('iacm_reversals').select('id', { count: 'exact', head: true }).ilike('reversed_by_name', P)).count ?? 0,
  }
  const loansLeft = trackedLoans.length ? (await sb.from('iacm_loans').select('id', { count: 'exact', head: true }).in('id', trackedLoans)).count ?? 0 : 0
  if (left.clients + left.jes + left.reversals + loansLeft > 0) throw new Error(`sweep(${where}) residue: ${JSON.stringify({ ...left, loansLeft })}`)
}

async function main() {
  // ─── DECISIVE pure-function check — no DB ───
  R("DECISIVE — buildRestructureBreakdown(2,000,000, 4) vs Francine's real paper schedule")
  const bd = buildRestructureBreakdown(2_000_000, 4)
  const totals = bd.schedule.map(r => r.total)
  console.log(`   schedule totals: [${totals.map(M).join(', ')}]`)
  console.log(`   Francine paper : [194,400, 100,000, 100,000, 2,100,000]`)
  assert(JSON.stringify(totals) === JSON.stringify([194400, 100000, 100000, 2100000]), 'schedule totals match Francine\'s paper record exactly')
  assert(bd.fee === 80000, 'fee == 80,000 (4% of 2,000,000)', M(bd.fee))
  assert(bd.vat === 14400, 'vat == 14,400 (18% of fee)', M(bd.vat))
  assert(bd.monthlyInterest === 100000, 'monthly interest == 100,000 (5%)', M(bd.monthlyInterest))
  assert(bd.month1Total === 194400, 'month 1 total == 194,400', M(bd.month1Total))
  assert(bd.finalTotal === 2100000, 'final month total == 2,100,000 (interest + principal balloon)', M(bd.finalTotal))
  assert(bd.schedule[0].fee === 80000 && bd.schedule[1].fee === 0 && bd.schedule[3].fee === 0, 'fee/VAT only on month 1')
  assert(bd.schedule[3].principal === 2_000_000 && bd.schedule[0].principal === 0, 'principal balloon only on the final month')
  // 1-month (bullet) edge
  const b1 = buildRestructureBreakdown(2_000_000, 1)
  assert(b1.schedule.length === 1 && b1.schedule[0].total === 100000 + 80000 + 14400 + 2_000_000, '1-month bullet = interest + fee + vat + principal', M(b1.schedule[0].total))

  R('STARTUP SWEEP')
  await sweep('startup')
  console.log('   clean')

  R('BASELINE')
  const js0 = await journalState()
  const { count: loans0 } = await sb.from('iacm_loans').select('id', { count: 'exact', head: true })
  const { count: rev0 } = await sb.from('iacm_reversals').select('id', { count: 'exact', head: true })
  console.log(`   journal ${js0.entries}/${js0.lines} unbal=${js0.unbal} orphan=${js0.orphan} | loans=${loans0} | reversals=${rev0}`)
  const { data: admin } = await sb.from('profiles').select('id').eq('role', 'admin').limit(1)
  const adminId = admin?.[0]?.id ?? null

  try {
    // ─── FIXTURE: old loan disbursed 3,000,000, one payment of 500,000 principal → balance 2,500,000 ───
    R('FIXTURE — disposable old loan (disbursed 3,000,000, 500,000 principal repaid → outstanding 2,500,000)')
    const { data: client } = await sb.from('iacm_clients').insert({
      full_name: `${TAG} Client`, national_id: `${TAG}`, phone: '0788000000',
      gender: 'female', marital_status: 'single', district: 'gasabo', sector: 's', cell: 'c', village: 'v',
    }).select('id').single()
    created.clients.push(client!.id)
    const { data: oldLoan } = await sb.from('iacm_loans').insert({
      client_id: client!.id, loan_number: `${TAG}-OLD`, loan_type: 'Business Loan',
      disbursed_amount: 3_000_000, disbursement_date: '2026-01-15', maturity_date: '2026-07-15',
      interest_rate: 0.05, repayment_frequency_days: 30, total_installments: 1,
      balance_outstanding: 2_500_000, principal_repaid: 500_000, status: 'active', last_payment_date: '2026-06-10',
    }).select('id').single()
    created.loans.push(oldLoan!.id)
    await sb.from('iacm_payments').insert({
      loan_id: oldLoan!.id, payment_date: '2026-06-10', total_amount: 650_000,
      principal_portion: 500_000, interest_portion: 150_000, fee_portion: 0,
    })
    console.log(`   old loan ${oldLoan!.id}  balance 2,500,000`)

    // ─── RESTRUCTURE with a MANUAL amount (2,000,000) that differs from the 2,500,000 balance ───
    R('RESTRUCTURE — restructureLoan() with manual amount 2,000,000 (≠ outstanding 2,500,000)')
    const res = await restructureLoan(sb, {
      old_loan_id: oldLoan!.id, restructure_date: '2026-08-01', maturity_date: '2026-12-01',
      restructured_amount: 2_000_000, created_by: TAG,
    })
    assert(!res.error, 'restructureLoan returned no error', res.error ?? '')
    if (res.new_loan_id) created.loans.push(res.new_loan_id)
    assert(res.restructured_amount === 2_000_000, 'result.restructured_amount == 2,000,000', M(res.restructured_amount))
    assert(res.old_balance === 2_500_000, 'result.old_balance == 2,500,000', M(res.old_balance))
    assert(res.delta === -500_000, 'result.delta == -500,000 (write-down)', M(res.delta))
    assert(res.fee === 80_000 && res.vat === 14_400, 'result.fee/vat == 80,000 / 14,400', `${M(res.fee)} / ${M(res.vat)}`)

    const { data: newLoan } = await sb.from('iacm_loans').select('*').eq('id', res.new_loan_id!).single()
    assert(Number(newLoan.disbursed_amount) === 2_000_000, 'new loan disbursed_amount == 2,000,000 (the MANUAL amount)', M(newLoan.disbursed_amount))
    assert(Number(newLoan.balance_outstanding) === 2_000_000, 'new loan balance_outstanding == 2,000,000', M(newLoan.balance_outstanding))
    assert(newLoan.status === 'active', 'new loan status active')
    assert(newLoan.restructured_from_loan_id === oldLoan!.id, 'new loan links back to the old loan')

    const { data: oldAfter } = await sb.from('iacm_loans').select('*').eq('id', oldLoan!.id).single()
    assert(Number(oldAfter.balance_outstanding) === 0 && oldAfter.status === 'restructured', 'old loan → balance 0 / status restructured', `${M(oldAfter.balance_outstanding)} / ${oldAfter.status}`)

    const { data: je } = await sb.from('iacm_journal_entries').select('*').eq('reference', `loan-${res.new_loan_id}`).single()
    assert(je?.entry_type === 'loan_restructuring', "journal entry_type == 'loan_restructuring'")
    const { data: jl } = await sb.from('iacm_journal_lines').select('*').eq('journal_entry_id', je.id)
    const dr = (jl ?? []).reduce((s, x) => s + Number(x.debit_amount ?? 0), 0)
    const cr = (jl ?? []).reduce((s, x) => s + Number(x.credit_amount ?? 0), 0)
    assert((jl ?? []).length === 5, 'journal entry has 5 lines', String((jl ?? []).length))
    assert(Math.abs(dr - cr) < 0.011, 'journal balances (debits == credits)', `${M(dr)} == ${M(cr)}`)
    assert(Math.abs(dr - (2_000_000 + 80_000 + 14_400)) < 0.011, 'debits == 2,094,400 (2,000,000 transfer + fee + vat)', M(dr))
    const c3110 = (jl ?? []).filter((x: any) => x.account_code === '3110')
    assert(c3110.length === 2 && Number(c3110[0].debit_amount || c3110[0].credit_amount) === 2_000_000 && Number(c3110[1].debit_amount || c3110[1].credit_amount) === 2_000_000, 'both 3110 transfer lines post at the manual amount (2,000,000), netting to zero')

    // ─── REVERSE via the real reverseTransaction() — must restore the old loan and unwind the write-down ───
    R('REVERSE — reverseTransaction() on the restructuring entry')
    const rev = await reverseTransaction(sb, {
      journal_entry_id: je.id, reason: `${TAG} test`, acknowledged_pre_cutoff: false,
      reversed_by_user_id: adminId as any, reversed_by_name: TAG,
    })
    assert(!rev.error, 'reverseTransaction returned no error', rev.error ?? '')
    const { data: newGone } = await sb.from('iacm_loans').select('id').eq('id', res.new_loan_id!)
    assert((newGone ?? []).length === 0, 'new (restructured) loan deleted by the reversal')
    const { data: oldRestored } = await sb.from('iacm_loans').select('*').eq('id', oldLoan!.id).single()
    assert(Number(oldRestored.balance_outstanding) === 2_500_000, 'old loan recomputed to 2,500,000 (3,000,000 − 500,000 principal) — write-down unwound', M(oldRestored.balance_outstanding))
    assert(oldRestored.status === 'active', 'old loan back to active')
    const { data: jeGone } = await sb.from('iacm_journal_entries').select('id').eq('id', je.id)
    assert((jeGone ?? []).length === 0, 'restructuring journal entry deleted')
    const { count: revN } = await sb.from('iacm_reversals').select('id', { count: 'exact', head: true }).eq('reversed_by_name', TAG)
    assert((revN ?? 0) === 1, 'one iacm_reversals audit row written', String(revN))

    // ─── CLEANUP + SIGN-OFF ───
    R('CLEANUP + SIGN-OFF')
    await sweep('final')
    const js1 = await journalState()
    const { count: loans1 } = await sb.from('iacm_loans').select('id', { count: 'exact', head: true })
    const { count: rev1 } = await sb.from('iacm_reversals').select('id', { count: 'exact', head: true })
    assert(js1.entries === js0.entries && js1.lines === js0.lines, 'journal counts back to baseline', `${js1.entries}/${js1.lines} vs ${js0.entries}/${js0.lines}`)
    assert(js1.unbal === 0 && js1.orphan === 0, 'journal 0 unbalanced / 0 orphan')
    assert(loans1 === loans0, 'iacm_loans count back to baseline', `${loans1} vs ${loans0}`)
    assert(rev1 === rev0, 'iacm_reversals count back to baseline', `${rev1} vs ${rev0}`)
  } catch (e: any) {
    console.error('\n   !! threw:', e?.stack ?? e); FAIL++
    try { await sweep('final') } catch (ce: any) { console.error('   cleanup also failed:', ce?.message ?? ce) }
  }
  R(`RESULT — ${PASS} passed, ${FAIL} failed`)
  process.exit(FAIL === 0 ? 0 : 1)
}
main().catch(e => { console.error('FATAL', e?.stack ?? e); process.exit(1) })
