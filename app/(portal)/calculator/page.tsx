'use client'
import { useState } from 'react'
import type { CalculatorResult } from '@/types'

const LOAN_TYPES = [
  { value: 'salary_advance', label: 'Salary Advance' },
  { value: 'quinzaine',      label: 'Quinzaine Loan' },
  { value: 'school_fees',    label: 'School Fees Loan' },
  { value: 'business',       label: 'Business Loan' },
]

function rwf(n: number) { return 'RWF ' + Math.round(n).toLocaleString() }

export default function CalculatorPage() {
  const [form, setForm] = useState({ principal: '', term_months: '', loan_type: 'salary_advance' })
  const [result, setResult] = useState<(CalculatorResult & { report: Record<string, unknown> }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function calculate() {
    setLoading(true); setError(''); setResult(null)
    const res = await fetch('/api/calculator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        principal: Number(form.principal),
        term_months: Number(form.term_months),
        loan_type: form.loan_type,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!data.success) { setError(data.error); return }
    setResult(data.data)
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Loan Calculator</h1>
      <p className="text-slate-500 mb-8">
        Get a full breakdown of your repayment schedule before applying.
      </p>

      {/* Input */}
      <div className="card mb-6">
        <h2 className="font-bold text-slate-800 mb-4">Loan Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Loan Type</label>
            <select className="input" value={form.loan_type} onChange={e => setForm({ ...form, loan_type: e.target.value })}>
              {LOAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount (RWF)</label>
            <input type="number" className="input" placeholder="e.g. 1000000"
              value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} />
          </div>
          <div>
            <label className="label">Term (Months)</label>
            <select className="input" value={form.term_months} onChange={e => setForm({ ...form, term_months: e.target.value })}>
              <option value="">Select</option>
              {[1,2,3,4,5,6].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        <button className="btn-gold mt-4 px-8" onClick={calculate} disabled={!form.principal || !form.term_months || loading}>
          {loading ? 'Calculating...' : 'Calculate →'}
        </button>
      </div>

      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Principal',      value: rwf(result.principal),         color: 'border-l-blue-400' },
              { label: 'Month 1 Payment',value: rwf(result.month1_total),       color: 'border-l-amber-400' },
              { label: 'Total Interest', value: rwf(result.total_interest),     color: 'border-l-orange-400' },
              { label: 'Total Repayment',value: rwf(result.total_repayment),    color: 'border-l-green-400' },
            ].map(c => (
              <div key={c.label} className={`card border-l-4 ${c.color} p-4`}>
                <p className="text-xs text-slate-400 uppercase tracking-wide">{c.label}</p>
                <p className="font-bold text-slate-800 mt-1 text-sm">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Month 1 breakdown */}
          <div className="card mb-6 bg-amber-50 border border-amber-200">
            <h2 className="font-bold text-amber-800 mb-4">Month 1 Detailed Breakdown</h2>
            <div className="space-y-2 text-sm">
              {[
                { label: '5% Monthly Interest',             value: rwf(result.month1_interest) },
                { label: '4% Upfront Fees',                 value: rwf(result.month1_fee), sub: true },
                { label: '  └ 1% Application Fee',          value: rwf(Math.round(result.principal * 0.01)), indent: true },
                { label: '  └ 1.5% Processing Fee',         value: rwf(Math.round(result.principal * 0.015)), indent: true },
                { label: '  └ 1.5% Management Fee',         value: rwf(Math.round(result.principal * 0.015)), indent: true },
                { label: '18% VAT (on fees only)',          value: rwf(result.month1_vat) },
              ].map(r => (
                <div key={r.label} className={`flex justify-between ${r.indent ? 'pl-4 text-amber-700' : 'text-amber-900 font-medium'}`}>
                  <span>{r.label}</span><span>{r.value}</span>
                </div>
              ))}
              <div className="border-t border-amber-300 pt-2 flex justify-between font-bold text-amber-900">
                <span>MONTH 1 TOTAL</span><span>{rwf(result.month1_total)}</span>
              </div>
            </div>
          </div>

          {result.term_months > 1 && (
            <div className="card mb-6 bg-slate-50">
              <h2 className="font-bold text-slate-700 mb-3">Months 2–{result.term_months} (each)</h2>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">5% Monthly Interest Only</span>
                <span className="font-bold text-slate-800">{rwf(result.subsequent_monthly)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">No fees, no VAT from Month 2 onwards.</p>
            </div>
          )}

          {/* Full repayment schedule */}
          <div className="card mb-6">
            <h2 className="font-bold text-slate-800 mb-4">Full Repayment Schedule</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Month', 'Description', 'Due Date', 'Interest', 'Fees', 'VAT', 'Total Payment'].map(h => (
                      <th key={h} className="text-left pb-3 pr-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map(row => (
                    <tr key={row.month} className={`border-b border-slate-50 ${row.month === 1 ? 'bg-amber-50' : ''}`}>
                      <td className="py-3 pr-3 font-bold text-slate-700">{row.month}</td>
                      <td className="py-3 pr-3 text-slate-500 text-xs max-w-[160px]">{row.label}</td>
                      <td className="py-3 pr-3 text-slate-600">{row.due_date}</td>
                      <td className="py-3 pr-3 text-slate-600">{rwf(row.interest)}</td>
                      <td className="py-3 pr-3 text-slate-600">{row.fee_amount > 0 ? rwf(row.fee_amount) : '—'}</td>
                      <td className="py-3 pr-3 text-slate-600">{row.vat_amount > 0 ? rwf(row.vat_amount) : '—'}</td>
                      <td className="py-3 font-bold text-slate-800">{rwf(row.total_payment)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-bold">
                    <td colSpan={5} className="pt-3 text-slate-700">TOTALS</td>
                    <td className="pt-3 text-slate-500 text-xs">{result.effective_total_rate} cost</td>
                    <td className="pt-3 text-slate-800">{rwf(result.total_repayment)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Cost summary */}
          <div className="card bg-slate-900 text-white mb-6">
            <h2 className="font-bold mb-4 text-amber-400">Total Cost Summary</h2>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Principal (loan amount)', value: rwf(result.principal) },
                { label: 'Total Interest (5% × all months)', value: rwf(result.total_interest) },
                { label: 'Total Fees + VAT (month 1 only)', value: rwf(result.total_fees_and_vat) },
              ].map(r => (
                <div key={r.label} className="flex justify-between text-slate-300">
                  <span>{r.label}</span><span>{r.value}</span>
                </div>
              ))}
              <div className="border-t border-slate-700 pt-3 flex justify-between font-bold text-white text-base">
                <span>TOTAL REPAYMENT</span><span className="text-amber-400">{rwf(result.total_repayment)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <a href="/loans/apply" className="btn-gold">Apply for This Loan →</a>
            <button className="btn-outline" onClick={() => setResult(null)}>Recalculate</button>
          </div>

          <p className="text-xs text-slate-400 mt-4">
            This is an estimate. Final amounts confirmed upon loan approval. INEMA Financial Solutions Ltd — Licensed by BNR, Category III NDFSP.
          </p>
        </>
      )}
    </div>
  )
}
