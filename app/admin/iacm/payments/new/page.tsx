'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { MONTHLY_INTEREST_RATE, UPFRONT_FEE_RATE, VAT_RATE, monthsElapsed } from '@/lib/calculator'
import DuplicateWarningModal, { type DuplicateExisting } from '../../DuplicateWarningModal'

function PaymentForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedLoan = searchParams.get('loan')

  const [loans, setLoans] = useState<any[]>([])
  const [priorPayments, setPriorPayments] = useState<any[]>([])
  const [selectedLoan, setSelectedLoan] = useState(preselectedLoan ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [method, setMethod] = useState('mobile_money')
  const [notes, setNotes] = useState('')
  const [monthsOverride, setMonthsOverride] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [duplicate, setDuplicate] = useState<DuplicateExisting | null>(null)

  useEffect(() => {
    fetch('/api/admin/iacm/loans').then(r => r.json()).then(d => {
      if (d.success) setLoans(d.data.filter((l: any) => l.status === 'active' && Number(l.balance_outstanding) > 0))
    })
  }, [])

  // Real payment history for the selected loan — the same source the
  // backend now uses to figure out how many months of interest are owed
  // (never the loan's own last_payment_date field, see the API route's
  // comment on why). Refetched whenever the loan changes.
  useEffect(() => {
    if (!selectedLoan) { setPriorPayments([]); return }
    fetch(`/api/admin/iacm/payments?loan_id=${selectedLoan}`).then(r => r.json()).then(d => {
      if (d.success) setPriorPayments(d.data)
    })
  }, [selectedLoan])

  useEffect(() => {
    if (selectedLoan && amount && Number(amount) > 0 && date) {
      const loan = loans.find(l => l.id === selectedLoan)
      if (loan) {
        const outstanding = Number(loan.balance_outstanding)
        const disbursed = Number(loan.disbursed_amount)
        const lastActivityDate = priorPayments.length > 0 ? new Date(priorPayments[0].payment_date) : new Date(loan.disbursement_date)
        const isOverrideActive = Number(monthsOverride) > 0
        const months = isOverrideActive ? Number(monthsOverride) : monthsElapsed(lastActivityDate, new Date(date))
        const interestOwed = disbursed * MONTHLY_INTEREST_RATE * months
        const feeAndVatOwed = disbursed * UPFRONT_FEE_RATE * (1 + VAT_RATE)
        // Same fix as the backend route (see its comment) -- net against
        // fee already cleared by a real prior payment on this loan, so the
        // preview never shows a phantom "still owing" fee the backend
        // wouldn't actually charge.
        const feeAlreadyCleared = priorPayments.reduce((s: number, p: any) => s + Number(p.fee_portion ?? 0), 0)
        const feeRemaining = Math.max(0, feeAndVatOwed - feeAlreadyCleared)
        const maxOwed = outstanding + interestOwed + feeRemaining
        const paid = Math.min(Number(amount), maxOwed)
        // Real order, confirmed 2026-08-20 against real historical first
        // payments (Alice, Indere, Aline, Bizimana): fee/VAT FIRST, then
        // interest, then principal -- see the backend route's comment for
        // the full evidence. Mirrors it exactly so this preview never shows
        // a different split than what actually posts.
        const feePortion = Math.min(paid, feeRemaining)
        const remainderAfterFee = paid - feePortion
        const interestPortion = Math.min(remainderAfterFee, interestOwed)
        const remainderAfterInterest = remainderAfterFee - interestPortion
        const principalPortion = Math.min(outstanding, remainderAfterInterest)
        const overpaidAndCapped = Number(amount) > maxOwed
        setPreview({
          outstanding, months, isOverrideActive, lastActivityDate: lastActivityDate.toISOString().split('T')[0],
          interestOwed, interestPortion, principalPortion, feePortion, paid, overpaidAndCapped,
          newBalance: Math.max(0, outstanding - principalPortion),
        })
      }
    } else setPreview(null)
  }, [selectedLoan, amount, date, monthsOverride, loans, priorPayments])

  async function submit(confirmedDuplicate = false) {
    if (!selectedLoan || !amount || !date) { setError('Please fill all required fields'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loan_id: selectedLoan, total_amount: Number(amount), payment_date: date, payment_method: method, notes,
        ...(Number(monthsOverride) > 0 ? { interest_months: Number(monthsOverride) } : {}),
        confirmed_duplicate: confirmedDuplicate,
      }),
    })
    const data = await res.json()
    if (data.success && data.data?.possible_duplicate) {
      setDuplicate(data.data.existing)
      setLoading(false)
    } else if (data.success) {
      router.push('/admin/iacm/loans'); router.refresh()
    } else {
      setLoading(false)
      setError(data.error ?? 'Failed to record payment')
    }
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

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Date *</label>
          <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Months of Interest to Charge (optional)</label>
          <input type="number" min="1" className={inputCls} value={monthsOverride} onChange={e => setMonthsOverride(e.target.value)}
            placeholder={preview ? `Leave blank to auto-calculate (${preview.months} month${preview.months === 1 ? '' : 's'})` : 'Leave blank to auto-calculate'} />
          <p className="text-xs text-slate-400 mt-1">Auto-calculated from this loan&apos;s real payment history since {preview?.lastActivityDate ?? 'disbursement'}. Override this if you know a real multi-month catch-up is owed and the system undercounts it.</p>
        </div>

        {preview && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
            <p className="font-bold text-green-800 mb-2">Payment Breakdown</p>
            {/* Real incident, 2026-08-18 (BAHATI Eric, INEMA-2026-0005): a
                cleared/empty override silently fell back to auto-calc with
                no visible signal, and the payment was submitted believing
                a manual override was still active. This line makes the
                active mode impossible to miss right before submit. */}
            <div className={`mb-2 px-2 py-1 rounded text-xs font-bold ${preview.isOverrideActive ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-600'}`}>
              {preview.isOverrideActive ? '⚠ MANUAL OVERRIDE ACTIVE' : 'Auto-calculated (no override set)'}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-slate-600">Months of interest charged</span><span className="font-semibold">{preview.months} month{preview.months === 1 ? '' : 's'} {preview.isOverrideActive ? '(manual override)' : `(auto-calculated, since ${preview.lastActivityDate})`}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Interest owed for that period</span><span className="font-semibold">RWF {preview.interestOwed.toLocaleString()}</span></div>
              {/* Real order, confirmed 2026-08-20 against real historical
                  first payments: fee/VAT clears FIRST, then interest, then
                  principal -- shown in that order so it matches what
                  actually posts, not the old (wrong) interest-first order. */}
              {preview.feePortion > 0 && (
                <div className="flex justify-between"><span className="text-slate-600">Fee/VAT clearing</span><span className="font-semibold">RWF {preview.feePortion.toLocaleString()}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-600">Interest portion</span><span className="font-semibold">RWF {preview.interestPortion.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Principal portion</span><span className="font-semibold">RWF {preview.principalPortion.toLocaleString()}</span></div>
              <div className="flex justify-between border-t border-green-200 pt-1 mt-1"><span className="font-semibold text-green-800">New outstanding balance</span><span className="font-bold text-green-800">RWF {preview.newBalance.toLocaleString()}</span></div>
            </div>
            {preview.overpaidAndCapped && (
              <p className="mt-2 text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                ⚠ The amount entered exceeds what&apos;s owed under this calculation (RWF {preview.paid.toLocaleString()} will actually be recorded, not the full amount). If you believe more months of interest are genuinely owed, set &quot;Months of Interest to Charge&quot; above instead of relying on auto-calculation.
              </p>
            )}
          </div>
        )}

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

        <button onClick={() => submit()} disabled={loading}
          className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60">
          {loading ? 'Recording...' : '✓ Record Payment'}
        </button>
      </div>

      {duplicate && (
        <DuplicateWarningModal
          existing={duplicate}
          loading={loading}
          onCancel={() => setDuplicate(null)}
          onConfirm={() => { setDuplicate(null); submit(true) }}
        />
      )}
    </div>
  )
}

export default function RecordPayment() {
  return <Suspense><PaymentForm /></Suspense>
}
