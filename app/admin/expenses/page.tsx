import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'

export default async function AdminExpenses() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  // expenses table available for future dynamic entries
  await supabase.from('expenses').select('id').limit(1)

  // Static monthly expenses from Excel
  const staticMonthly = [
    { category: 'Staff Wages (net)', amount: 321385, note: 'Devotha net salary' },
    { category: 'PAYE/TPR', amount: 114000, note: 'Tax on salary' },
    { category: 'RSSB Pension (employer)', amount: 40000, note: '6% employer contribution' },
    { category: 'RSSB Maternity (employer)', amount: 1500, note: '0.3% employer' },
    { category: 'CBHI', amount: 1773, note: '0.5% of salary' },
    { category: 'Network/Internet', amount: 24000, note: 'Monthly' },
    { category: 'Notaire', amount: 10000, note: 'Monthly' },
    { category: 'Electricity', amount: 5000, note: 'Monthly' },
    { category: 'Isuku/Cleaning', amount: 11000, note: 'Monthly' },
    { category: 'Bank Charges', amount: 5000, note: 'Variable ~5,000/mo' },
  ]

  const monthlyTotal = staticMonthly.reduce((s, e) => s + e.amount, 0)

  const months = [
    { key: '2025-07', label: 'Jul 2025', total: 999500 },
    { key: '2025-08', label: 'Aug 2025', total: 608753 },
    { key: '2025-09', label: 'Sep 2025', total: 533158 },
    { key: '2025-10', label: 'Oct 2025', total: 549658 },
    { key: '2025-11', label: 'Nov 2025', total: 533658 },
    { key: '2025-12', label: 'Dec 2025', total: 533658 },
    { key: '2026-01', label: 'Jan 2026', total: 533658 },
    { key: '2026-02', label: 'Feb 2026', total: 533658 },
    { key: '2026-03', label: 'Mar 2026', total: 533658 },
    { key: '2026-04', label: 'Apr 2026', total: 533658 },
    { key: '2026-05', label: 'May 2026', total: 533658 },
  ]

  const grandTotal = months.reduce((s, m) => s + m.total, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Expenses</h1>
        <p className="text-slate-500 text-sm mt-1">Full operational expense tracking — July 2025 to present</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border border-slate-100 border-l-4 border-l-red-500 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Expenses</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{formatRWF(grandTotal)}</p>
          <p className="text-xs text-slate-400 mt-1">All time (11 months)</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100 border-l-4 border-l-amber-500 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Monthly Average</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{formatRWF(Math.round(grandTotal / 11))}</p>
          <p className="text-xs text-slate-400 mt-1">Per month</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100 border-l-4 border-l-blue-500 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Recurring Monthly</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{formatRWF(monthlyTotal)}</p>
          <p className="text-xs text-slate-400 mt-1">Fixed costs per month</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly breakdown */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h2 className="font-bold text-slate-800">Monthly Totals</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {months.map(m => {
              const pct = Math.round((m.total / Math.max(...months.map(x => x.total))) * 100)
              return (
                <div key={m.key} className="px-5 py-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-medium text-slate-700">{m.label}</span>
                    <span className="text-sm font-bold text-red-600">{formatRWF(m.total)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            <div className="px-5 py-3 bg-slate-50">
              <div className="flex justify-between">
                <span className="font-bold text-slate-800">TOTAL</span>
                <span className="font-bold text-red-700">{formatRWF(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h2 className="font-bold text-slate-800">Recurring Monthly Expenses</h2>
            <p className="text-xs text-slate-400 mt-0.5">Fixed costs every month</p>
          </div>
          <div className="divide-y divide-slate-50">
            {staticMonthly.sort((a, b) => b.amount - a.amount).map(exp => {
              const pct = Math.round((exp.amount / monthlyTotal) * 100)
              return (
                <div key={exp.category} className="px-5 py-3">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{exp.category}</p>
                      <p className="text-xs text-slate-400">{exp.note}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">{formatRWF(exp.amount)}</p>
                      <p className="text-xs text-slate-400">{pct}%</p>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1">
                    <div className="bg-amber-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            <div className="px-5 py-3 bg-slate-50">
              <div className="flex justify-between">
                <span className="font-bold text-slate-800">Monthly Total</span>
                <span className="font-bold text-slate-800">{formatRWF(monthlyTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* One-time expenses */}
      <div className="mt-6 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50">
          <h2 className="font-bold text-slate-800">One-Time / Irregular Expenses</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {[
            { month: 'Jul 2025', item: 'Annual Rent', amount: 942000, note: 'Paid once' },
            { month: 'Aug 2025', item: 'RRA/RSSB Penalties', amount: 75753, note: 'Registration penalties' },
            { month: 'Oct 2025', item: 'Extra Bank Charges', amount: 16000, note: 'Higher than normal' },
          ].map(e => (
            <div key={e.item} className="px-5 py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-slate-700">{e.item}</p>
                <p className="text-xs text-slate-400">{e.month} · {e.note}</p>
              </div>
              <p className="text-sm font-bold text-red-600">{formatRWF(e.amount)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
