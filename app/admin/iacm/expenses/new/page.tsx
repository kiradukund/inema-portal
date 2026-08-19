'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Real evidence, 2026-08-19: PAYE/CBHI/Pension/Maternity previously had no
// category of their own -- the old 'tax' option ("Tax Payments (PAYE, RSSB,
// CBHI)") silently routed all of them into the generic 2640 Tax Payable
// account, even though Devotha's real historical bookkeeping always used
// their own distinct codes (2540/2550/2560/2570). See docs/known-gaps.md.
const CATEGORIES = [
  { value: 'personnel', label: 'Personnel Expenses (Salaries)' },
  { value: 'rent', label: 'Rent & Utilities' },
  { value: 'bank_charges', label: 'Bank Charges & Commissions' },
  { value: 'communication', label: 'Communication & Internet' },
  { value: 'stationery', label: 'Office Stationery & Supplies' },
  { value: 'transport', label: 'Transport & Travel' },
  { value: 'advertising', label: 'Advertising & Marketing' },
  { value: 'legal', label: 'Legal & Professional Fees' },
  { value: 'maintenance', label: 'Maintenance & Repairs' },
  { value: 'petty_cash', label: 'Petty Cash / Miscellaneous' },
  { value: 'paye', label: 'PAYE Payables' },
  { value: 'cbhi', label: 'CBHI Payables' },
  { value: 'pension', label: 'Pension and Risk Contribution Payables' },
  { value: 'maternity', label: 'Maternity Contribution Payables' },
  { value: 'wht', label: 'Withholding Tax (WHT) Payables' },
  { value: 'tax', label: 'Corporate Income Tax' },
  { value: 'depreciation', label: 'Depreciation' },
  { value: 'other', label: 'Other Operating Expenses' },
]

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'Mobile Money (MoMo)' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
]

export default function NewExpense() {
  const router = useRouter()
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    category: 'personnel',
    description: '',
    amount: '',
    payment_method: 'bank_transfer',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function submit() {
    if (!form.description || !form.amount || !form.expense_date) {
      setError('Please fill in all required fields'); return
    }
    if (Number(form.amount) <= 0) { setError('Amount must be greater than 0'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setSuccess(true)
      setTimeout(() => router.push('/admin/iacm'), 1500)
    } else setError(data.error ?? 'Failed to save expense')
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5"

  if (success) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <p className="text-5xl mb-4">✓</p>
        <p className="text-xl font-bold text-green-700">Expense Recorded</p>
        <p className="text-slate-500 text-sm mt-2">Redirecting to IACM home...</p>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Record Expense</h1>
        <p className="text-slate-500 text-sm mt-1">Enter operational expenses for the business</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div>
          <label className={labelCls}>Date *</label>
          <input type="date" className={inputCls} value={form.expense_date} onChange={e => set('expense_date', e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>Category *</label>
          <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Description *</label>
          <input className={inputCls} value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="e.g. Salaries for June 2026, Rent for Nyakabanda office..." />
        </div>

        <div>
          <label className={labelCls}>Amount (RWF) *</label>
          <input type="number" className={inputCls} value={form.amount} onChange={e => set('amount', e.target.value)}
            placeholder="e.g. 541501" />
        </div>

        <div>
          <label className={labelCls}>Payment Method</label>
          <select className={inputCls} value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <button onClick={submit} disabled={loading}
          className="w-full bg-amber-600 text-white py-3 rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-60 text-sm">
          {loading ? 'Recording...' : '✓ Record Expense'}
        </button>
      </div>
    </div>
  )
}
