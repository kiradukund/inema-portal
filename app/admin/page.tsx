import { requireAdmin, formatRWF, daysUntil } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'
import Link from 'next/link'

function StatCard({ label, value, sub, color = 'blue', icon }: {
  label: string; value: string; sub?: string; color?: string; icon: string
}) {
  const colors: Record<string, string> = {
    blue: 'border-l-blue-500', green: 'border-l-green-500',
    amber: 'border-l-amber-500', red: 'border-l-red-500', purple: 'border-l-purple-500'
  }
  return (
    <div className={`bg-white rounded-xl p-5 border border-slate-100 border-l-4 ${colors[color]} shadow-sm`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export default async function AdminDashboard() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  // Fetch all loans
  const { data: loans } = await supabase
    .from('imported_loans')
    .select('*, installments(*)')
    .order('created_at', { ascending: false })

  // Fetch compliance deadlines
  const { data: deadlines } = await supabase
    .from('compliance_deadlines')
    .select('*')
    .eq('is_done', false)
    .order('deadline_date', { ascending: true })
    .limit(8)

  // Fetch expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')

  const allLoans = loans ?? []
  const allExpenses = expenses ?? []

  // Calculate KPIs
  const totalDisbursed = allLoans.reduce((s, l) => s + (l.principal ?? 0), 0)
  const totalCollected = allLoans.reduce((s, l) => s + (l.amount_paid ?? 0), 0)
  const totalOutstanding = allLoans
    .filter(l => l.status !== 'paid')
    .reduce((s, l) => s + ((l.total_due ?? 0) - (l.amount_paid ?? 0)), 0)
  const activeLoans = allLoans.filter(l => l.status === 'active' || l.status === 'partial')
  const overdueLoans = allLoans.filter(l => l.status === 'overdue')
  const paidLoans = allLoans.filter(l => l.status === 'paid')

  // Income calculation
  const grossIncome = allLoans.reduce((s, l) => {
    const p = l.principal ?? 0
    const months = l.term_months ?? 1
    const interest = p * 0.05 * months
    const fee = p * 0.04
    const vat = fee * 0.18
    if (l.status === 'paid') return s + interest + fee + vat
    // For partial, calculate proportionally
    const totalCost = interest + fee + vat
    const paidRatio = (l.amount_paid ?? 0) / (l.total_due ?? 1)
    return s + (totalCost * paidRatio)
  }, 0)

  const totalExpenses = allExpenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const netProfit = grossIncome - totalExpenses

  // Clients due this week
  const today = new Date()
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { data: clients } = await supabase
    .from('imported_clients')
    .select('*')

  const clientMap = Object.fromEntries((clients ?? []).map(c => [c.full_name, c]))

  // Due this week - check installments and loan repayment dates
  const { data: dueInstallments } = await supabase
    .from('installments')
    .select('*, imported_loans(client_name, principal, total_due)')
    .eq('status', 'not paid')
    .lte('due_date', nextWeek.toISOString().split('T')[0])
    .gte('due_date', today.toISOString().split('T')[0])

  const dueThisWeek = dueInstallments ?? []

  // Also check loans with repayment dates this week
  const { data: dueLoans } = await supabase
    .from('imported_loans')
    .select('*')
    .neq('status', 'paid')
    .eq('has_installments', false)
    .lte('repayment_date', nextWeek.toISOString().split('T')[0])
    .gte('repayment_date', today.toISOString().split('T')[0])

  // Overdue installments
  const { data: overdueInst } = await supabase
    .from('installments')
    .select('*, imported_loans(client_name, principal)')
    .eq('status', 'not paid')
    .lt('due_date', today.toISOString().split('T')[0])
    .limit(10)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-RW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          &nbsp;·&nbsp; INEMA Financial Solutions Ltd
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Disbursed" value={formatRWF(totalDisbursed)} sub={`${allLoans.length} loans total`} color="blue" icon="💼" />
        <StatCard label="Total Collected" value={formatRWF(totalCollected)} sub={`${paidLoans.length} fully paid`} color="green" icon="✅" />
        <StatCard label="Outstanding" value={formatRWF(totalOutstanding)} sub={`${activeLoans.length} active loans`} color="amber" icon="⏳" />
        <StatCard label="Net Profit" value={formatRWF(netProfit)} sub="After all expenses" color="purple" icon="📈" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Gross Income" value={formatRWF(grossIncome)} sub="Interest + fees collected" color="green" icon="💰" />
        <StatCard label="Total Expenses" value={formatRWF(totalExpenses)} sub="All operational costs" color="red" icon="📋" />
        <StatCard label="Active Loans" value={activeLoans.length.toString()} sub={`${overdueLoans.length} overdue`} color="blue" icon="💳" />
        <StatCard label="Clients" value={(clients?.length ?? 0).toString()} sub="Total registered" color="purple" icon="👥" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── URGENT: Due This Week ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-50">
              <div>
                <h2 className="font-bold text-slate-800">⚠️ Action Required — Due This Week</h2>
                <p className="text-xs text-slate-400 mt-0.5">Contact these clients now</p>
              </div>
              <Link href="/admin/reminders" className="text-xs text-amber-600 font-medium hover:underline">View all →</Link>
            </div>
            <div className="divide-y divide-slate-50">
              {dueThisWeek.length === 0 && (!dueLoans || dueLoans.length === 0) ? (
                <div className="p-5 text-center text-slate-400 text-sm">✅ No payments due this week</div>
              ) : (
                <>
                  {dueThisWeek.map((inst: {
                    id: string
                    due_date: string
                    amount: number
                    imported_loans: { client_name: string; principal: number; total_due: number } | null
                  }) => {
                    const clientName = inst.imported_loans?.client_name ?? 'Unknown'
                    const client = clientMap[clientName]
                    const days = daysUntil(inst.due_date)
                    return (
                      <div key={inst.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{clientName}</p>
                          <p className="text-xs text-slate-400">Due: {inst.due_date} &nbsp;·&nbsp;
                            <span className={days <= 2 ? 'text-red-600 font-semibold' : 'text-amber-600'}>
                              {days === 0 ? 'TODAY' : `${days} day${days !== 1 ? 's' : ''}`}
                            </span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-800 text-sm">{formatRWF(inst.amount)}</p>
                          {client?.phone && (
                            <a href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} target="_blank"
                              className="text-xs text-green-600 font-medium hover:underline">
                              📱 {client.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {(dueLoans ?? []).map((loan: {
                    id: string
                    client_name: string
                    repayment_date: string
                    total_due: number
                    amount_paid: number
                  }) => {
                    const client = clientMap[loan.client_name]
                    const days = daysUntil(loan.repayment_date)
                    return (
                      <div key={loan.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{loan.client_name}</p>
                          <p className="text-xs text-slate-400">Final due: {loan.repayment_date} &nbsp;·&nbsp;
                            <span className={days <= 2 ? 'text-red-600 font-semibold' : 'text-amber-600'}>
                              {days === 0 ? 'TODAY' : `${days} day${days !== 1 ? 's' : ''}`}
                            </span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-800 text-sm">{formatRWF((loan.total_due ?? 0) - (loan.amount_paid ?? 0))}</p>
                          {client?.phone && (
                            <a href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} target="_blank"
                              className="text-xs text-green-600 font-medium hover:underline">
                              📱 {client.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          {/* Overdue */}
          {(overdueInst?.length ?? 0) > 0 && (
            <div className="bg-red-50 rounded-xl border border-red-200">
              <div className="p-4 border-b border-red-100">
                <h2 className="font-bold text-red-800">🔴 Overdue Payments</h2>
                <p className="text-xs text-red-600 mt-0.5">These clients missed their payment date</p>
              </div>
              <div className="divide-y divide-red-100">
                {overdueInst?.slice(0, 5).map((inst: {
                  id: string
                  due_date: string
                  amount: number
                  amount_paid: number
                  imported_loans: { client_name: string } | null
                }) => {
                  const clientName = inst.imported_loans?.client_name ?? 'Unknown'
                  const client = clientMap[clientName]
                  const daysOver = Math.abs(daysUntil(inst.due_date))
                  return (
                    <div key={inst.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-red-800 text-sm">{clientName}</p>
                        <p className="text-xs text-red-500">{daysOver} days overdue &nbsp;·&nbsp; Was due: {inst.due_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-800 text-sm">{formatRWF((inst.amount ?? 0) - (inst.amount_paid ?? 0))}</p>
                        {client?.phone && (
                          <a href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} target="_blank"
                            className="text-xs text-green-700 font-medium hover:underline">
                            📱 {client.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent Loans */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-50">
              <h2 className="font-bold text-slate-800">Recent Loans</h2>
              <Link href="/admin/loans" className="text-xs text-amber-600 font-medium hover:underline">View all →</Link>
            </div>
            <div className="divide-y divide-slate-50">
              {allLoans.slice(0, 6).map((loan: {
                id: string
                client_name: string
                principal: number
                total_due: number
                amount_paid: number
                status: string
                repayment_date: string
                term_months: number
              }) => {
                const pct = Math.round(((loan.amount_paid ?? 0) / (loan.total_due ?? 1)) * 100)
                const statusColors: Record<string, string> = {
                  paid: 'bg-green-100 text-green-700',
                  active: 'bg-blue-100 text-blue-700',
                  overdue: 'bg-red-100 text-red-700',
                  partial: 'bg-amber-100 text-amber-700',
                }
                return (
                  <div key={loan.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{loan.client_name}</p>
                        <p className="text-xs text-slate-400">{loan.term_months} months · Due {loan.repayment_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800 text-sm">{formatRWF(loan.principal)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[loan.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {loan.status}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${loan.status === 'paid' ? 'bg-green-500' : loan.status === 'overdue' ? 'bg-red-500' : 'bg-amber-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{pct}% repaid</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Right Column ── */}
        <div className="space-y-4">
          {/* Tax & BNR Deadlines */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-50">
              <h2 className="font-bold text-slate-800">⚖️ Tax & BNR Deadlines</h2>
              <Link href="/admin/compliance" className="text-xs text-amber-600 font-medium hover:underline">All →</Link>
            </div>
            <div className="divide-y divide-slate-50">
              {(deadlines ?? []).slice(0, 6).map((d: {
                id: string
                title: string
                deadline_date: string
                category: string
                description: string
              }) => {
                const days = daysUntil(d.deadline_date)
                const urgent = days <= 7
                const soon = days <= 30
                return (
                  <div key={d.id} className={`p-4 ${urgent ? 'bg-red-50' : soon ? 'bg-amber-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`font-semibold text-sm ${urgent ? 'text-red-800' : 'text-slate-800'}`}>{d.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{d.deadline_date}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${urgent ? 'bg-red-100 text-red-700' : soon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {days <= 0 ? 'TODAY' : `${days}d`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h2 className="font-bold text-slate-800 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: '/admin/upload', icon: '📁', label: 'Upload Excel' },
                { href: '/admin/clients', icon: '👥', label: 'Clients' },
                { href: '/admin/loans', icon: '💳', label: 'All Loans' },
                { href: '/admin/income', icon: '💰', label: 'P&L Report' },
              ].map(a => (
                <Link key={a.href} href={a.href}
                  className="flex flex-col items-center gap-2 p-3 border border-slate-100 rounded-xl hover:border-amber-300 hover:bg-amber-50 transition-colors text-center">
                  <span className="text-xl">{a.icon}</span>
                  <span className="text-xs font-semibold text-slate-600">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Income Summary */}
          <div className="bg-slate-900 rounded-xl p-5 text-white">
            <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest mb-4">Financial Summary</p>
            {[
              { label: 'Gross Income', value: formatRWF(grossIncome), color: 'text-green-400' },
              { label: 'Total Expenses', value: formatRWF(totalExpenses), color: 'text-red-400' },
              { label: 'Net Profit', value: formatRWF(netProfit), color: 'text-amber-400' },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                <span className="text-slate-400 text-sm">{r.label}</span>
                <span className={`font-bold text-sm ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
