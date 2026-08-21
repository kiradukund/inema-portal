'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
]

export default function NewSalaryTransaction() {
  const router = useRouter()
  const [step, setStep] = useState<'accrual' | 'payment'>('accrual')

  // Step 1 -- Accrual
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [employeeName, setEmployeeName] = useState('')
  const [grossAmount, setGrossAmount] = useState('')
  const [payeAmount, setPayeAmount] = useState('')
  const [maternityAmount, setMaternityAmount] = useState('')
  const [pensionAmount, setPensionAmount] = useState('')
  const [cbhiAmount, setCbhiAmount] = useState('')
  const [accrualNotes, setAccrualNotes] = useState('')

  // Step 2 -- Payment
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [paymentNotes, setPaymentNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const gross = Number(grossAmount) || 0
  const paye = Number(payeAmount) || 0
  const maternity = Number(maternityAmount) || 0
  const pension = Number(pensionAmount) || 0
  const cbhi = Number(cbhiAmount) || 0
  const netPayable = gross - paye - maternity - pension - cbhi

  async function submitAccrual() {
    if (!employeeName || gross <= 0) { setError('Please fill in employee name and gross salary'); return }
    if (netPayable < 0) { setError('Deductions cannot exceed the gross salary'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/salary/accrual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expense_date: expenseDate, employee_name: employeeName, gross_amount: gross,
        paye_amount: paye, maternity_amount: maternity, pension_amount: pension, cbhi_amount: cbhi,
        notes: accrualNotes,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setSuccess('Salary Accrual Recorded')
      setTimeout(() => router.push('/admin/iacm/journal'), 1500)
    } else setError(data.error ?? 'Failed to record salary accrual')
  }

  async function submitPayment() {
    if (!paymentDate || Number(paymentAmount) <= 0) { setError('Please fill in date and amount'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/salary/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_date: paymentDate, amount: Number(paymentAmount), payment_method: paymentMethod, notes: paymentNotes }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setSuccess('Salary Payment Recorded')
      setTimeout(() => router.push('/admin/iacm/journal'), 1500)
    } else setError(data.error ?? 'Failed to record salary payment')
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5"

  if (success) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <p className="text-5xl mb-4">✓</p>
        <p className="text-xl font-bold text-green-700">{success}</p>
        <p className="text-slate-500 text-sm mt-2">Redirecting to Journal...</p>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Record Salary</h1>
        <p className="text-slate-500 text-sm mt-1">Real two-step process — accrue the gross salary and its statutory deductions when earned, then record the net payment separately when it's actually paid out</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div>
          <label className={labelCls}>Step</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setStep('accrual')}
              className={`py-2.5 rounded-lg text-sm font-semibold border ${step === 'accrual' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              1️⃣ Accrual (salary earned)
            </button>
            <button type="button" onClick={() => setStep('payment')}
              className={`py-2.5 rounded-lg text-sm font-semibold border ${step === 'payment' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              2️⃣ Payment (salary paid out)
            </button>
          </div>
        </div>

        {step === 'accrual' ? (
          <>
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" className={inputCls} value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Employee Name *</label>
              <input className={inputCls} value={employeeName} onChange={e => setEmployeeName(e.target.value)} placeholder="e.g. KUBWIMANA Devotha" />
            </div>
            <div>
              <label className={labelCls}>Gross Salary (RWF) *</label>
              <input type="number" className={inputCls} value={grossAmount} onChange={e => setGrossAmount(e.target.value)} placeholder="e.g. 541501" />
              <p className="text-xs text-slate-400 mt-1">Debit 6110 Salaries & Wages — the real full cost, reduces Net Profit.</p>
            </div>
            <div>
              <label className={labelCls}>PAYE (RWF)</label>
              <input type="number" className={inputCls} value={payeAmount} onChange={e => setPayeAmount(e.target.value)} placeholder="e.g. 114000" />
            </div>
            <div>
              <label className={labelCls}>Maternity Contribution (RWF)</label>
              <input type="number" className={inputCls} value={maternityAmount} onChange={e => setMaternityAmount(e.target.value)} placeholder="e.g. 3000" />
            </div>
            <div>
              <label className={labelCls}>Pension Contribution (RWF)</label>
              <input type="number" className={inputCls} value={pensionAmount} onChange={e => setPensionAmount(e.target.value)} placeholder="e.g. 70000" />
            </div>
            <div>
              <label className={labelCls}>CBHI (RWF)</label>
              <input type="number" className={inputCls} value={cbhiAmount} onChange={e => setCbhiAmount(e.target.value)} placeholder="e.g. 1773" />
            </div>
            <div>
              <label className={labelCls}>Notes (optional)</label>
              <input className={inputCls} value={accrualNotes} onChange={e => setAccrualNotes(e.target.value)} placeholder="e.g. Salary and wages for July 2026" />
            </div>

            {gross > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
                <p className="font-bold text-slate-700 mb-2">Journal Preview</p>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-slate-600">Debit: Salaries & Wages (6110)</span><span className="font-semibold">RWF {gross.toLocaleString()}</span></div>
                  {paye > 0 && <div className="flex justify-between"><span className="text-slate-600">Credit: PAYE Payables (2540)</span><span className="font-semibold">RWF {paye.toLocaleString()}</span></div>}
                  {maternity > 0 && <div className="flex justify-between"><span className="text-slate-600">Credit: Maternity Contribution Payables (2550)</span><span className="font-semibold">RWF {maternity.toLocaleString()}</span></div>}
                  {pension > 0 && <div className="flex justify-between"><span className="text-slate-600">Credit: Pension and Risk Contribution Payables (2560)</span><span className="font-semibold">RWF {pension.toLocaleString()}</span></div>}
                  {cbhi > 0 && <div className="flex justify-between"><span className="text-slate-600">Credit: CBHI Payables (2570)</span><span className="font-semibold">RWF {cbhi.toLocaleString()}</span></div>}
                  <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-600">Credit: Salary Payables (2580, net)</span><span className={`font-semibold ${netPayable < 0 ? 'text-red-600' : ''}`}>RWF {netPayable.toLocaleString()}</span></div>
                </div>
                {netPayable < 0 && <p className="text-xs text-red-600 mt-2">Deductions exceed gross salary — check the amounts.</p>}
              </div>
            )}

            <button onClick={() => submitAccrual()} disabled={loading}
              className="w-full bg-amber-600 text-white py-3 rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-60 text-sm">
              {loading ? 'Recording...' : '✓ Record Salary Accrual'}
            </button>
          </>
        ) : (
          <>
            <div>
              <label className={labelCls}>Payment Date *</label>
              <input type="date" className={inputCls} value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Net Amount Paid (RWF) *</label>
              <input type="number" className={inputCls} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="e.g. 352728" />
              <p className="text-xs text-slate-400 mt-1">Clears Salary Payables (2580) — this is not a new expense and does not reduce Net Profit again.</p>
            </div>
            <div>
              <label className={labelCls}>Payment Method</label>
              <select className={inputCls} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Notes (optional)</label>
              <input className={inputCls} value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="e.g. Payment of salary and wages for July 2026" />
            </div>

            {Number(paymentAmount) > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
                <p className="font-bold text-slate-700 mb-2">Journal Preview</p>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-slate-600">Debit: Salary Payables (2580)</span><span className="font-semibold">RWF {Number(paymentAmount).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Credit: {paymentMethod === 'cash' ? 'Cash on Hand (3010)' : 'Bank Accounts (3020)'}</span><span className="font-semibold">RWF {Number(paymentAmount).toLocaleString()}</span></div>
                </div>
              </div>
            )}

            <button onClick={() => submitPayment()} disabled={loading}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60 text-sm">
              {loading ? 'Recording...' : '✓ Record Salary Payment'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
