'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const FIELD_LABEL: Record<string, string> = {
  balance_outstanding: 'Outstanding balance',
  principal_repaid: 'Principal repaid',
  status: 'Status',
  installments_paid: 'Installments paid',
  installments_outstanding: 'Installments outstanding',
  last_payment_date: 'Last payment date',
}

export default function RecalcButton({ loanId, loanNumber }: { loanId: string; loanNumber: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<null | { before: any; after: any; changed: boolean }>(null)

  async function submit() {
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/loans/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loan_id: loanId, reason }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) { setResult(data.data); router.refresh() }
    else setError(data.error ?? 'Failed to recalculate this loan')
  }

  const rows = result
    ? Object.keys(FIELD_LABEL).filter(f => String(result.before[f]) !== String(result.after[f]))
    : []

  return (
    <>
      <button onClick={() => { setOpen(true); setResult(null); setError(''); setReason('') }}
        className="text-xs bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100 font-semibold"
        title="Re-derive this loan's balance and counters from its real payments">
        ⟳ Recalc
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !loading && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">Recalculate {loanNumber} from payments</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            {!result && (
              <>
                <p className="text-sm text-slate-600 mb-4">
                  Re-derives this loan&apos;s outstanding balance, principal repaid, status and
                  installment counters from its <strong>real recorded payments</strong> — it does not
                  change any payment or journal entry. Safe to run any time. Every use is logged
                  (who, when, before &amp; after).
                </p>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reason (optional)</label>
                <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 mb-4"
                  rows={2} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="e.g. balance looked wrong after reversing a restructuring" />
                {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setOpen(false)} disabled={loading}
                    className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-50 disabled:opacity-60">
                    Cancel
                  </button>
                  <button onClick={submit} disabled={loading}
                    className="flex-1 bg-slate-700 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-800 disabled:opacity-60">
                    {loading ? 'Recalculating…' : 'Recalculate'}
                  </button>
                </div>
              </>
            )}

            {result && (
              <>
                {!result.changed ? (
                  <p className="text-sm text-green-700 mb-4">✓ Already consistent — nothing changed. The loan already matches its real payments.</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-700 mb-3">Corrected {rows.length} field{rows.length === 1 ? '' : 's'}:</p>
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 mb-4 text-sm">
                      {rows.map(f => (
                        <div key={f} className="px-3 py-2">
                          <div className="text-xs font-semibold text-slate-500">{FIELD_LABEL[f]}</div>
                          <div className="font-mono text-xs">
                            <span className="text-red-600 line-through">{String(result.before[f])}</span>
                            {' → '}
                            <span className="text-green-700 font-semibold">{String(result.after[f])}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <button onClick={() => setOpen(false)}
                  className="w-full bg-slate-700 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-800">
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
