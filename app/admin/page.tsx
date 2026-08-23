import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'
import { getAccountBalance, getAccountMovementSum } from '@/lib/ledger'
import { NET_PROFIT_CUTOFF, NET_PROFIT_BASE_AS_OF_CUTOFF, LIABILITY_EXPENSE_CATEGORIES } from '@/lib/net-profit'
import Link from 'next/link'
import { MonthlyCollectionsChart, LoanPortfolioDonut } from './DashboardCharts'

export const dynamic = 'force-dynamic'
// See app/admin/layout.tsx and docs/known-gaps.md — `force-dynamic` alone
// was found not to reliably prevent a stale render (Journal page
// incident, 2026-08-22). Audited and fixed across every admin page.
export const revalidate = 0

function KPICard({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color: string; icon: string }) {
  return (
    <div className={`bg-white rounded-xl p-5 border border-slate-200 border-l-4 ${color} shadow-sm`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <span className="text-xl flex-shrink-0">{icon}</span>
      </div>
      <p className="text-xl font-bold text-slate-800 leading-tight break-words">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  )
}

function normalizePhone(phone: string | null | undefined, fallbackKey: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? digits : `noPhone:${fallbackKey}`
}

function getDaysOverdue(maturityDate: string | null, balance: number, today: Date): number {
  if (!maturityDate || balance <= 0) return -1
  const maturity = new Date(maturityDate)
  if (maturity >= today) return 0
  return Math.floor((today.getTime() - maturity.getTime()) / 86400000)
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default async function AdminDashboard() {
  const { profile } = await requireAdmin()
  const supabase = await createServerSupabaseClient()
  const adminSupabase = createAdminClient()
  const today = new Date()
  const thisMonthKey = today.toISOString().slice(0, 7)

  const [
    { data: complianceDeadlines },
    { data: iacmLoans },
    { data: iacmClients },
    { data: iacmPayments },
    { data: iacmExpenses },
    { data: pendingApps },
  ] = await Promise.all([
    supabase.from('compliance_deadlines').select('*').eq('is_done', false).order('deadline_date', { ascending: true }).limit(8),
    supabase.from('iacm_loans').select('*, iacm_clients(full_name, phone, gender)').order('created_at', { ascending: false }),
    supabase.from('iacm_clients').select('id, phone, full_name'),
    supabase.from('iacm_payments').select('total_amount, interest_portion, payment_date'),
    supabase.from('iacm_expenses').select('amount, expense_date, category'),
    supabase.from('loan_applications').select('*').eq('status', 'submitted').order('submitted_at', { ascending: false }),
  ])

  // imported_loans/imported_clients/expenses (old) deliberately excluded
  // from every KPI below. imported_loans/imported_clients were confirmed
  // stale (frozen at an 11-Jun-2026 bulk import, missing real repayments
  // the maintained ledger already has). The old expenses table turned out
  // to be worse: confirmed its 33 rows are the hardcoded SEED_EXPENSES
  // fallback from the now-deleted /admin/upload feature, not real data at
  // all — the upload handler discarded whatever Excel file was actually
  // uploaded and inserted this fallback regardless. iacm_* is now the sole
  // source of truth for loan/client/expense figures going forward.
  const allIacmLoans = (iacmLoans ?? []) as any[]
  const allIacmClients = iacmClients ?? []
  const allIacmPayments = iacmPayments ?? []
  const allIacmExpenses = iacmExpenses ?? []
  const allPendingApps = pendingApps ?? []

  // Pending applications need client name/phone. profiles RLS only allows a
  // user to read their own row, so this must go through the service-role
  // client (same fix applied to /admin/applications and the approve/reject
  // routes) rather than the regular server client.
  const pendingClientIds = Array.from(new Set(allPendingApps.map(a => a.client_id).filter(Boolean)))
  let pendingProfileMap: Record<string, any> = {}
  if (pendingClientIds.length > 0) {
    const { data: pendingProfiles } = await adminSupabase
      .from('profiles').select('id, full_name, phone').in('id', pendingClientIds)
    ;(pendingProfiles ?? []).forEach((p: any) => { pendingProfileMap[p.id] = p })
  }

  // ── Combined KPIs ──────────────────────────────────────────────────────
  const totalDisbursed = allIacmLoans.reduce((s, l) => s + Number(l.disbursed_amount ?? 0), 0)

  const totalCollected = allIacmPayments.reduce((s, p) => s + Number(p.total_amount ?? 0), 0)

  const totalOutstanding = allIacmLoans.reduce((s, l) => s + Number(l.balance_outstanding ?? 0), 0)

  // Net Profit uses a hard 30-Jun-2026 cutoff — see lib/net-profit.ts for
  // why, and keep this in sync with app/admin/income/page.tsx, which shares
  // the same constants and must always show the same Net Profit figure.
  const grossIncome = allIacmPayments
    .filter(p => (p.payment_date ?? '') > NET_PROFIT_CUTOFF)
    .reduce((s, p) => s + Number(p.interest_portion ?? 0), 0)

  // Fee + VAT-derived income (7020) is booked to the ledger at disbursement
  // time, not stored on iacm_payments — it was previously missing from Net
  // Profit entirely, understating real profit by ~4.72% of every loan
  // disbursed after the cutoff. Pulled from the real ledger (the same
  // account the disbursement journal entry already credits), one day after
  // the cutoff through today, matching the strictly-after-cutoff window
  // grossIncome/totalExpenses already use.
  const dayAfterCutoff = new Date(new Date(`${NET_PROFIT_CUTOFF}T00:00:00`).getTime() + 86400000)
  const feeIncome = await getAccountMovementSum(['7020'], dayAfterCutoff, today, 'credit')

  // Real gap confirmed 2026-08-20: this used to sum every expense
  // unconditionally, including PAYE/CBHI/Pension/Maternity/WHT/Tax-Payable
  // categories -- those settle a real 2xxx liability, not a 6xxx operating
  // cost, and shouldn't reduce Net Profit. See lib/net-profit.ts and
  // docs/known-gaps.md.
  const totalExpenses = allIacmExpenses
    .filter(e => (e.expense_date ?? '') > NET_PROFIT_CUTOFF && !LIABILITY_EXPENSE_CATEGORIES.includes((e as any).category))
    .reduce((s, e) => s + Number(e.amount ?? 0), 0)

  const netProfit = NET_PROFIT_BASE_AS_OF_CUTOFF + grossIncome + feeIncome - totalExpenses

  const totalActiveLoans = allIacmLoans.filter(l => l.status === 'active').length

  // Deduped by normalized phone number.
  const clientKeySet = new Set<string>()
  allIacmClients.forEach(c => clientKeySet.add(normalizePhone(c.phone, `iacm:${c.id}`)))
  const totalClients = clientKeySet.size

  const monthlyRevenue = allIacmPayments
    .filter(p => (p.payment_date ?? '').slice(0, 7) === thisMonthKey)
    .reduce((s, p) => s + Number(p.interest_portion ?? 0), 0)

  // ── Loan portfolio classification (BNR-style buckets), IACM loans only ──
  // Day boundaries fixed 2026-08-23 to match the real BNR CLASSIFICATION
  // table (see docs/bnr-codification-reference.json and docs/known-gaps.md):
  // Normal has a real 0-29 day grace window before Watch starts at day 30.
  // This mirrors the same fix already applied to lib/crb-report.ts's
  // classifyByDays() — this chart had the identical bug independently,
  // since it's a separate implementation, not a shared function.
  const iacmWithRisk = allIacmLoans.filter(l => Number(l.balance_outstanding ?? 0) > 0)
  const dayBucket = (l: any) => getDaysOverdue(l.maturity_date, Number(l.balance_outstanding), today)
  const portfolioBuckets = [
    { label: 'Normal (0-29d)', count: iacmWithRisk.filter(l => { const d = dayBucket(l); return d >= 0 && d <= 29 }).length, color: '#16a34a' },
    { label: 'Watch (30-89d)', count: iacmWithRisk.filter(l => { const d = dayBucket(l); return d >= 30 && d < 90 }).length, color: '#d97706' },
    { label: 'Substandard (90-179d)', count: iacmWithRisk.filter(l => { const d = dayBucket(l); return d >= 90 && d < 180 }).length, color: '#ea580c' },
    { label: 'Doubtful (180-359d)', count: iacmWithRisk.filter(l => { const d = dayBucket(l); return d >= 180 && d < 360 }).length, color: '#dc2626' },
    { label: 'Loss (360+d)', count: iacmWithRisk.filter(l => dayBucket(l) >= 360).length, color: '#7f1d1d' },
  ]

  // ── Monthly collections, last 6 months ──────────────────────────────────
  // Real bug, found 2026-08-17: this used to build the filter key via
  // d.toISOString().slice(0, 7) — on this UTC+2 server, that converts a
  // locally-constructed "day 1, 00:00 local" Date back into the prior UTC
  // day, which for day=1 is also the prior month. The bar's label
  // (MONTH_NAMES[d.getMonth()], a local getter) stayed correct while the
  // key used to actually filter payments silently shifted back one month
  // — every bar was showing the previous month's real total under the
  // current month's label. Same root-cause class as lib/ledger.ts's
  // toLocalDateString fix: read the key back via local getters, the same
  // way the Date was constructed, instead of round-tripping through UTC.
  const monthBuckets: { label: string; total: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const total = allIacmPayments.filter(p => (p.payment_date ?? '').slice(0, 7) === key).reduce((s, p) => s + Number(p.total_amount ?? 0), 0)
    monthBuckets.push({ label: MONTH_NAMES[d.getMonth()], total })
  }

  // ── Smart alerts ─────────────────────────────────────────────────────────
  const in7Days = new Date(today.getTime() + 7 * 86400000)
  const maturingSoon = iacmWithRisk.filter(l => {
    const m = new Date(l.maturity_date)
    return m >= today && m <= in7Days
  }).sort((a, b) => new Date(a.maturity_date).getTime() - new Date(b.maturity_date).getTime())
  const overdueLoans = iacmWithRisk.filter(l => new Date(l.maturity_date) < today)
    .sort((a, b) => new Date(a.maturity_date).getTime() - new Date(b.maturity_date).getTime())

  // ── Historical performance (hardcoded BNR figures + live row) ───────────
  // 3220 (Accumulated Depreciation) is a contra-asset — getAccountBalance
  // returns it as a positive number on its own (credit) normal side, so it
  // must be subtracted here, not summed in with everything else.
  const ASSET_ACCOUNT_CODES = ['3010', '3020', '3030', '3040', '3050', '3060', '3210']
  const assetBalances = await Promise.all(ASSET_ACCOUNT_CODES.map(code => getAccountBalance(code, today)))
  const accumulatedDepreciation = await getAccountBalance('3220', today)
  const ledgerAssets = assetBalances.reduce((s: number, v) => s + (v ?? 0), 0) - (accumulatedDepreciation ?? 0)
  const liveTotalAssets = ledgerAssets + totalOutstanding

  // Previously this table also carried 3 hardcoded rows (Sep 2025, Dec 2025,
  // Jun 2026) from an earlier session's estimates. Removed: the real journal
  // (public/journal_template.xlsx) only starts ~Jan 2026, so Sep/Dec 2025
  // were never backed by any actual record, and the Jun 2026 figures didn't
  // match the verified trial balance once opening balances were reconciled.
  // Only this live row is shown now — it's a real query, not an estimate.
  const liveRow = { period: `As of ${today.toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' })}`, assets: liveTotalAssets, loans: totalOutstanding, profit: netProfit, clients: totalClients }

  const loanTypeLabel: Record<string, string> = {
    salary_advance: 'Salary Advance', quinzaine: 'Quinzaine', school_fees: 'School Fees', business: 'Business',
  }
  const statusColors: Record<string, string> = {
    active: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700',
    disbursed: 'bg-blue-100 text-blue-700', cancelled: 'bg-red-100 text-red-700',
  }

  function daysRemaining(dateStr: string): number {
    return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Welcome back, {profile.full_name.split(' ')[0]} 👋</h1>
          <p className="text-slate-500 text-sm mt-1">
            {today.toLocaleDateString('en-RW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-slate-400 text-xs mt-0.5">INEMA Financial Solutions Ltd</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link href="/admin/iacm/loans/new"
            className="bg-amber-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-amber-700 transition-colors whitespace-nowrap">
            + Record Loan
          </Link>
          <Link href="/admin/iacm/reports/bnr"
            className="bg-[#001F5B] text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-[#002a7a] transition-colors whitespace-nowrap">
            BNR Report
          </Link>
        </div>
      </div>

      {/* Section 1 — Executive KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KPICard label="Total Disbursed" value={formatRWF(totalDisbursed)} sub={`${allIacmLoans.length} loans total`} color="border-l-blue-500" icon="💼" />
        <KPICard label="Total Collected" value={formatRWF(totalCollected)} sub="All payments received" color="border-l-green-500" icon="✅" />
        <KPICard label="Outstanding Balance" value={formatRWF(totalOutstanding)} sub="Combined portfolio" color="border-l-amber-500" icon="⏳" />
        <KPICard label="Net Profit" value={formatRWF(netProfit)} sub="Income minus expenses" color="border-l-purple-500" icon="📈" />
        <KPICard label="Active Loans" value={String(totalActiveLoans)} sub={`${overdueLoans.length} overdue (IACM)`} color="border-l-blue-500" icon="💳" />
        <KPICard label="Total Clients" value={String(totalClients)} sub="Combined, deduplicated" color="border-l-purple-500" icon="👥" />
        <KPICard label="Pending Applications" value={String(allPendingApps.length)} sub="Awaiting review" color="border-l-amber-500" icon="📥" />
        <KPICard label="Monthly Revenue" value={formatRWF(monthlyRevenue)} sub="Interest income this month" color="border-l-green-500" icon="💰" />
      </div>

      {/* Section 2 — Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-1">Monthly Collections</h2>
          <p className="text-xs text-slate-400 mb-4">RWF collected per month, last 6 months (IACM payments)</p>
          <MonthlyCollectionsChart months={monthBuckets} />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-1">Loan Portfolio Classification</h2>
          <p className="text-xs text-slate-400 mb-4">By days overdue (IACM loans with a balance)</p>
          <LoanPortfolioDonut segments={portfolioBuckets} />
        </div>
      </div>

      {/* Section 3 — Smart Alerts */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-8">
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">⚠️ Action Required</h2>
          <p className="text-xs text-slate-400 mt-0.5">Loans maturing soon, overdue accounts, and applications awaiting review</p>
        </div>
        <div className="divide-y divide-slate-50">
          {maturingSoon.length === 0 && overdueLoans.length === 0 && allPendingApps.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">✅ Nothing needs attention right now</div>
          ) : (
            <>
              {overdueLoans.map(l => (
                <div key={`overdue-${l.id}`} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-red-50/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-700 flex-shrink-0">OVERDUE</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{l.iacm_clients?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-red-600">{l.loan_number} · {Math.abs(getDaysOverdue(l.maturity_date, Number(l.balance_outstanding), today))} days overdue</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 justify-between sm:justify-end flex-shrink-0">
                    <p className="font-bold text-slate-800 text-sm">{formatRWF(l.balance_outstanding)}</p>
                    {l.iacm_clients?.phone && (
                      <a href={`https://wa.me/${l.iacm_clients.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100 font-semibold">WhatsApp</a>
                    )}
                  </div>
                </div>
              ))}
              {maturingSoon.map(l => (
                <div key={`soon-${l.id}`} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-amber-50/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">MATURING</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{l.iacm_clients?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-amber-700">{l.loan_number} · Due {new Date(l.maturity_date).toLocaleDateString('en-RW', { day: '2-digit', month: 'short' })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 justify-between sm:justify-end flex-shrink-0">
                    <p className="font-bold text-slate-800 text-sm">{formatRWF(l.balance_outstanding)}</p>
                    {l.iacm_clients?.phone && (
                      <a href={`https://wa.me/${l.iacm_clients.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100 font-semibold">WhatsApp</a>
                    )}
                  </div>
                </div>
              ))}
              {allPendingApps.map(app => {
                const profile = pendingProfileMap[app.client_id] ?? {}
                return (
                  <div key={`app-${app.id}`} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-blue-50/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">PENDING</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{profile.full_name ?? 'Unknown'}</p>
                        <p className="text-xs text-blue-700">{app.application_number} · {loanTypeLabel[app.loan_type] ?? app.loan_type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 justify-between sm:justify-end flex-shrink-0">
                      <p className="font-bold text-slate-800 text-sm">{formatRWF(app.requested_amount)}</p>
                      <Link href="/admin/applications" className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 font-semibold">Review</Link>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      {/* Section 4 — Recent loans + compliance deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Recent Loans</h2>
            <Link href="/admin/iacm/loans" className="text-xs text-amber-600 font-medium hover:underline whitespace-nowrap">View all →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {allIacmLoans.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No IACM loans recorded yet</div>
            ) : allIacmLoans.slice(0, 5).map(l => (
              <div key={l.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{l.iacm_clients?.full_name ?? 'Unknown'}</p>
                  <p className="text-xs text-slate-400">{loanTypeLabel[l.loan_type] ?? l.loan_type} · {l.disbursement_date ? new Date(l.disbursement_date).toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-slate-800 text-sm">{formatRWF(l.disbursed_amount)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[l.status] ?? 'bg-slate-100 text-slate-600'}`}>{l.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">⚖️ Tax &amp; BNR Deadlines</h2>
            <Link href="/admin/compliance" className="text-xs text-amber-600 font-medium hover:underline whitespace-nowrap">View all →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {(complianceDeadlines ?? []).length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No upcoming deadlines</div>
            ) : (complianceDeadlines ?? []).map((d: any) => {
              const days = daysRemaining(d.deadline_date)
              const overdue = days < 0
              const soon = days >= 0 && days <= 7
              return (
                <div key={d.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{d.title}</p>
                    <p className="text-xs text-slate-400">{new Date(d.deadline_date).toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${overdue ? 'bg-red-100 text-red-700' : soon ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'TODAY' : `${days}d left`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Section 5 — Current financial position (ledger + live tables, no estimates) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-bold text-slate-800 mb-1">Current Financial Position</h2>
        <p className="text-xs text-slate-400 mb-4">Total Assets from opening balances + journal ledger; Loan Portfolio, Net Profit and Clients from live records</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-100">
                {['As of', 'Total Assets', 'Loan Portfolio', 'Net Profit', 'Clients'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-amber-50/60">
                <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">{liveRow.period}</td>
                <td className="py-3 px-3 whitespace-nowrap">{formatRWF(liveRow.assets)}</td>
                <td className="py-3 px-3 whitespace-nowrap">{formatRWF(liveRow.loans)}</td>
                <td className="py-3 px-3 text-green-700 font-semibold whitespace-nowrap">{formatRWF(liveRow.profit)}</td>
                <td className="py-3 px-3">{liveRow.clients.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
