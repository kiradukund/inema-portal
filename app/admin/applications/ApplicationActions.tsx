'use client'
import { useState } from 'react'

interface Props {
  id: string
  clientName: string
  clientPhone: string
  amount: number
  term: number
}

export default function ApplicationActions({ id, clientName, clientPhone, amount, term }: Props) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [showApprove, setShowApprove] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [approveAmount, setApproveAmount] = useState(String(amount))
  const [approveTerm, setApproveTerm] = useState(String(term))
  const [rejectNote, setRejectNote] = useState('')

  if (done) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-green-600 font-semibold">{done}</span>
        {clientPhone && (
          <a href={`https://wa.me/${clientPhone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
            className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100">
            WhatsApp
          </a>
        )}
      </div>
    )
  }

  async function approve() {
    setLoading('approve')
    const res = await fetch(`/api/admin/applications/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_amount: Number(approveAmount), approved_term_months: Number(approveTerm) }),
    })
    const data = await res.json()
    setLoading(null)
    if (data.success) {
      setDone(`✓ Approved RWF ${Number(approveAmount).toLocaleString()}`)
      setShowApprove(false)
    } else {
      alert('Error: ' + (data.error ?? 'Failed'))
    }
  }

  async function reject() {
    setLoading('reject')
    const res = await fetch(`/api/admin/applications/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_notes: rejectNote || 'Application not approved at this time.' }),
    })
    const data = await res.json()
    setLoading(null)
    if (data.success) { setDone('✗ Rejected'); setShowReject(false) }
    else alert('Error: ' + (data.error ?? 'Failed'))
  }

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      {!showApprove && !showReject && (
        <div className="flex gap-2">
          <button onClick={() => setShowApprove(true)}
            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-semibold">
            ✓ Approve
          </button>
          <button onClick={() => setShowReject(true)}
            className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 font-semibold">
            ✗ Reject
          </button>
        </div>
      )}

      {showApprove && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-bold text-green-800">Approve for {clientName}</p>
          <div className="flex gap-2">
            <div>
              <label className="text-xs text-green-700">Amount (RWF)</label>
              <input type="number" value={approveAmount} onChange={e => setApproveAmount(e.target.value)}
                className="w-28 text-xs border border-green-300 rounded px-2 py-1 block mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-green-700">Term (months)</label>
              <input type="number" min={1} max={6} value={approveTerm} onChange={e => setApproveTerm(e.target.value)}
                className="w-16 text-xs border border-green-300 rounded px-2 py-1 block mt-0.5" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={approve} disabled={loading === 'approve'}
              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-semibold disabled:opacity-60">
              {loading === 'approve' ? 'Approving...' : 'Confirm Approve'}
            </button>
            <button onClick={() => setShowApprove(false)} className="text-xs text-green-700 hover:underline">Cancel</button>
          </div>
        </div>
      )}

      {showReject && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-bold text-red-800">Reject — {clientName}</p>
          <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
            placeholder="Reason (optional)..."
            className="w-full text-xs border border-red-300 rounded px-2 py-1 min-h-[50px] resize-none" />
          <div className="flex gap-2">
            <button onClick={reject} disabled={loading === 'reject'}
              className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 font-semibold disabled:opacity-60">
              {loading === 'reject' ? 'Rejecting...' : 'Confirm Reject'}
            </button>
            <button onClick={() => setShowReject(false)} className="text-xs text-red-700 hover:underline">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
