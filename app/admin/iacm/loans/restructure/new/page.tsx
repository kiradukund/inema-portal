'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const UPFRONT_FEE_RATE = 0.04
const VAT_RATE = 0.18

export default function NewLoanRestructuring() {
  const router = useRouter()
  const [loans, setLoans] = useState<any[]>([])
  const [selectedLoan, setSelectedLoan] = useState('')
  const [restructureDate, setRestructureDate] = useState(new Date().toISOString().split('T')[0])
  const [maturityDate, setMaturityDate] = useState('')
  const [purpose, setPurpose] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ loan_number: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/iacm/loans').then(r => r.json()).then(d => {
      if (d.success) setLoans(d.data.filter((l: any) => l.status === 'active' && Number(l.balance_outstanding) > 0))
    })
  }, [])

  const loan = loans.find(l => l.id === selectedLoan)
  const remainingPrincipal = loan ? Number(loan.balance_outstanding) : 0
  const fee = remainingPrincipal * UPFRONT_FEE_RATE
  const vat = fee * VAT_RATE

  async function submit() {
    if (!selectedLoan || !restructureDate || !maturityDate) { setError('Please fill in all required fields'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/loans/restructure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        old_loan_id: selectedLoan, restructure_date: restructureDate, maturity_date: maturityDate,
        purpose: purpose || undefined,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setSuccess({ loan_number: data.data.new_loan_number })
      setTimeout(() => router.push('/admin/iacm/loans'), 2000)
    } else setError(data.error ?? 'Failed to restructure loan')
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5"

  if (success) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <p className="text-5xl mb-4">✓</p>
        <p className="text-xl font-bold text-green-700">Loan Restructured</p>
        <p className="text-slate-500 text-sm mt-2">New contract {success.loan_number} created. Redirecting to Loan Portfolio...</p>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Loan Restructuring / Rollover</h1>
        <p className="text-slate-500 text-sm mt-1">Convert a defaulted loan's real remaining balance into a fresh new contract — no cash moves, the debt is transferred, not paid</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div>
          <label className={labelCls}>Loan to Restructure *</label>
          <select className={inputCls} value={selectedLoan} onChange={e => setSelectedLoan(e.target.value)}>
            <option value="">-- Select active loan --</option>
            {loans.map(l => (
              <option key={l.id} value={l.id}>
                {l.iacm_clients?.full_name} — {l.loan_number} — Outstanding: RWF {Number(l.balance_outstanding).toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        {loan && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <p><span className="text-slate-500">Original disbursed:</span> <strong>RWF {Number(loan.disbursed_amount).toLocaleString()}</strong></p>
            <p><span className="text-slate-500">Real remaining balance (defaulted):</span> <strong className="text-amber-700">RWF {remainingPrincipal.toLocaleString()}</strong></p>
          </div>
        )}

        <div>
          <label className={labelCls}>Restructuring Date *</label>
          <input type="date" className={inputCls} value={restructureDate} onChange={e => setRestructureDate(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>New Loan Maturity Date *</label>
          <input type="date" className={inputCls} value={maturityDate} onChange={e => setMaturityDate(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>Purpose (optional)</label>
          <input className={inputCls} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder={loan ? `Default: "Restructured from ${loan.loan_number}"` : 'e.g. Restructured from INEMA-2026-0005'} />
        </div>

        {loan && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
            <p className="font-bold text-slate-700 mb-2">Journal Preview</p>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-slate-600">Credit: Loan Issued (3110) — old loan out</span><span className="font-semibold">RWF {remainingPrincipal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Debit: Loan Issued (3110) — new loan in</span><span className="font-semibold">RWF {remainingPrincipal.toLocaleString()}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-600">Debit: AR — Interest and Fees (3030)</span><span className="font-semibold">RWF {(fee + vat).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Credit: Fees & Commission Income (7020)</span><span className="font-semibold">RWF {fee.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Credit: VAT Control Account (2530)</span><span className="font-semibold">RWF {vat.toLocaleString()}</span></div>
            </div>
            <p className="text-xs text-slate-400 mt-2">No cash line — no new money is disbursed. Only the fee/VAT lines are a real effect on any account balance; the loan transfer itself nets to zero.</p>
          </div>
        )}

        <button onClick={() => submit()} disabled={loading || !selectedLoan}
          className="w-full bg-amber-600 text-white py-3 rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-60 text-sm">
          {loading ? 'Restructuring...' : '✓ Restructure Loan'}
        </button>
      </div>
    </div>
  )
}
