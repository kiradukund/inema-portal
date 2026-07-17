import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`bg-white rounded-2xl p-6 border-l-4 ${color} shadow-sm`}>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export default async function BossDashboard() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()
  const today = new Date()
  const thisMonth = today.toISOString().slice(0, 7)

  // Load all active loans
  const { data: loans } = await supabase.from('iacm_loans').select('*, iacm_clients(full_name, phone, gender)').eq('status', 'active')
  const all = loans ?? []

  // Load payments this month
  const { data: payments } = await supabase.from('iacm_payments').select('*').gte('payment_date', thisMonth + '-01')

  // Load expenses this month
  const { data: expenses } = await supabase.from('iacm_expenses').select('*').gte('expense_date', thisMonth + '-01')

  // Load all payments ever (for collection rate)
  const { data: allPayments } = await supabase.from('iacm_payments').select('total_amount, interest_portion, payment_date')

  // KPI calculations
  const totalOutstanding = all.reduce((s, l) => s + Number(l.balance_outstanding ?? 0), 0)
  const totalDisbursed = all.reduce((s, l) => s + Number(l.disbursed_amount ?? 0), 0)
  const overdueLoans = all.filter(l => new Date(l.maturity_date) < today && Number(l.balance_outstanding) > 0)
  const overdueAmount = overdueLoans.reduce((s, l) => s + Number(l.balance_outstanding ?? 0), 0)
  const monthPayments = (payments ?? []).reduce((s, p) => s + Number(p.total_amount ?? 0), 0)
  const monthInterest = (payments ?? []).reduce((s, p) => s + Number(p.interest_portion ?? 0), 0)
  const monthExpenses = (expenses ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0)
  const monthProfit = monthInterest - monthExpenses
  const parRatio = totalDisbursed > 0 ? ((overdueAmount / totalDisbursed) * 100).toFixed(1) : '0.0'
  const totalCollected = (allPayments ?? []).reduce((s, p) => s + Number(p.total_amount ?? 0), 0)

  // By loan type
  const byType: Record<string, { count: number; outstanding: number }> = {}
  all.forEach(l => {
    const t = l.loan_type ?? 'other'
    if (!byType[t]) byType[t] = { count: 0, outstanding: 0 }
    byType[t].count++
    byType[t].outstanding += Number(l.balance_outstanding ?? 0)
  })

  // By gender
  const men = all.filter(l => (l as any).iacm_clients?.gender === 'male')
  const women = all.filter(l => (l as any).iacm_clients?.gender === 'female')

  // Historical performance (from BNR data)
  const historical = [
    { period: 'Sep 2025 (Q1)', assets: 34449836, loans: 20200000, profit: 1413175, clients: 8 },
    { period: 'Dec 2025 (Q2)', assets: 35094001, loans: 19924960, profit: 2063739, clients: 10 },
    { period: 'Jun 2026 (Q4)', assets: 37284089, loans: 29587452, profit: 5220369, clients: 21 },
  ]

  const loanTypeLabel: Record<string, string> = {
    salary_advance: 'Salary Advance', quinzaine: 'Quinzaine',
    school_fees: 'School Fees', business: 'Business Loan',
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Boss Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          Financial position of INEMA Financial Solutions Ltd · {today.toLocaleDateString('en-RW', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPI label="Active Loans" value={String(all.length)} sub={`${overdueLoans.length} overdue`} color="border-l-amber-500" />
        <KPI label="Total Outstanding" value={formatRWF(totalOutstanding)} sub="Gross loan portfolio" color="border-l-blue-500" />
        <KPI label="Collected This Month" value={formatRWF(monthPayments)} sub="Payments received" color="border-l-green-500" />
        <KPI label="Portfolio at Risk" value={`${parRatio}%`} sub={`${formatRWF(overdueAmount)} overdue`} color={Number(parRatio) > 5 ? 'border-l-red-500' : 'border-l-green-500'} />
      </div>

      {/* Monthly P&L */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">This Month Income</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Interest received</span><span className="font-semibold">{formatRWF(monthInterest)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Total payments</span><span className="font-semibold">{formatRWF(monthPayments)}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">This Month Expenses</p>
          <p className="text-2xl font-bold text-red-600">{formatRWF(monthExpenses)}</p>
          <p className="text-xs text-slate-400 mt-1">{(expenses ?? []).length} expense entries</p>
        </div>
        <div className={`rounded-2xl p-6 shadow-sm border ${monthProfit >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">This Month Profit</p>
          <p className={`text-2xl font-bold ${monthProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatRWF(Math.abs(monthProfit))}</p>
          <p className="text-xs text-slate-400 mt-1">{monthProfit >= 0 ? 'Profit' : 'Loss'} (interest only)</p>
        </div>
      </div>

      {/* Portfolio by Loan Type */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-slate-700 mb-4">Portfolio by Loan Type</p>
          <div className="space-y-3">
            {Object.entries(byType).map(([type, data]) => (
              <div key={type}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{loanTypeLabel[type] ?? type}</span>
                  <span className="font-semibold">{data.count} loans · {formatRWF(data.outstanding)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(data.outstanding / totalOutstanding * 100).toFixed(0)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-slate-700 mb-4">Portfolio by Gender</p>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Male clients</span>
                <span className="font-semibold">{men.length} loans ({((men.length / all.length) * 100).toFixed(0)}%)</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(men.length / all.length * 100).toFixed(0)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Female clients</span>
                <span className="font-semibold">{women.length} loans ({((women.length / all.length) * 100).toFixed(0)}%)</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full">
                <div className="h-full bg-pink-500 rounded-full" style={{ width: `${(women.length / all.length * 100).toFixed(0)}%` }} />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-xs text-slate-400">
              Total collected since inception: {formatRWF(totalCollected)}
            </div>
          </div>
        </div>
      </div>

      {/* Historical Performance */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-8">
        <p className="text-sm font-bold text-slate-700 mb-4">Historical Performance (Since Inception July 2025)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Quarter', 'Total Assets', 'Loan Portfolio', 'Net Profit', 'Clients'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historical.map(h => (
                <tr key={h.period} className="border-b border-slate-50">
                  <td className="py-3 px-3 font-semibold text-slate-700">{h.period}</td>
                  <td className="py-3 px-3">{formatRWF(h.assets)}</td>
                  <td className="py-3 px-3">{formatRWF(h.loans)}</td>
                  <td className="py-3 px-3 text-green-700 font-semibold">{formatRWF(h.profit)}</td>
                  <td className="py-3 px-3">{h.clients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overdue Loans */}
      {overdueLoans.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
          <p className="text-sm font-bold text-red-800 mb-4">🚨 Overdue Loans Requiring Attention ({overdueLoans.length})</p>
          <div className="space-y-2">
            {overdueLoans.slice(0, 10).map(l => {
              const daysOver = Math.floor((today.getTime() - new Date(l.maturity_date).getTime()) / 86400000)
              return (
                <div key={l.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-red-100">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{(l as any).iacm_clients?.full_name}</p>
                    <p className="text-xs text-red-500">{daysOver} days overdue · {l.loan_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-700 text-sm">{formatRWF(l.balance_outstanding)}</p>
                    <a href={`https://wa.me/${(l as any).iacm_clients?.phone?.replace(/\D/g,'')}`}
                      target="_blank" rel="noreferrer" className="text-xs text-green-600 hover:underline">WhatsApp</a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
