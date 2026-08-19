'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const SHAREHOLDERS = [
  { value: 'Kevin', label: 'Kevin (40%)' },
  { value: 'Genevieve', label: 'Genevieve (60%)' },
  { value: '__other__', label: 'Other' },
]

export default function NewShareholderLoanTransaction() {
  const router = useRouter()
  const [shareholder, setShareholder] = useState('Kevin')
  const [otherName, setOtherName] = useState('')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<'deposit' | 'withdrawal'>('deposit')
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const shareholderName = shareholder === '__other__' ? otherName : shareholder

  async function submit() {
    if (!shareholderName || !amount || !transactionDate) { setError('Please fill in all required fields'); return }
    if (Number(amount) <= 0) { setError('Amount must be greater than 0'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/shareholder-loan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shareholder_name: shareholderName, amount: Number(amount), direction,
        transaction_date: transactionDate, notes,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setSuccess(true)
      setTimeout(() => router.push('/admin/iacm'), 1500)
    } else setError(data.error ?? 'Failed to record transaction')
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5"

  // Real accounting, confirmed by Kevin: a deposit is cash coming in as a
  // liability owed back (not equity) -- Debit Bank / Credit Shareholders'
  // Loan. A withdrawal reverses it. Mirrors exactly what the API route
  // posts, so this can never show something different from what actually
  // gets recorded.
  const preview = amount && Number(amount) > 0 ? (
    direction === 'deposit'
      ? { debitCode: '3020', debitName: 'Bank Accounts', creditCode: '2030', creditName: "Shareholders' Loan — Long Term" }
      : { debitCode: '2030', debitName: "Shareholders' Loan — Long Term", creditCode: '3020', creditName: 'Bank Accounts' }
  ) : null

  if (success) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <p className="text-5xl mb-4">✓</p>
        <p className="text-xl font-bold text-green-700">Shareholder Loan Transaction Recorded</p>
        <p className="text-slate-500 text-sm mt-2">Redirecting to IACM home...</p>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Shareholder Loan Account</h1>
        <p className="text-slate-500 text-sm mt-1">Record a shareholder deposit or withdrawal against the Shareholders&apos; Loan account (2030)</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div>
          <label className={labelCls}>Direction *</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDirection('deposit')}
              className={`py-2.5 rounded-lg text-sm font-semibold border ${direction === 'deposit' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              💰 Deposit
            </button>
            <button type="button" onClick={() => setDirection('withdrawal')}
              className={`py-2.5 rounded-lg text-sm font-semibold border ${direction === 'withdrawal' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              🏧 Withdrawal
            </button>
          </div>
        </div>

        <div>
          <label className={labelCls}>Shareholder *</label>
          <select className={inputCls} value={shareholder} onChange={e => setShareholder(e.target.value)}>
            {SHAREHOLDERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {shareholder === '__other__' && (
            <input className={`${inputCls} mt-2`} value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="Shareholder name" />
          )}
        </div>

        <div>
          <label className={labelCls}>Amount (RWF) *</label>
          <input type="number" className={inputCls} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 500000" />
        </div>

        <div>
          <label className={labelCls}>Date *</label>
          <input type="date" className={inputCls} value={transactionDate} onChange={e => setTransactionDate(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>Notes (optional)</label>
          <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes..." />
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
          {loading ? 'Recording...' : '✓ Record Transaction'}
        </button>
      </div>
    </div>
  )
}
