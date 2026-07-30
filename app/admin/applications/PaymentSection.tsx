'use client'
import { useState } from 'react'

interface Proof {
  id: string
  payment_date: string
  amount: number
  status: string
  notes: string | null
  signed_url: string | null
}

const PAYMENT_METHODS = ['Mobile Money', 'Bank Transfer', 'Cash']

export default function PaymentSection({ loanId }: { loanId: string }) {
  const [showMarkPayment, setShowMarkPayment] = useState(false)
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [showProofs, setShowProofs] = useState(false)
  const [proofsLoading, setProofsLoading] = useState(false)
  const [proofs, setProofs] = useState<Proof[] | null>(null)

  async function markPayment() {
    if (!amount || Number(amount) <= 0) { setMessage('Enter a valid amount'); return }
    setLoading(true); setMessage('')
    try {
      const res = await fetch(`/api/admin/loans/${loanId}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), payment_date: paymentDate, payment_method: paymentMethod, notes }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage('✓ ' + data.data.message)
        setShowMarkPayment(false); setAmount(''); setNotes('')
      } else setMessage('Error: ' + (data.error ?? 'Failed'))
    } catch {
      setMessage('Failed to record payment')
    }
    setLoading(false)
  }

  async function loadProofs() {
    setShowProofs(true)
    if (proofs) return
    setProofsLoading(true)
    try {
      const res = await fetch(`/api/admin/loans/${loanId}/payment-proofs`)
      const data = await res.json()
      if (data.success) setProofs(data.data.proofs)
    } catch {}
    setProofsLoading(false)
  }

  async function reviewProof(proofId: string, status: 'approved' | 'rejected') {
    await fetch(`/api/admin/payment-proofs/${proofId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setProofs(prev => prev ? prev.map(p => p.id === proofId ? { ...p, status } : p) : prev)
  }

  return (
    <div className="flex flex-col gap-1.5 items-start mt-2 pt-2 border-t border-slate-100">
      {message && <p className="text-xs text-slate-600">{message}</p>}

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setShowMarkPayment(v => !v)}
          className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100 font-semibold">
          💰 Mark Payment
        </button>
        <button onClick={loadProofs}
          className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-100 font-semibold">
          📎 View Payment Proofs
        </button>
      </div>

      {showMarkPayment && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2 w-64">
          <div>
            <label className="text-xs text-green-700">Amount Received (RWF)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full text-xs border border-green-300 rounded px-2 py-1 block mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-green-700">Payment Date</label>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
              className="w-full text-xs border border-green-300 rounded px-2 py-1 block mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-green-700">Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full text-xs border border-green-300 rounded px-2 py-1 block mt-0.5 bg-white">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-green-700">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full text-xs border border-green-300 rounded px-2 py-1 min-h-[40px] resize-none block mt-0.5" />
          </div>
          <div className="flex gap-2">
            <button onClick={markPayment} disabled={loading}
              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-semibold disabled:opacity-60">
              {loading ? 'Recording...' : 'Confirm'}
            </button>
            <button onClick={() => setShowMarkPayment(false)} className="text-xs text-green-700 hover:underline">Cancel</button>
          </div>
        </div>
      )}

      {showProofs && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 w-72">
          {proofsLoading && <p className="text-xs text-blue-600">Loading...</p>}
          {proofs && proofs.length === 0 && <p className="text-xs text-blue-600">No payment proofs uploaded yet.</p>}
          {proofs && proofs.map(p => (
            <div key={p.id} className="bg-white rounded-lg p-2 border border-blue-100">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-slate-700">RWF {Number(p.amount).toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{p.payment_date}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${
                  p.status === 'approved' ? 'bg-green-100 text-green-700' :
                  p.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {p.status}
                </span>
              </div>
              {p.notes && <p className="text-xs text-slate-500 mt-1">{p.notes}</p>}
              <div className="flex gap-2 mt-2">
                {p.signed_url && (
                  <a href={p.signed_url} target="_blank" rel="noreferrer"
                    className="text-xs bg-slate-50 text-slate-700 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100">View</a>
                )}
                {p.status === 'pending' && (
                  <>
                    <button onClick={() => reviewProof(p.id, 'approved')}
                      className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700 font-semibold">Approve</button>
                    <button onClick={() => reviewProof(p.id, 'rejected')}
                      className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-100 font-semibold">Reject</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
