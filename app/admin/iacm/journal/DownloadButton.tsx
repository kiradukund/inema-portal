'use client'
import { useState } from 'react'

export default function DownloadButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/iacm/journal/export')
      if (!res.ok) {
        const text = await res.text()
        try { const j = JSON.parse(text); setError(j.error ?? 'Failed to export') }
        catch { setError('Failed to export') }
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
