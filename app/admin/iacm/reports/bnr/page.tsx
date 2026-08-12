'use client'
import { useState, useEffect } from 'react'

const QUARTERS = [
  { value: 'Q1-2026', label: 'Q1 2026 (January — March 2026)' },
  { value: 'Q2-2026', label: 'Q2 2026 (April — June 2026)' },
  { value: 'Q3-2026', label: 'Q3 2026 (July — September 2026)' },
  { value: 'Q4-2026', label: 'Q4 2026 (October — December 2026)' },
  { value: 'Q1-2027', label: 'Q1 2027 (January — March 2027)' },
]

interface FiledReport {
  id: string
  quarter: string
  year: number
  period_end_date: string
  original_filename: string
  uploaded_at: string
  download_url: string | null
}

function FiledReports() {
  const [reports, setReports] = useState<FiledReport[]>([])
  const [loading, setLoading] = useState(true)
  const [yearFilter, setYearFilter] = useState('all')
  const [quarterFilter, setQuarterFilter] = useState('all')

  useEffect(() => {
    fetch('/api/admin/iacm/reports/bnr/filed')
      .then(res => res.json())
      .then(json => setReports(json.data?.reports ?? []))
      .finally(() => setLoading(false))
  }, [])

  const years = Array.from(new Set(reports.map(r => r.year))).sort((a, b) => b - a)
  const quarters = Array.from(new Set(reports.map(r => r.quarter))).sort()
  const filtered = reports.filter(r =>
    (yearFilter === 'all' || String(r.year) === yearFilter) &&
    (quarterFilter === 'all' || r.quarter === quarterFilter)
  )

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-slate-700">Filed Reports</p>
        <div className="flex gap-2">
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
            value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
            <option value="all">All years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
            value={quarterFilter} onChange={e => setQuarterFilter(e.target.value)}>
            <option value="all">All quarters</option>
            {quarters.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
      </div>
      {loading && <p className="text-xs text-slate-400">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="text-xs text-slate-400">No filed reports yet.</p>}
      <div className="space-y-2">
        {filtered.map(r => (
          <div key={r.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold text-slate-700">{r.quarter} {r.year}</p>
              <p className="text-xs text-slate-400">Period end {r.period_end_date} · {r.original_filename}</p>
            </div>
            {r.download_url
              ? <a href={r.download_url} className="text-xs font-semibold text-amber-700 hover:text-amber-800">Download</a>
              : <span className="text-xs text-slate-300">Unavailable</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BNRReportPage() {
  const [quarter, setQuarter] = useState('Q3-2026')
  const [loading, setLoading] = useState<'submission' | 'internal' | false>(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filedReports, setFiledReports] = useState<FiledReport[]>([])

  useEffect(() => {
    fetch('/api/admin/iacm/reports/bnr/filed')
      .then(res => res.json())
      .then(json => setFiledReports(json.data?.reports ?? []))
  }, [])

  const [selectedQ, selectedYear] = quarter.split('-')
  const filedForSelection = filedReports.find(r => r.quarter === selectedQ && String(r.year) === selectedYear)

  async function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function generate(variant: 'submission' | 'internal') {
    setLoading(variant); setError(''); setSuccess('')
    try {
      // If this quarter was already actually filed with BNR, that real
      // submitted file is the source of truth — serve it byte-for-byte
      // from storage instead of regenerating from today's live data, which
      // can legitimately differ from what was submitted months ago. That
      // archived file never had an internal notes sheet, so both buttons
      // resolve to the same, already-safe download here.
      if (filedForSelection?.download_url) {
        const fileRes = await fetch(filedForSelection.download_url)
        if (!fileRes.ok) throw new Error('filed file fetch failed')
        const blob = await fileRes.blob()
        await downloadBlob(blob, filedForSelection.original_filename)
        setSuccess('Filed report downloaded.')
        setLoading(false)
        return
      }

      const res = await fetch(`/api/admin/iacm/reports/bnr?quarter=${quarter}&variant=${variant}`)
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
      const filename = variant === 'submission'
        ? `INEMA_BNR_Report_${quarter}_FOR_SUBMISSION.xlsx`
        : `INEMA_BNR_Report_${quarter}_INTERNAL_REVIEW_DO_NOT_SEND.xlsx`
      await downloadBlob(blob, filename)
      setSuccess(variant === 'submission'
        ? '✓ Submission-ready file downloaded — no internal notes sheet, safe to send to BNR after your own review.'
        : '✓ Internal review copy downloaded — includes the GENERATOR NOTES sheet. Do not send this file to BNR.')
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
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-6">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">Reporting Quarter</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            value={quarter} onChange={e => setQuarter(e.target.value)}>
            {QUARTERS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
          </select>
          {filedForSelection && (
            <p className="text-xs text-green-600 mt-1.5">✓ Already filed with BNR — downloading will give you the exact file that was submitted, not a fresh regeneration.</p>
          )}
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

        {filedForSelection ? (
          <button onClick={() => generate('submission')} disabled={!!loading}
            className="w-full bg-slate-800 text-white py-3.5 rounded-xl font-bold hover:bg-slate-700 disabled:opacity-60 text-sm flex items-center justify-center gap-2">
            {loading
              ? <><span className="animate-spin inline-block">⟳</span> Fetching filed report...</>
              : <><span>📥</span> Download Filed Report — {quarter}</>}
          </button>
        ) : (
          <>
            <button onClick={() => generate('submission')} disabled={!!loading}
              className="w-full bg-green-700 text-white py-3.5 rounded-xl font-bold hover:bg-green-800 disabled:opacity-60 text-sm flex items-center justify-center gap-2">
              {loading === 'submission'
                ? <><span className="animate-spin inline-block">⟳</span> Generating...</>
                : <><span>📥</span> Download for BNR Submission — {quarter}</>}
            </button>
            <p className="text-xs text-slate-400 text-center -mt-3">Clean file, no internal notes — this is the one to send to BNR.</p>

            <div className="border-t border-slate-100 pt-4">
              <button onClick={() => generate('internal')} disabled={!!loading}
                className="w-full bg-white text-amber-700 border-2 border-amber-300 py-2.5 rounded-xl font-semibold hover:bg-amber-50 disabled:opacity-60 text-xs flex items-center justify-center gap-2">
                {loading === 'internal'
                  ? <><span className="animate-spin inline-block">⟳</span> Generating...</>
                  : <><span>🔍</span> Download internal review copy (with notes) — {quarter}</>}
              </button>
              <p className="text-xs text-amber-600 text-center mt-1.5 font-medium">⚠ Includes flagged assumptions & known gaps for Kevin/Devotha only — never send this version to BNR.</p>
            </div>
          </>
        )}

        <p className="text-xs text-slate-400 text-center">Downloads as .xlsx — review before emailing to BNR at regulation@bnr.rw</p>
      </div>

      <FiledReports />
    </div>
  )
}
