'use client'
import { useState } from 'react'

interface Props { loanId: string; monthNumber: number; defaultAmount: number }

export default function PaymentProofUpload({ loanId, monthNumber, defaultAmount }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [amount, setAmount] = useState(String(defaultAmount))
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')

  async function submit() {
    if (!file) { setError('Please select a file'); return }
    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('amount', amount)
      fd.append('payment_date', paymentDate)
      if (notes) fd.append('notes', notes)
      const res = await fetch(`/api/loans/${loanId}/payment-proof`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) { setDone(true); setOpen(false) }
      else setError(data.error ?? 'Upload failed')
    } catch {
      setError('Upload failed. Please try again.')
    }
    setLoading(false)
  }

  if (done) return <span className="text-xs text-green-600 font-semibold">✓ Proof submitted for review</span>

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-100 font-semibold">
      📎 Upload Payment Proof
    </button>
  )

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 mt-1 max-w-xs">
      <p className="text-xs font-bold text-blue-800">Payment Proof — Month {monthNumber}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div>
        <label className="text-xs text-blue-700">File (image or PDF)</label>
        <input type="file" accept="image/jpeg,image/png,application/pdf"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-xs border border-blue-300 rounded px-2 py-1 block mt-0.5 bg-white" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-blue-700">Amount (RWF)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full text-xs border border-blue-300 rounded px-2 py-1 block mt-0.5" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-blue-700">Date</label>
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
            className="w-full text-xs border border-blue-300 rounded px-2 py-1 block mt-0.5" />
        </div>
      </div>
      <div>
        <label className="text-xs text-blue-700">Notes (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full text-xs border border-blue-300 rounded px-2 py-1 min-h-[40px] resize-none block mt-0.5" />
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={loading}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-60">
          {loading ? 'Uploading...' : 'Submit'}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-blue-700 hover:underline">Cancel</button>
      </div>
    </div>
  )
}
