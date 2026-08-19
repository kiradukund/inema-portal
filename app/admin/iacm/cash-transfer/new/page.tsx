'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewCashTransfer() {
  const router = useRouter()
  const [direction, setDirection] = useState<'withdrawal' | 'deposit'>('withdrawal')
  const [amount, setAmount] = useState('')
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function submit() {
    if (!amount || !transactionDate) { setError('Please fill in all required fields'); return }
    if (Number(amount) <= 0) { setError('Amount must be greater than 0'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/cash-transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, amount: Number(amount), transaction_date: transactionDate, notes }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setSuccess(true)
      setTimeout(() => router.push('/admin/iacm'), 1500)
    } else setError(data.error ?? 'Failed to record transfer')
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5"

  // Real accounting, confirmed by Kevin: a withdrawal moves cash OUT of
  // the bank into physical cash on hand -- Debit 3010 / Credit 3020. A
  // deposit reverses it. Zero expense-account involvement either way --
  // mirrors exactly what the API route posts.
  const preview = amount && Number(amount) > 0 ? (
    direction === 'withdrawal'
      ? { debitCode: '3010', debitName: 'Cash on Hand', creditCode: '3020', creditName: 'Bank Accounts' }
      : { debitCode: '3020', debitName: 'Bank Accounts', creditCode: '3010', creditName: 'Cash on Hand' }
  ) : null

  if (success) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <p className="text-5xl mb-4">✓</p>
        <p className="text-xl font-bold text-green-700">Cash Transfer Recorded</p>
        <p className="text-slate-500 text-sm mt-2">Redirecting to IACM home...</p>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Cash Withdrawal / Transfer</h1>
        <p className="text-slate-500 text-sm mt-1">Move money between Bank Accounts and physical Cash on Hand — this is not an expense</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div>
          <label className={labelCls}>Direction *</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDirection('withdrawal')}
              className={`py-2.5 rounded-lg text-sm font-semibold border ${direction === 'withdrawal' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              🏧 Withdrawal (Bank → Cash)
            </button>
            <button type="button" onClick={() => setDirection('deposit')}
              className={`py-2.5 rounded-lg text-sm font-semibold border ${direction === 'deposit' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              💰 Deposit (Cash → Bank)
            </button>
          </div>
        </div>

        <div>
          <label className={labelCls}>Amount (RWF) *</label>
          <input type="number" className={inputCls} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 50000" />
        </div>

        <div>
          <label className={labelCls}>Date *</label>
          <input type="date" className={inputCls} value={transactionDate} onChange={e => setTransactionDate(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>Notes (optional)</label>
          <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. cash withdrawal for KUBWIMANA Devotha" />
        </div>

        {preview && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
            <p className="font-bold text-slate-700 mb-2">Journal Preview</p>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-slate-600">Debit: {preview.debitName} ({preview.debitCode})</span><span className="font-semibold">RWF {Number(amount).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Credit: {preview.creditName} ({preview.creditCode})</span><span className="font-semibold">RWF {Number(amount).toLocaleString()}</span></div>
            </div>
          </div>
        )}

        <button onClick={submit} disabled={loading}
          className="w-full bg-amber-600 text-white py-3 rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-60 text-sm">
          {loading ? 'Recording...' : '✓ Record Transfer'}
        </button>
      </div>
    </div>
  )
}
