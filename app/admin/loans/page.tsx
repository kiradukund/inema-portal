import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'
import Link from 'next/link'

export default async function AdminLoans() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  const { data: loans } = await supabase
    .from('imported_loans')
    .select('*, installments(*)')
    .order('repayment_date', { ascending: true })

  const { data: clients } = await supabase
    .from('imported_clients')
    .select('full_name, phone')

  const clientPhones = Object.fromEntries((clients ?? []).map(c => [c.full_name, c.phone]))
  const allLoans = loans ?? []

  const active = allLoans.filter(l => l.status === 'active' || l.status === 'partial')
  const overdue = allLoans.filter(l => l.status === 'overdue')
  const paid = allLoans.filter(l => l.status === 'paid')

  const statusColors: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    active: 'bg-blue-100 text-blue-700',
    overdue: 'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
  }

  function LoanTable({ title, data, emptyMsg }: { title: string; data: typeof allLoans; emptyMsg: string }) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center gap-3">
          <h2 className="font-bold text-slate-800">{title}</h2>
          <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">{data.length}</span>
        </div>
        {data.length === 0 ? (
          <p className="text-center text-slate-400 p-8 text-sm">{emptyMsg}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Client', 'Principal', 'Total Due', 'Paid', 'Outstanding', 'Due Date', 'Instalments', 'Status', 'WhatsApp'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(loan => {
                  const outstanding = (loan.total_due ?? 0) - (loan.amount_paid ?? 0)
                  const pct = Math.min(Math.round(((loan.amount_paid ?? 0) / (loan.total_due ?? 1)) * 100), 100)
                  const phone = clientPhones[loan.client_name]
                  const installs = loan.installments ?? []
                  const paidInst = installs.filter((i: { status: string }) => i.status === 'paid').length
                  return (
                    <tr key={loan.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 whitespace-nowrap">{loan.client_name}</p>
                        {loan.collateral && <p className="text-xs text-slate-400">{loan.collateral}</p>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{formatRWF(loan.principal)}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatRWF(loan.total_due)}</td>
                      <td className="px-4 py-3">
                        <p className="text-green-700 font-semibold whitespace-nowrap">{formatRWF(loan.amount_paid ?? 0)}</p>
                        <div className="w-16 bg-slate-100 rounded-full h-1 mt-1">
                          <div className="bg-green-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-slate-400">{pct}%</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-700 whitespace-nowrap">
                        {outstanding > 0 ? formatRWF(outstanding) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{loan.repayment_date}</td>
                      <td className="px-4 py-3 text-center">
                        {installs.length > 0 ? (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            {paidInst}/{installs.length}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[loan.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {loan.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {phone ? (
                          <a href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank"
                            className="text-green-600 text-xs font-medium hover:underline whitespace-nowrap">
                            📱 WhatsApp
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Loans</h1>
          <p className="text-slate-500 text-sm mt-1">{allLoans.length} total loans · {active.length} active · {overdue.length} overdue</p>
        </div>
        <Link href="/admin/upload" className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-500">
          + Upload Excel
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active', count: active.length, total: active.reduce((s, l) => s + ((l.total_due ?? 0) - (l.amount_paid ?? 0)), 0), color: 'border-blue-500' },
          { label: 'Overdue', count: overdue.length, total: overdue.reduce((s, l) => s + ((l.total_due ?? 0) - (l.amount_paid ?? 0)), 0), color: 'border-red-500' },
          { label: 'Paid', count: paid.length, total: paid.reduce((s, l) => s + (l.total_due ?? 0), 0), color: 'border-green-500' },
          { label: 'All Loans', count: allLoans.length, total: allLoans.reduce((s, l) => s + (l.principal ?? 0), 0), color: 'border-amber-500' },
        ].map(c => (
          <div key={c.label} className={`bg-white rounded-xl p-4 border border-slate-100 border-l-4 ${c.color} shadow-sm`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{c.count}</p>
            <p className="text-xs text-slate-500 mt-1">{formatRWF(c.total)}</p>
          </div>
        ))}
      </div>

      {overdue.length > 0 && <LoanTable title="🔴 Overdue Loans" data={overdue} emptyMsg="No overdue loans" />}
      <LoanTable title="💳 Active Loans" data={active} emptyMsg="No active loans" />
      <LoanTable title="✅ Paid Loans" data={paid} emptyMsg="No paid loans yet" />
    </div>
  )
}
