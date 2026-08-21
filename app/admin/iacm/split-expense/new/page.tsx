'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
]

export default function NewSplitExpense() {
  const router = useRouter()
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [currentAmount, setCurrentAmount] = useState('')
  const [prepaidAmount, setPrepaidAmount] = useState('')
  const [vatAmount, setVatAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const current = Number(currentAmount) || 0
  const prepaid = Number(prepaidAmount) || 0
  const vat = Number(vatAmount) || 0
  const total = current + prepaid + vat

  async function submit() {
    if (!expenseDate) { setError('Please fill in all required fields'); return }
    if (current <= 0) { setError('Current-period amount must be greater than 0'); return }
    if (prepaid < 0 || vat < 0) { setError('Amounts cannot be negative'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/split-expense', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expense_date: expenseDate, current_period_amount: current, prepaid_amount: prepaid,
        vat_amount: vat, payment_method: paymentMethod, notes,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setSuccess(true)
      setTimeout(() => router.push('/admin/iacm/journal'), 1500)
    } else setError(data.error ?? 'Failed to record split expense')
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5"
  const cashAccountName = paymentMethod === 'cash' ? 'Cash on Hand (3010)' : 'Bank Accounts (3020)'

  if (success) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <p className="text-5xl mb-4">✓</p>
        <p className="text-xl font-bold text-green-700">Split Expense Recorded</p>
        <p className="text-slate-500 text-sm mt-2">Redirecting to Journal...</p>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Split Expense (Prepaid + Current + VAT)</h1>
        <p className="text-slate-500 text-sm mt-1">For a single payment that covers a current-period expense, a future-period prepayment, and VAT — e.g. rent covering two months in one payment</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div>
          <label className={labelCls}>Payment Date *</label>
          <input type="date" className={inputCls} value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>Current-Period Amount (RWF) *</label>
          <input type="number" className={inputCls} value={currentAmount} onChange={e => setCurrentAmount(e.target.value)} placeholder="e.g. 211865" />
          <p className="text-xs text-slate-400 mt-1">The real expense recognized this period — Debit 6210 Office Rent. This is the only part that reduces Net Profit.</p>
        </div>

        <div>
          <label className={labelCls}>Prepaid (Future-Period) Amount (RWF)</label>
          <input type="number" className={inputCls} value={prepaidAmount} onChange={e => setPrepaidAmount(e.target.value)} placeholder="e.g. 211864" />
          <p className="text-xs text-slate-400 mt-1">Paid in advance for a future period — Debit 3050 Prepaid Expenses. Not an expense yet.</p>
        </div>

        <div>
          <label className={labelCls}>VAT Amount (RWF)</label>
          <input type="number" className={inputCls} value={vatAmount} onChange={e => setVatAmount(e.target.value)} placeholder="e.g. 76271" />
          <p className="text-xs text-slate-400 mt-1">Debit 2530 VAT Control Account.</p>
        </div>

        <div>
          <label className={labelCls}>Payment Method</label>
          <select className={inputCls} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Notes (optional)</label>
          <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Office rent — July (current) and August (prepaid)" />
        </div>

        {total > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
            <p className="font-bold text-slate-700 mb-2">Journal Preview</p>
            <div className="space-y-1">
              {prepaid > 0 && <div className="flex justify-between"><span className="text-slate-600">Debit: Prepaid Expenses (3050)</span><span className="font-semibold">RWF {prepaid.toLocaleString()}</span></div>}
              {current > 0 && <div className="flex justify-between"><span className="text-slate-600">Debit: Office Rent (6210)</span><span className="font-semibold">RWF {current.toLocaleString()}</span></div>}
              {vat > 0 && <div className="flex justify-between"><span className="text-slate-600">Debit: VAT Control Account (2530)</span><span className="font-semibold">RWF {vat.toLocaleString()}</span></div>}
              <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-600">Credit: {cashAccountName}</span><span className="font-semibold">RWF {total.toLocaleString()}</span></div>
            </div>
          </div>
        )}

        <button onClick={submit} disabled={loading}
          className="w-full bg-amber-600 text-white py-3 rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-60 text-sm">
          {loading ? 'Recording...' : '✓ Record Split Expense'}
        </button>
      </div>
    </div>
  )
}
