'use client'
import { useState } from 'react'

interface Doc { type: string; label: string; uploaded_at: string; url: string | null }

export default function DocumentsButton({ applicationId, count }: { applicationId: string; count: number }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [error, setError] = useState('')

  async function openModal() {
    setOpen(true)
    if (docs) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/documents`)
      const data = await res.json()
      if (data.success) setDocs(data.data.documents)
      else setError(data.error ?? 'Failed to load documents')
    } catch {
      setError('Failed to load documents')
    }
    setLoading(false)
  }

  if (count === 0) return null

  return (
    <>
      <button onClick={openModal}
        className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-semibold">
        📎 View Documents ({count})
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">Uploaded Documents</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            {loading && <p className="text-sm text-slate-400">Loading...</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}

            {docs && docs.length === 0 && <p className="text-sm text-slate-400">No documents uploaded.</p>}

            {docs && docs.length > 0 && (
              <div className="space-y-2">
                {docs.map(d => (
                  <div key={d.type} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{d.label}</p>
                      <p className="text-xs text-slate-400">{new Date(d.uploaded_at).toLocaleDateString('en-RW')}</p>
                    </div>
                    {d.url
                      ? <a href={d.url} target="_blank" rel="noreferrer"
                          className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-semibold">Download</a>
                      : <span className="text-xs text-red-500">Unavailable</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
