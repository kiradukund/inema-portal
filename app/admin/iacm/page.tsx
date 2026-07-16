import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function IACMDashboard() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  const { data: loans } = await supabase
    .from('iacm_loans')
    .select('*, iacm_clients(full_name, phone)')
    .eq('status', 'active')
    .order('maturity_date', { ascending: true })

  const { data: expenses } = await supabase
    .from('iacm_expenses')
    .select('amount, expense_date')
    .gte('expense_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])

  const all = loans ?? []
  const today = new Date()

  const totalOutstanding = all.reduce((s, l) => s + Number(l.balance_outstanding ?? 0), 0)
  const totalDisbursed = all.reduce((s, l) => s + Number(l.disbursed_amount ?? 0), 0)
  const monthlyExpenses = (expenses ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0)

  // Days overdue calculation
  const overdue = all.filter(l => {
    const maturity = new Date(l.maturity_date)
    return maturity < today && Number(l.balance_outstanding) > 0
  })

  // Due this month
  const dueThisMonth = all.filter(l => {
    const maturity = new Date(l.maturity_date)
    return maturity.getMonth() === today.getMonth() && maturity.getFullYear() === today.getFullYear()
  })

  const navItems = [
    { href: '/admin/iacm/loans/new', label: '+ Record New Loan', icon: '💳', color: 'bg-amber-600 text-white' },
    { href: '/admin/iacm/loans', label: 'Loan Portfolio', icon: '📊', color: 'bg-white text-slate-800 border border-slate-200' },
    { href: '/admin/iacm/payments/new', label: 'Record Payment', icon: '💰', color: 'bg-green-600 text-white' },
    { href: '/admin/iacm/expenses/new', label: 'Record Expense', icon: '📋', color: 'bg-white text-slate-800 border border-slate-200' },
    { href: '/admin/iacm/journal', label: 'Journal Entries', icon: '📒', color: 'bg-white text-slate-800 border border-slate-200' },
    { href: '/admin/iacm/reports/bnr', label: 'Generate BNR Report', icon: '🏦', color: 'bg-slate-800 text-white' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">IACM — Accounting & Compliance</h1>
        <p className="text-slate-500 text-sm mt-1">Internal system for loan management, accounting and BNR reporting</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {navItems.map(n => (
          <Link key={n.href} href={n.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity ${n.color}`}>
            <span className="text-lg">{n.icon}</span>{n.label}
          </Link>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Active Loans', value: all.length, sub: `${overdue.length} overdue`, color: 'border-l-amber-500' },
          { label: 'Total Outstanding', value: formatRWF(totalOutstanding), sub: 'Gross loan portfolio', color: 'border-l-blue-500' },
          { label: 'Total Disbursed', value: formatRWF(totalDisbursed), sub: 'Active loans only', color: 'border-l-green-500' },
          { label: 'Monthly Expenses', value: formatRWF(monthlyExpenses), sub: 'This month so far', color: 'border-l-red-400' },
        ].map(k => (
          <div key={k.label} className={`bg-white rounded-xl p-5 border border-slate-100 border-l-4 ${k.color} shadow-sm`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{k.label}</p>
            <p className="text-xl font-bold text-slate-800">{k.value}</p>
            <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Due This Month */}
      {dueThisMonth.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <h2 className="font-bold text-amber-800 mb-3">⚠️ Maturing This Month ({dueThisMonth.length} loans)</h2>
          <div className="space-y-2">
            {dueThisMonth.map(l => (
              <div key={l.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-amber-100">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{(l as any).iacm_clients?.full_name}</p>
                  <p className="text-xs text-slate-500">{l.loan_number} · Due {new Date(l.maturity_date).toLocaleDateString('en-RW')}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800 text-sm">{formatRWF(l.balance_outstanding)}</p>
                  <a href={`https://wa.me/${(l as any).iacm_clients?.phone?.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                    className="text-xs text-green-600 hover:underline">WhatsApp</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h2 className="font-bold text-red-800 mb-3">🚨 Overdue Loans ({overdue.length})</h2>
          <div className="space-y-2">
            {overdue.map(l => {
              const daysOver = Math.floor((today.getTime() - new Date(l.maturity_date).getTime()) / 86400000)
              return (
                <div key={l.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-red-100">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{(l as any).iacm_clients?.full_name}</p>
                    <p className="text-xs text-red-500">{daysOver} days overdue · {l.loan_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-600 text-sm">{formatRWF(l.balance_outstanding)}</p>
                    <a href={`https://wa.me/${(l as any).iacm_clients?.phone?.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                      className="text-xs text-green-600 hover:underline">WhatsApp</a>
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
