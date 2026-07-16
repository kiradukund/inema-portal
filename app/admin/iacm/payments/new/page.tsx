'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function PaymentForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedLoan = searchParams.get('loan')

  const [loans, setLoans] = useState<any[]>([])
  const [selectedLoan, setSelectedLoan] = useState(preselectedLoan ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [method, setMethod] = useState('mobile_money')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<any>(null)

  useEffect(() => {
    fetch('/api/admin/iacm/loans').then(r => r.json()).then(d => {
      if (d.success) setLoans(d.data.filter((l: any) => l.status === 'active' && Number(l.balance_outstanding) > 0))
    })
  }, [])

  useEffect(() => {
    if (selectedLoan && amount && Number(amount) > 0) {
      const loan = loans.find(l => l.id === selectedLoan)
      if (loan) {
        const outstanding = Number(loan.balance_outstanding)
        const interest = Number(loan.disbursed_amount) * 0.05
        const paid = Number(amount)
        const interestPortion = Math.min(paid, interest)
        const principalPortion = Math.max(0, paid - interestPortion)
        setPreview({ outstanding, interest, interestPortion, principalPortion, newBalance: Math.max(0, outstanding - principalPortion) })
      }
    } else setPreview(null)
  }, [selectedLoan, amount, loans])

  async function submit() {
    if (!selectedLoan || !amount || !date) { setError('Please fill all required fields'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loan_id: selectedLoan, total_amount: Number(amount), payment_date: date, payment_method: method, notes }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) { router.push('/admin/iacm/loans'); router.refresh() }
    else setError(data.error ?? 'Failed to record payment')
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const loan = loans.find(l => l.id === selectedLoan)

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Record Payment</h1>
        <p className="text-slate-500 text-sm mt-1">The system automatically splits the payment into interest and principal</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Select Loan *</label>
          <select className={inputCls} value={selectedLoan} onChange={e => setSelectedLoan(e.target.value)}>
            <option value="">-- Select client loan --</option>
            {loans.map(l => (
              <option key={l.id} value={l.id}>
                {l.iacm_clients?.full_name} — {l.loan_number} — Outstanding: RWF {Number(l.balance_outstanding).toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        {loan && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <p><span className="text-slate-500">Disbursed:</span> <strong>RWF {Number(loan.disbursed_amount).toLocaleString()}</strong></p>
            <p><span className="text-slate-500">Outstanding:</span> <strong className="text-amber-700">RWF {Number(loan.balance_outstanding).toLocaleString()}</strong></p>
            <p><span className="text-slate-500">Monthly interest (5%):</span> <strong>RWF {(Number(loan.disbursed_amount) * 0.05).toLocaleString()}</strong></p>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Amount Received (RWF) *</label>
          <input type="number" className={inputCls} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 50000" />
        </div>

        {preview && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
            <p className="font-bold text-green-800 mb-2">Payment Breakdown (auto-calculated)</p>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-slate-600">Interest portion</span><span className="font-semibold">RWF {preview.interestPortion.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Principal portion</span><span className="font-semibold">RWF {preview.principalPortion.toLocaleString()}</span></div>
              <div className="flex justify-between border-t border-green-200 pt-1 mt-1"><span className="font-semibold text-green-800">New outstanding balance</span><span className="font-bold text-green-800">RWF {preview.newBalance.toLocaleString()}</span></div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Date *</label>
          <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Method</label>
          <select className={inputCls} value={method} onChange={e => setMethod(e.target.value)}>
            <option value="mobile_money">Mobile Money (MoMo)</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cash">Cash</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Notes (optional)</label>
          <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes..." />
        </div>

        <button onClick={submit} disabled={loading}
          className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60">
          {loading ? 'Recording...' : '✓ Record Payment'}
        </button>
      </div>
    </div>
  )
}

export default function RecordPayment() {
  return <Suspense><PaymentForm /></Suspense>
}
