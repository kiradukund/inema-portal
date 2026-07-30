'use client'
import { useState } from 'react'

export default function DownloadButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/iacm/journal/export')
      const contentType = res.headers.get('content-type') ?? ''
      // fetch() follows redirects transparently, so an expired/invalid admin
      // session can come back as res.ok===true with the login page's HTML
      // instead of the file — that downloads as a same-named ".xlsx" that
      // Excel then reports as corrupt. Catch it here instead.
      if (!res.ok || !contentType.includes('spreadsheetml')) {
        const text = await res.text()
        try { const j = JSON.parse(text); setError(j.error ?? 'Failed to export') }
        catch { setError(contentType.includes('text/html') ? 'Session expired — please refresh and log in again' : 'Failed to export') }
        setLoading(false); return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'INEMA_Journal_Q3_2026.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to export. Try again.')
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={download} disabled={loading}
        className="bg-slate-800 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-700 disabled:opacity-60">
        {loading ? 'Exporting...' : '📥 Download Journal (.xlsx)'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
