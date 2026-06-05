import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'

export default async function AdminIncome() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()
  const { data: loans } = await supabase.from('imported_loans').select('*')
  const allLoans = loans ?? []

  const months = [
    { key: '2025-07', label: 'Jul 2025' }, { key: '2025-08', label: 'Aug 2025' },
    { key: '2025-09', label: 'Sep 2025' }, { key: '2025-10', label: 'Oct 2025' },
    { key: '2025-11', label: 'Nov 2025' }, { key: '2025-12', label: 'Dec 2025' },
    { key: '2026-01', label: 'Jan 2026' }, { key: '2026-02', label: 'Feb 2026' },
    { key: '2026-03', label: 'Mar 2026' }, { key: '2026-04', label: 'Apr 2026' },
    { key: '2026-05', label: 'May 2026' }, { key: '2026-06', label: 'Jun 2026' },
  ]

  const staticExpenses: Record<string, number> = {
    '2025-07': 999500, '2025-08': 608753, '2025-09': 533158,
    '2025-10': 549658, '2025-11': 533658, '2025-12': 533658,
    '2026-01': 533658, '2026-02': 533658, '2026-03': 533658,
    '2026-04': 533658, '2026-05': 533658, '2026-06': 533658,
  }

  const calcLoanIncome = (loan: { principal: number; term_months: number; total_due: number; amount_paid: number; status: string }) => {
    const p = loan.principal ?? 0
    const m = loan.term_months ?? 1
    const interest = p * 0.05 * m
    const fee = p * 0.04
    const vat = fee * 0.18
    const total = interest + fee + vat
    if (loan.status === 'paid') return { interest, fee, vat, total }
    const ratio = Math.min((loan.amount_paid ?? 0) / (loan.total_due ?? 1), 1)
    return { interest: interest * ratio, fee: fee * ratio, vat: vat * ratio, total: total * ratio }
  }

  const incomeByMonth: Record<string, { interest: number; fees: number; vat: number; total: number }> = {}
  for (const loan of allLoans) {
    if (!loan.date_offered) continue
    const mk = loan.date_offered.substring(0, 7)
    if (!incomeByMonth[mk]) incomeByMonth[mk] = { interest: 0, fees: 0, vat: 0, total: 0 }
    const inc = calcLoanIncome(loan)
    incomeByMonth[mk].interest += inc.interest
    incomeByMonth[mk].fees += inc.fee
    incomeByMonth[mk].vat += inc.vat
    incomeByMonth[mk].total += inc.total
  }

  const totalGross = Object.values(incomeByMonth).reduce((s, v) => s + v.total, 0)
  const totalExpenses = Object.values(staticExpenses).reduce((s, v) => s + v, 0)
  const netProfit = totalGross - totalExpenses
  const totalDisbursed = allLoans.reduce((s, l) => s + (l.principal ?? 0), 0)
  const totalOutstanding = allLoans.filter(l => l.status !== 'paid').reduce((s, l) => s + Math.max(0, (l.total_due ?? 0) - (l.amount_paid ?? 0)), 0)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Income & P&L Report</h1>
        <p className="text-slate-500 text-sm mt-1">July 2025 — Present · INEMA Financial Solutions Ltd</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Disbursed', value: formatRWF(totalDisbursed), sub: 'Capital deployed', color: 'border-blue-500' },
          { label: 'Gross Income', value: formatRWF(totalGross), sub: 'Interest + fees earned', color: 'border-green-500' },
          { label: 'Total Expenses', value: formatRWF(totalExpenses), sub: 'All operational costs', color: 'border-red-500' },
          { label: 'Net Profit', value: formatRWF(netProfit), sub: netProfit >= 0 ? '✅ Profitable' : '⚠️ Loss', color: netProfit >= 0 ? 'border-green-500' : 'border-red-500' },
        ].map(c => (
          <div key={c.label} className={`bg-white rounded-xl p-5 border border-slate-100 border-l-4 ${c.color} shadow-sm`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{c.label}</p>
            <p className="text-xl font-bold text-slate-800 mt-1 leading-tight">{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h2 className="font-bold text-slate-800">Monthly Income Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Month','Interest','Fees','VAT','Income','Expenses','Net'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map(m => {
                  const inc = incomeByMonth[m.key] ?? { interest: 0, fees: 0, vat: 0, total: 0 }
                  const exp = staticExpenses[m.key] ?? 0
                  const net = inc.total - exp
                  return (
                    <tr key={m.key} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{m.label}</td>
                      <td className="px-3 py-2 text-slate-600">{inc.interest > 0 ? formatRWF(inc.interest) : '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{inc.fees > 0 ? formatRWF(inc.fees) : '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{inc.vat > 0 ? formatRWF(inc.vat) : '—'}</td>
                      <td className="px-3 py-2 font-semibold text-green-700">{inc.total > 0 ? formatRWF(inc.total) : '—'}</td>
                      <td className="px-3 py-2 text-red-600">{formatRWF(exp)}</td>
                      <td className={`px-3 py-2 font-bold ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {net >= 0 ? formatRWF(net) : `(${formatRWF(Math.abs(net))})`}
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                  <td className="px-3 py-3 text-slate-800">TOTAL</td>
                  <td className="px-3 py-3">{formatRWF(Object.values(incomeByMonth).reduce((s,v)=>s+v.interest,0))}</td>
                  <td className="px-3 py-3">{formatRWF(Object.values(incomeByMonth).reduce((s,v)=>s+v.fees,0))}</td>
                  <td className="px-3 py-3">{formatRWF(Object.values(incomeByMonth).reduce((s,v)=>s+v.vat,0))}</td>
                  <td className="px-3 py-3 text-green-700">{formatRWF(totalGross)}</td>
                  <td className="px-3 py-3 text-red-700">{formatRWF(totalExpenses)}</td>
                  <td className={`px-3 py-3 ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatRWF(netProfit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h2 className="font-bold text-slate-800">Expense Categories</h2>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: 'Staff Wages (net)', amount: 3213850, note: '~RWF 321,385/mo × 10' },
              { label: 'PAYE/TPR', amount: 1140000, note: '~RWF 114,000/mo' },
              { label: 'RSSB (employer)', amount: 415000, note: 'Pension + maternity' },
              { label: 'Rent', amount: 942000, note: 'Jul 2025 annual' },
              { label: 'Network/Internet', amount: 264000, note: 'RWF 24,000/mo' },
              { label: 'Notaire', amount: 100000, note: 'RWF 10,000/mo' },
              { label: 'Electricity', amount: 55000, note: 'RWF 5,000/mo' },
              { label: 'Isuku/Cleaning', amount: 121000, note: 'RWF 11,000/mo' },
              { label: 'Bank Charges', amount: 82500, note: 'Variable' },
              { label: 'RRA Penalties', amount: 75753, note: 'One-time Aug 2025' },
            ].sort((a,b)=>b.amount-a.amount).map(exp => {
              const pct = Math.round((exp.amount / totalExpenses) * 100)
              return (
                <div key={exp.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-700">{exp.label} <span className="text-xs text-slate-400">{exp.note}</span></span>
                    <span className="text-sm font-semibold text-slate-800">{formatRWF(exp.amount)} <span className="text-xs text-slate-400">{pct}%</span></span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-amber-500 h-1.5 rounded-full" style={{width:`${pct}%`}} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 text-white">
        <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest mb-4">Outstanding Portfolio</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div><p className="text-slate-400 text-sm">Total Outstanding</p><p className="text-2xl font-bold text-amber-400 mt-1">{formatRWF(totalOutstanding)}</p><p className="text-slate-500 text-xs mt-1">Money still owed to INEMA</p></div>
          <div><p className="text-slate-400 text-sm">Active Loans</p><p className="text-2xl font-bold text-white mt-1">{allLoans.filter(l=>l.status!=='paid').length}</p><p className="text-slate-500 text-xs mt-1">Currently running</p></div>
          <div><p className="text-slate-400 text-sm">Est. Future Income</p><p className="text-2xl font-bold text-green-400 mt-1">{formatRWF(totalOutstanding * 0.09)}</p><p className="text-slate-500 text-xs mt-1">On outstanding balance</p></div>
        </div>
      </div>
    </div>
  )
}
