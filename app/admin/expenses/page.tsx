import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'

const CATEGORY_LABELS: Record<string, string> = {
  personnel: 'Personnel Expenses (Salaries, PAYE, RSSB)',
  rent: 'Rent & Utilities',
  bank_charges: 'Bank Charges & Commissions',
  communication: 'Communication & Internet',
  stationery: 'Office Stationery & Supplies',
  transport: 'Transport & Travel',
  advertising: 'Advertising & Marketing',
  legal: 'Legal & Professional Fees',
  maintenance: 'Maintenance & Repairs',
  petty_cash: 'Petty Cash / Miscellaneous',
  tax: 'Tax Payments (PAYE, RSSB, CBHI)',
  depreciation: 'Depreciation',
  other: 'Other Operating Expenses',
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default async function AdminExpenses() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  const { data: iacmExpenses } = await supabase
    .from('iacm_expenses')
    .select('amount, expense_date, category, description')
    .order('expense_date', { ascending: false })
  const allExpenses = iacmExpenses ?? []

  const grandTotal = allExpenses.reduce((s, e) => s + Number(e.amount ?? 0), 0)

  const byMonth: Record<string, number> = {}
  for (const e of allExpenses) {
    const mk = (e.expense_date ?? '').slice(0, 7)
    if (!mk) continue
    byMonth[mk] = (byMonth[mk] ?? 0) + Number(e.amount ?? 0)
  }
  const monthKeys = Object.keys(byMonth).sort()
  const maxMonthTotal = Math.max(1, ...monthKeys.map(k => byMonth[k]))
  const monthlyAverage = monthKeys.length > 0 ? grandTotal / monthKeys.length : 0

  const byCategory: Record<string, number> = {}
  for (const e of allExpenses) {
    const cat = e.category ?? 'other'
    byCategory[cat] = (byCategory[cat] ?? 0) + Number(e.amount ?? 0)
  }
  const categoryRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1])

  function monthLabel(key: string): string {
    const [y, m] = key.split('-').map(Number)
    return `${MONTH_NAMES[m - 1]} ${y}`
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Expenses</h1>
        <p className="text-slate-500 text-sm mt-1">Live operational expenses recorded through the app — <a href="/admin/iacm/expenses/new" className="text-amber-600 hover:underline">record a new one</a></p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border border-slate-100 border-l-4 border-l-red-500 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Expenses</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{formatRWF(grandTotal)}</p>
          <p className="text-xs text-slate-400 mt-1">{monthKeys.length} month{monthKeys.length === 1 ? '' : 's'} recorded</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100 border-l-4 border-l-amber-500 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Monthly Average</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{formatRWF(Math.round(monthlyAverage))}</p>
          <p className="text-xs text-slate-400 mt-1">Per month with activity</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100 border-l-4 border-l-blue-500 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Entries</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{allExpenses.length}</p>
          <p className="text-xs text-slate-400 mt-1">Total recorded expenses</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h2 className="font-bold text-slate-800">Monthly Totals</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {monthKeys.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No expenses recorded yet</div>
            ) : monthKeys.map(key => {
              const total = byMonth[key]
              const pct = Math.round((total / maxMonthTotal) * 100)
              return (
                <div key={key} className="px-5 py-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-medium text-slate-700">{monthLabel(key)}</span>
                    <span className="text-sm font-bold text-red-600">{formatRWF(total)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {monthKeys.length > 0 && (
              <div className="px-5 py-3 bg-slate-50">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-800">TOTAL</span>
                  <span className="font-bold text-red-700">{formatRWF(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h2 className="font-bold text-slate-800">By Category</h2>
            <p className="text-xs text-slate-400 mt-0.5">All recorded expenses, grouped</p>
          </div>
          <div className="divide-y divide-slate-50">
            {categoryRows.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No expenses recorded yet</div>
            ) : categoryRows.map(([cat, amount]) => {
              const pct = Math.round((amount / grandTotal) * 100)
              return (
                <div key={cat} className="px-5 py-3">
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-medium text-slate-700">{CATEGORY_LABELS[cat] ?? cat}</p>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">{formatRWF(amount)}</p>
                      <p className="text-xs text-slate-400">{pct}%</p>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1">
                    <div className="bg-amber-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {categoryRows.length > 0 && (
              <div className="px-5 py-3 bg-slate-50">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-800">Total</span>
                  <span className="font-bold text-slate-800">{formatRWF(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
