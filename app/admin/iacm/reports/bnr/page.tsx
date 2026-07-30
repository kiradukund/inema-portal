'use client'
import { useState } from 'react'

const QUARTERS = [
  { value: 'Q1-2026', label: 'Q1 2026 (January — March 2026)' },
  { value: 'Q2-2026', label: 'Q2 2026 (April — June 2026)' },
  { value: 'Q3-2026', label: 'Q3 2026 (July — September 2026)' },
  { value: 'Q4-2026', label: 'Q4 2026 (October — December 2026)' },
  { value: 'Q1-2027', label: 'Q1 2027 (January — March 2027)' },
]

export default function BNRReportPage() {
  const [quarter, setQuarter] = useState('Q3-2026')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function generate() {
    setLoading(true); setError(''); setSuccess(false)
    try {
      const res = await fetch(`/api/admin/iacm/reports/bnr?quarter=${quarter}`)
      const contentType = res.headers.get('content-type') ?? ''
      // fetch() follows redirects transparently, so an expired/invalid admin
      // session can come back as res.ok===true with the login page's HTML
      // instead of the file — that downloads as a same-named ".xlsx" that
      // Excel then reports as corrupt. Catch it here instead.
      if (!res.ok || !contentType.includes('spreadsheetml')) {
        const text = await res.text()
        try { const j = JSON.parse(text); setError(j.error ?? 'Failed') }
        catch { setError(contentType.includes('text/html') ? 'Session expired — please refresh and log in again' : 'Failed to generate report') }
        setLoading(false); return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `INEMA_BNR_Report_${quarter}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setSuccess(true)
    } catch (e) { setError('Failed to generate. Try again.') }
    setLoading(false)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">BNR Report Generator</h1>
        <p className="text-slate-500 text-sm mt-1">Generate quarterly BNR report in the exact format required by the National Bank of Rwanda</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">✓ Report downloaded successfully. Review before sending to BNR.</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-6">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">Reporting Quarter</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            value={quarter} onChange={e => setQuarter(e.target.value)}>
            {QUARTERS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
          </select>
        </div>

        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Auto-filled from your data</p>
          <div className="space-y-1.5">
            {[
              ['A1.2. FS', 'Gross loans, loan classification totals, income/expenses, gender & sector breakdowns for the selected quarter\'s column'],
              ['A1.3. Normal Loans', 'Loans with 0 days overdue, full BNR borrower detail'],
              ['A1.4. Watch (1-89 days)', 'Loans 1-89 days past maturity — auto-classified'],
              ['A1.5. Substandard (90-179)', 'Loans 90-179 days past maturity'],
              ['A1.6. Doubtful (180-359)', 'Loans 180-359 days past maturity'],
              ['A1.7. Loss (360+ days)', 'Loans 360+ days past maturity'],
            ].map(([sheet, desc]) => (
              <div key={sheet} className="flex items-start gap-2">
                <span className="text-green-500 text-xs mt-0.5">✓</span>
                <div><span className="text-xs font-semibold text-slate-700">{sheet}</span>
                <span className="text-xs text-slate-400 ml-1">— {desc}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-xs font-bold text-amber-700 mb-2">⚠️ Still needs manual entry before sending to BNR</p>
          <ul className="text-xs text-amber-700 space-y-1">
            {[
              'Cash-in-vault vs cash-at-bank split, fixed assets/depreciation, borrowings, share capital & retained earnings movements',
              'Income tax, donations and dividend lines',
              'Staff, board member and shareholder counts',
              'SME and Youth-entity loan statistics',
              'New loan applications and rejections',
              'Ratios: NPL ratio, Capital Adequacy Ratio, ROA, ROE, cost-to-income',
              'Restructured loans and written-off loans sheets',
              '"Relationship with the NDFSP" and "Branch name" on loan sheets are defaulted (none / single office) — confirm before sending',
              'Ensure all loan payments and expenses for the quarter are recorded first',
            ].map(item => <li key={item}>• {item}</li>)}
          </ul>
        </div>

        <button onClick={generate} disabled={loading}
          className="w-full bg-slate-800 text-white py-3.5 rounded-xl font-bold hover:bg-slate-700 disabled:opacity-60 text-sm flex items-center justify-center gap-2">
          {loading ? <><span className="animate-spin inline-block">⟳</span> Generating Excel file...</>
                   : <><span>📥</span> Download BNR Report — {quarter}</>}
        </button>

        <p className="text-xs text-slate-400 text-center">Downloads as .xlsx — ready to email to BNR at regulation@bnr.rw</p>
      </div>
    </div>
  )
}
