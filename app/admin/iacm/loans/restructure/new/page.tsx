'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { buildRestructureBreakdown, wholeMonthsBetween } from '@/lib/calculator'

const rwf = (n: number) => `RWF ${Math.round(n).toLocaleString()}`

export default function NewLoanRestructuring() {
  const router = useRouter()
  const [loans, setLoans] = useState<any[]>([])
  const [selectedLoan, setSelectedLoan] = useState('')
  const [restructureDate, setRestructureDate] = useState(new Date().toISOString().split('T')[0])
  const [maturityDate, setMaturityDate] = useState('')
  const [restructuredAmount, setRestructuredAmount] = useState('')
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
  const oldBalance = loan ? Number(loan.balance_outstanding) : 0

  // Pre-fill the agreed amount with the picked loan's outstanding balance, so
  // an untouched submit == the old behaviour. Done on selection (not an
  // effect) so staff edits are never clobbered by a re-render.
  function pickLoan(id: string) {
    setSelectedLoan(id)
    const l = loans.find(x => x.id === id)
    setRestructuredAmount(l ? String(l.balance_outstanding) : '')
  }

  const amount = Number(restructuredAmount) || 0
  const months = restructureDate && maturityDate && maturityDate > restructureDate
    ? wholeMonthsBetween(restructureDate, maturityDate)
    : 0
  const bd = amount > 0 && months > 0 ? buildRestructureBreakdown(amount, months) : null
  const delta = amount - oldBalance
  const amountDiffers = loan != null && Math.abs(delta) >= 0.01

  async function submit() {
    if (!selectedLoan || !restructureDate || !maturityDate) { setError('Please fill in all required fields'); return }
    if (!(maturityDate > restructureDate)) { setError('Maturity date must be after the restructuring date'); return }
    if (!(amount > 0)) { setError('Restructured amount must be a positive number'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/loans/restructure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        old_loan_id: selectedLoan, restructure_date: restructureDate, maturity_date: maturityDate,
        restructured_amount: restructuredAmount,
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
        <p className="text-slate-500 text-sm mt-1">Convert a defaulted loan's remaining balance into a fresh new contract — no cash moves, the debt is transferred, not paid</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div>
          <label className={labelCls}>Loan to Restructure *</label>
          <select className={inputCls} value={selectedLoan} onChange={e => pickLoan(e.target.value)}>
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
            <p><span className="text-slate-500">Original disbursed:</span> <strong>{rwf(Number(loan.disbursed_amount))}</strong></p>
            <p><span className="text-slate-500">Current outstanding balance:</span> <strong className="text-amber-700">{rwf(oldBalance)}</strong></p>
          </div>
        )}

        <div>
          <label className={labelCls}>Restructured Amount (RWF) *</label>
          <input type="number" className={inputCls} value={restructuredAmount}
            onChange={e => setRestructuredAmount(e.target.value)} placeholder="Agreed amount for the new contract" />
          <p className="text-xs text-slate-400 mt-1">Defaults to the current outstanding balance. Enter the real, agreed figure if it differs.</p>
        </div>

        {amountDiffers && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-800">
            {delta < 0 ? (
              <>The agreed amount is <strong>{rwf(Math.abs(delta))} less</strong> than the current outstanding balance ({rwf(oldBalance)}).
              This restructuring will record a <strong>principal write-down of {rwf(Math.abs(delta))}</strong> — the client will owe {rwf(amount)} on the new contract.</>
            ) : (
              <>The agreed amount is <strong>{rwf(delta)} more</strong> than the current outstanding balance ({rwf(oldBalance)}).
              This <strong>capitalises {rwf(delta)}</strong> into the new principal — the client will owe {rwf(amount)} on the new contract.</>
            )}
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

        {bd && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
            <p className="font-bold text-slate-700 mb-2">Repayment Schedule Preview <span className="font-normal text-slate-400">({bd.months} month{bd.months === 1 ? '' : 's'})</span></p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 text-left border-b border-slate-200">
                    <th className="py-1 pr-2 font-semibold">Month</th>
                    <th className="py-1 px-2 font-semibold text-right">Interest</th>
                    <th className="py-1 px-2 font-semibold text-right">Fee</th>
                    <th className="py-1 px-2 font-semibold text-right">VAT</th>
                    <th className="py-1 px-2 font-semibold text-right">Principal</th>
                    <th className="py-1 pl-2 font-semibold text-right">Total Due</th>
                  </tr>
                </thead>
                <tbody>
                  {bd.schedule.map(r => (
                    <tr key={r.month} className="border-b border-slate-100 last:border-0">
                      <td className="py-1 pr-2">{r.month}</td>
                      <td className="py-1 px-2 text-right">{Math.round(r.interest).toLocaleString()}</td>
                      <td className="py-1 px-2 text-right">{r.fee ? Math.round(r.fee).toLocaleString() : '—'}</td>
                      <td className="py-1 px-2 text-right">{r.vat ? Math.round(r.vat).toLocaleString() : '—'}</td>
                      <td className="py-1 px-2 text-right">{r.principal ? Math.round(r.principal).toLocaleString() : '—'}</td>
                      <td className="py-1 pl-2 text-right font-semibold text-slate-700">{Math.round(r.total).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300">
                    <td colSpan={5} className="py-1 pr-2 font-semibold text-slate-600">Total repayment</td>
                    <td className="py-1 pl-2 text-right font-bold text-slate-800">{rwf(bd.totalRepayment)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-2">Month 1: 5% interest + 4% fee + 18% VAT on the fee. Interior months: interest only. Final month adds the full principal.</p>
          </div>
        )}

        {bd && loan && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
            <p className="font-bold text-slate-700 mb-2">Journal Preview</p>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-slate-600">Credit: Loan Issued (3110) — old loan out</span><span className="font-semibold">{rwf(amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Debit: Loan Issued (3110) — new loan in</span><span className="font-semibold">{rwf(amount)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-600">Debit: AR — Interest and Fees (3030)</span><span className="font-semibold">{rwf(bd.fee + bd.vat)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Credit: Fees & Commission Income (7020)</span><span className="font-semibold">{rwf(bd.fee)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Credit: VAT Control Account (2530)</span><span className="font-semibold">{rwf(bd.vat)}</span></div>
            </div>
            <p className="text-xs text-slate-400 mt-2">No cash line — no new money is disbursed. Both 3110 lines post at the agreed amount, so the loan transfer nets to zero; only the fee/VAT lines move any account balance.</p>
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
