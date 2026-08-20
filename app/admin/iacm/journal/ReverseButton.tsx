'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const LEDGER_CUTOFF_DATE = '2026-06-30'

export default function ReverseButton({ journalEntryId, entryDate }: { journalEntryId: string; entryDate: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isPreCutoff = entryDate <= LEDGER_CUTOFF_DATE

  async function submit() {
    if (!reason.trim()) { setError('A reason is required.'); return }
    if (isPreCutoff && !acknowledged) { setError('Please acknowledge the pre-cutoff note above.'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/reversals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ journal_entry_id: journalEntryId, reason, acknowledged_pre_cutoff: acknowledged }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) { setOpen(false); router.refresh() }
    else setError(data.error ?? 'Failed to reverse this entry')
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 font-semibold">
        Reverse
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !loading && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">Reverse This Entry</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              This permanently deletes the underlying record and its journal entry, and creates a permanent audit record of who reversed it and why. This cannot be undone from the app.
            </p>

            {isPreCutoff && (
              <label className="flex items-start gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
                <span>This entry is dated on or before the ledger cutoff (2026-06-30). Reversing it will NOT change any balance-sheet total, but WILL change historical income-statement/BNR report figures for that period. I understand this.</span>
              </label>
            )}

            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reason for reversal *</label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              rows={3} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Recorded against the wrong loan, real amount was different, duplicate entry..." />

            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setOpen(false)} disabled={loading}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-50 disabled:opacity-60">
                Cancel
              </button>
              <button onClick={submit} disabled={loading}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700 disabled:opacity-60">
                {loading ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
