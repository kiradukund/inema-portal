'use client'
import { useState, useEffect } from 'react'

interface FiledReport {
  id: string
  reporting_month: string | null
  submission_date: string
  original_filename: string
  uploaded_at: string
  download_url: string | null
}

function FiledReports() {
  const [reports, setReports] = useState<FiledReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/iacm/reports/crb/filed')
      .then(res => res.json())
      .then(json => setReports(json.data?.reports ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 mt-6">
      <p className="text-sm font-bold text-slate-700 mb-4">Filed Reports</p>
      {loading && <p className="text-xs text-slate-400">Loading…</p>}
      {!loading && reports.length === 0 && <p className="text-xs text-slate-400">No filed reports archived yet.</p>}
      <div className="space-y-2">
        {reports.map(r => (
          <div key={r.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold text-slate-700">{r.reporting_month ?? r.submission_date}</p>
              <p className="text-xs text-slate-400">Submitted {r.submission_date} · {r.original_filename}</p>
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

export default function CRBReportPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function updateThisMonth() {
    setLoading(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/admin/iacm/reports/crb', { method: 'POST' })
      const contentType = res.headers.get('content-type') ?? ''
      // Same fetch-follows-redirects trap already fixed on the BNR page:
      // an expired session comes back res.ok===true with the login page's
      // HTML instead of the file, which would otherwise download as a
      // same-named ".xls" that Excel reports as corrupt.
      if (!res.ok || contentType.includes('text/html')) {
        const text = await res.text()
        try { const j = JSON.parse(text); setError(j.error ?? 'Failed') }
        catch { setError(contentType.includes('text/html') ? 'Session expired — please refresh and log in again' : 'Failed to update report') }
        setLoading(false); return
      }
      const loanCount = res.headers.get('x-loan-count') ?? '?'
      // Read the real filename off Content-Disposition instead of
      // constructing one here — the server (lib/crb-report.ts) is the
      // single source of truth for the CRBTTYYYYMMDDVVV.BBB.xls pattern,
      // so this can't silently drift out of sync with it.
      const disposition = res.headers.get('content-disposition') ?? ''
      const nameMatch = /filename="([^"]+)"/.exec(disposition)
      const filename = nameMatch ? nameMatch[1] : 'CRB_Report.xls'
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setSuccess(`✓ Updated — ${loanCount} currently-outstanding loan(s) written into the real Consumer sheet structure. Review before submitting.`)
    } catch (e) { setError('Failed to update. Try again.') }
    setLoading(false)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">CRB Monthly Report</h1>
        <p className="text-slate-500 text-sm mt-1">Fill the real Credit Reference Bureau file with this month&apos;s client data — not a new document, the same real .xls structure, refilled.</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-6">
        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">What this does</p>
          <ul className="text-xs text-slate-600 space-y-1.5">
            <li>• Loads the most recently archived real CRB .xls as its structure — 74-column Consumer sheet plus the 6 other real sheets (Corporate, Shareholders, Directors, Collateral, Guarantors, Bounced Cheques), left byte-identical.</li>
            <li>• Clears the Consumer sheet&apos;s data rows and refills them with every client whose loan currently has a balance outstanding — a fresh snapshot, not a running total. Clients who&apos;ve fully repaid drop off automatically.</li>
            <li>• Assigns a permanent Account Number (IFS####) the first time a client is ever included.</li>
            <li>• Computes real Days in Arrears / Amount Past Due / Classification from each loan&apos;s maturity date and balance — not defaulted to Normal/0.</li>
          </ul>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-xs font-bold text-amber-700 mb-2">⚠️ Left genuinely blank — no live data source</p>
          <p className="text-xs text-amber-700">Nature, Category, Sector of Activity, Employer/Income/Occupation, Nationality, Date of Birth, Salutation, and several other identity/contact fields the system doesn&apos;t currently track. See docs/known-gaps.md for the full list. Confirm these with Devotha or the CRB guide before submitting.</p>
        </div>

        <button onClick={updateThisMonth} disabled={loading}
          className="w-full bg-green-700 text-white py-3.5 rounded-xl font-bold hover:bg-green-800 disabled:opacity-60 text-sm flex items-center justify-center gap-2">
          {loading
            ? <><span className="animate-spin inline-block">⟳</span> Updating...</>
            : <><span>📝</span> Update This Month&apos;s CRB Report</>}
        </button>
        <p className="text-xs text-slate-400 text-center -mt-3">Downloads as .xls. Review it, then archive the copy you actually submit via the Filed Reports process.</p>
      </div>

      <FiledReports />
    </div>
  )
}
