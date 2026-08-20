import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAccountMovementSum } from '@/lib/ledger'
import { NET_PROFIT_CUTOFF, NET_PROFIT_BASE_AS_OF_CUTOFF, LIABILITY_EXPENSE_CATEGORIES } from '@/lib/net-profit'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Kept in sync with app/api/admin/iacm/expenses/route.ts's EXPENSE_ACCOUNTS
// and app/admin/iacm/expenses/new/page.tsx's CATEGORIES -- stale here until
// 2026-08-20 (still had 'petty_cash', a generic 'tax' label, no per-account
// PAYE/CBHI/Pension/Maternity/WHT entries) even after those were fixed
// elsewhere earlier the same night. See docs/known-gaps.md.
const CATEGORY_LABELS: Record<string, string> = {
  interest_on_borrowings: 'Interest on Borrowings',
  personnel: 'Salaries & Wages',
  staff_benefits: 'Staff Benefits & Welfare',
  rent: 'Office Rent',
  utilities: 'Utilities',
  it_software: 'IT & Software Expenses',
  legal: 'Legal & Professional Fees',
  transport: 'Travel & Transport',
  communication: 'Communication Expenses',
  bank_charges: 'Bank Charges & Commissions',
  income_tax_expense: 'Income Tax Expense',
  paye: 'PAYE Payables',
  cbhi: 'CBHI Payables',
  pension: 'Pension and Risk Contribution Payables',
  maternity: 'Maternity Contribution Payables',
  wht: 'Withholding Tax (WHT) Payables',
  tax: 'Corporate Income Tax (Payable)',
  depreciation: 'Depreciation & Amortization',
  other: 'Other Operating Expenses',
}

export default async function AdminIncome() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  const [
    { data: iacmPayments },
    { data: iacmExpenses },
    { data: iacmLoans },
  ] = await Promise.all([
    supabase.from('iacm_payments').select('total_amount, interest_portion, fee_portion, payment_date'),
    supabase.from('iacm_expenses').select('amount, expense_date, category'),
    supabase.from('iacm_loans').select('disbursed_amount, balance_outstanding, status'),
  ])

  const allPayments = iacmPayments ?? []
  const allExpenses = iacmExpenses ?? []
  const allIacmLoans = iacmLoans ?? []

  // imported_loans deliberately excluded from every figure on this page —
  // confirmed stale (frozen at an 11-Jun-2026 bulk import), already excluded
  // from the main dashboard's KPIs for the same reason. iacm_* is the sole
  // source of truth here, matching app/admin/page.tsx exactly.
  const incomeByMonth: Record<string, { interest: number; fees: number; vat: number; total: number }> = {}
  const touch = (mk: string) => { if (!incomeByMonth[mk]) incomeByMonth[mk] = { interest: 0, fees: 0, vat: 0, total: 0 } }

  for (const p of allPayments) {
    const mk = (p.payment_date ?? '').slice(0, 7)
    if (!mk) continue
    touch(mk)
    incomeByMonth[mk].interest += Number(p.interest_portion ?? 0)
    incomeByMonth[mk].fees += Number(p.fee_portion ?? 0)
    incomeByMonth[mk].total += Number(p.total_amount ?? 0)
  }

  const expensesByMonth: Record<string, number> = {}
  for (const e of allExpenses) {
    const mk = (e.expense_date ?? '').slice(0, 7)
    if (!mk) continue
    expensesByMonth[mk] = (expensesByMonth[mk] ?? 0) + Number(e.amount ?? 0)
  }

  const thisMonthKey = new Date().toISOString().slice(0, 7)
  const monthKeys = Array.from(new Set([...Object.keys(incomeByMonth), ...Object.keys(expensesByMonth), thisMonthKey])).sort()

  const totalGross = Object.values(incomeByMonth).reduce((s, v) => s + v.total, 0)
  const totalExpenses = Object.values(expensesByMonth).reduce((s, v) => s + v, 0)

  // Net Profit: shares NET_PROFIT_CUTOFF/NET_PROFIT_BASE_AS_OF_CUTOFF with
  // app/admin/page.tsx via lib/net-profit.ts — these two pages must always
  // show the same Net Profit figure.
  const postCutoffInterest = allPayments
    .filter(p => (p.payment_date ?? '') > NET_PROFIT_CUTOFF)
    .reduce((s, p) => s + Number(p.interest_portion ?? 0), 0)

  // Fee + VAT-derived income (7020) is booked to the ledger at disbursement
  // time, not stored on iacm_payments — see app/admin/page.tsx for the full
  // explanation. Pulled from the real ledger, same window as postCutoffInterest.
  const today = new Date()
  const dayAfterCutoff = new Date(new Date(`${NET_PROFIT_CUTOFF}T00:00:00`).getTime() + 86400000)
  const postCutoffFeeIncome = await getAccountMovementSum(['7020'], dayAfterCutoff, today, 'credit')

  // Real gap confirmed 2026-08-20, same as app/admin/page.tsx: liability-
  // category expenses (PAYE/CBHI/Pension/Maternity/WHT/Tax Payable) settle
  // a real 2xxx payable, not a 6xxx operating cost, and shouldn't reduce
  // Net Profit. Deliberately NOT applied to totalExpenses/expensesByMonth
  // above (the "Total Expenses" KPI card and category breakdown chart) --
  // those track real cash outflow regardless of account type, which is a
  // different, legitimate purpose from Net Profit specifically.
  const postCutoffExpenses = allExpenses
    .filter(e => (e.expense_date ?? '') > NET_PROFIT_CUTOFF && !LIABILITY_EXPENSE_CATEGORIES.includes((e as any).category))
    .reduce((s, e) => s + Number(e.amount ?? 0), 0)
  const netProfit = NET_PROFIT_BASE_AS_OF_CUTOFF + postCutoffInterest + postCutoffFeeIncome - postCutoffExpenses
  const totalDisbursed = allIacmLoans.reduce((s, l) => s + Number(l.disbursed_amount ?? 0), 0)
  const totalOutstanding = allIacmLoans.reduce((s, l) => s + Number(l.balance_outstanding ?? 0), 0)
  const activeLoanCount = allIacmLoans.filter(l => l.status === 'active').length

  const expenseCategoryTotals: Record<string, number> = {}
  for (const e of allExpenses) {
    const cat = e.category ?? 'other'
    expenseCategoryTotals[cat] = (expenseCategoryTotals[cat] ?? 0) + Number(e.amount ?? 0)
  }
  const categoryRows = Object.entries(expenseCategoryTotals).sort((a, b) => b[1] - a[1])

  function monthLabel(key: string): string {
    const [y, m] = key.split('-').map(Number)
    return `${MONTH_NAMES[m - 1]} ${y}`
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Income & P&L Report</h1>
        <p className="text-slate-500 text-sm mt-1">Live figures from recorded loans, payments and expenses — INEMA Financial Solutions Ltd</p>
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
                {monthKeys.map(mk => {
                  const inc = incomeByMonth[mk] ?? { interest: 0, fees: 0, vat: 0, total: 0 }
                  const exp = expensesByMonth[mk] ?? 0
                  const net = inc.total - exp
                  return (
                    <tr key={mk} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{monthLabel(mk)}</td>
                      <td className="px-3 py-2 text-slate-600">{inc.interest > 0 ? formatRWF(inc.interest) : '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{inc.fees > 0 ? formatRWF(inc.fees) : '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{inc.vat > 0 ? formatRWF(inc.vat) : '—'}</td>
                      <td className="px-3 py-2 font-semibold text-green-700">{inc.total > 0 ? formatRWF(inc.total) : '—'}</td>
                      <td className="px-3 py-2 text-red-600">{exp > 0 ? formatRWF(exp) : '—'}</td>
                      <td className={`px-3 py-2 font-bold ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {net !== 0 ? (net >= 0 ? formatRWF(net) : `(${formatRWF(Math.abs(net))})`) : '—'}
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
            {categoryRows.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-6">No expenses recorded yet</div>
            ) : categoryRows.map(([cat, amount]) => {
              const pct = Math.round((amount / totalExpenses) * 100)
              return (
                <div key={cat}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-700">{CATEGORY_LABELS[cat] ?? cat}</span>
                    <span className="text-sm font-semibold text-slate-800">{formatRWF(amount)} <span className="text-xs text-slate-400">{pct}%</span></span>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div><p className="text-slate-400 text-sm">Total Outstanding</p><p className="text-2xl font-bold text-amber-400 mt-1">{formatRWF(totalOutstanding)}</p><p className="text-slate-500 text-xs mt-1">Money still owed to INEMA</p></div>
          <div><p className="text-slate-400 text-sm">Active Loans</p><p className="text-2xl font-bold text-white mt-1">{activeLoanCount}</p><p className="text-slate-500 text-xs mt-1">Currently running</p></div>
        </div>
      </div>
    </div>
  )
}
