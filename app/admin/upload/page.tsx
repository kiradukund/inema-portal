'use client'
import { useState } from 'react'

export default function AdminUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; stats?: Record<string, number> } | null>(null)
  const [error, setError] = useState('')

  async function handleUpload() {
    if (!file) { setError('Please select your Excel file first.'); return }
    setLoading(true); setError(''); setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/admin/upload', { method: 'POST', body: formData })
    const data = await res.json()
    setLoading(false)

    if (!data.success) { setError(data.error); return }
    setResult({ success: true, message: data.data.message, stats: data.data.stats })
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Upload Excel</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload your INEMA Excel sheet to sync all client and loan data to the dashboard.
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <p className="font-bold text-blue-800 mb-2">📋 How it works</p>
        <ol className="text-blue-700 text-sm space-y-1.5 list-decimal list-inside">
          <li>Update your Excel file as usual (add new loans, mark payments, add instalments)</li>
          <li>Save the Excel file</li>
          <li>Come here and upload it</li>
          <li>The dashboard automatically updates with all your changes</li>
        </ol>
        <p className="text-blue-600 text-xs mt-3">
          ⚠️ Upload replaces existing imported data. Your original Excel file is never modified.
        </p>
      </div>

      {/* Upload Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            file ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-amber-300'
          }`}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
        >
          {file ? (
            <div>
              <p className="text-3xl mb-3">📊</p>
              <p className="font-semibold text-slate-800">{file.name}</p>
              <p className="text-slate-400 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              <button onClick={() => setFile(null)} className="text-xs text-red-500 mt-2 hover:underline">Remove</button>
            </div>
          ) : (
            <div>
              <p className="text-4xl mb-4">📁</p>
              <p className="font-semibold text-slate-700">Drag &amp; drop your Excel file here</p>
              <p className="text-slate-400 text-sm mt-1">or click below to browse</p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm py-3 px-6 rounded-lg text-center transition-colors">
            📂 Browse Files
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
          </label>

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg text-sm transition-colors"
          >
            {loading ? '⏳ Processing...' : '🔄 Upload & Sync Dashboard'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        {result?.success && (
          <div className="mt-4 p-5 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-green-800 font-bold mb-3">✅ {result.message}</p>
            {result.stats && (
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(result.stats).map(([key, val]) => (
                  <div key={key} className="bg-white border border-green-100 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{val}</p>
                    <p className="text-xs text-slate-500 capitalize">{key.replace(/_/g, ' ')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload history */}
      <div className="mt-6 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h2 className="font-bold text-slate-800 mb-4">Upload History</h2>
        <UploadHistory />
      </div>
    </div>
  )
}

function UploadHistory() {
  return (
    <p className="text-slate-400 text-sm text-center py-4">Upload history will appear here after your first upload.</p>
  )
}
