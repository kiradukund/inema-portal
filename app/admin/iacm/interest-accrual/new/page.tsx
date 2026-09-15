'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface AccrualRow {
  loanId: string
  loanNumber: string
  clientName: string
  periodStart: string
  periodEnd: string
  months: number
  balanceAtAccrual: number
  monthlyRate: number
  interestAmount: number
  included: boolean
}

export default function NewInterestAccrual() {
  const router = useRouter()
  const [asOf, setAsOf] = useState(new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<AccrualRow[] | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ posted_count: number; failed_count: number; failed: { loanNumber: string; error: string }[] } | null>(null)

  async function loadPreview() {
    setLoadingPreview(true); setError(''); setResult(null)
    try {
      const res = await fetch(`/api/admin/iacm/interest-accrual/preview?as_of=${asOf}`)
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Failed to load preview'); setRows(null); return }
      setRows((data.data.accruals ?? []).map((a: any) => ({
        loanId: a.loanId, loanNumber: a.loanNumber, clientName: a.clientName,
        periodStart: a.periodStart, periodEnd: a.periodEnd, months: a.months,
        balanceAtAccrual: a.balanceAtAccrual, monthlyRate: a.monthlyRate,
        interestAmount: a.interestAmount, included: true,
      })))
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load preview')
    } finally {
      setLoadingPreview(false)
    }
  }

  function toggleIncluded(loanId: string) {
    setRows(prev => prev?.map(r => r.loanId === loanId ? { ...r, included: !r.included } : r) ?? null)
  }

  function overrideAmount(loanId: string, value: string) {
    const num = Number(value)
    setRows(prev => prev?.map(r => r.loanId === loanId ? { ...r, interestAmount: Number.isFinite(num) ? num : r.interestAmount } : r) ?? null)
  }

  const includedRows = rows?.filter(r => r.included) ?? []
  const total = includedRows.reduce((s, r) => s + r.interestAmount, 0)

  async function confirm() {
    if (includedRows.length === 0) { setError('No loans included — nothing to post'); return }
    setConfirming(true); setError('')
    try {
      const res = await fetch('/api/admin/iacm/interest-accrual/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accruals: includedRows.map(r => ({
            loanId: r.loanId, loanNumber: r.loanNumber, clientName: r.clientName,
            periodStart: r.periodStart, periodEnd: r.periodEnd, months: r.months,
            balanceAtAccrual: r.balanceAtAccrual, monthlyRate: r.monthlyRate, interestAmount: r.interestAmount,
          })),
        }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Failed to post accruals'); return }
      setResult(data.data)
      if (data.data.failed_count === 0) {
        setTimeout(() => router.push('/admin/iacm/journal'), 2000)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to post accruals')
    } finally {
      setConfirming(false)
    }
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5"

  if (result && result.failed_count === 0) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <p className="text-5xl mb-4">✓</p>
        <p className="text-xl font-bold text-green-700">{result.posted_count} Interest Accrual{result.posted_count === 1 ? '' : 's'} Posted</p>
        <p className="text-slate-500 text-sm mt-2">Redirecting to Journal...</p>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Interest Accrual</h1>
        <p className="text-slate-500 text-sm mt-1">
          Calculates real, per-loan interest accrued since each loan&apos;s last payment (or disbursement) up to the date below — the same real, itemized detail previously kept only in the hand-maintained &ldquo;Interest Calculations&rdquo; sheet. Nothing is posted until you review and confirm below.
        </p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {result && result.failed_count > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <p className="font-bold text-amber-800 mb-2">{result.posted_count} posted, {result.failed_count} failed</p>
          <ul className="space-y-1 text-amber-700">
            {result.failed.map((f, i) => <li key={i}>Loan {f.loanNumber}: {f.error}</li>)}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5 mb-6">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className={labelCls}>As Of Date</label>
            <input type="date" className={inputCls} value={asOf} onChange={e => setAsOf(e.target.value)} />
          </div>
          <button onClick={loadPreview} disabled={loadingPreview}
            className="bg-slate-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-60 whitespace-nowrap">
            {loadingPreview ? 'Calculating...' : 'Calculate Accruals'}
          </button>
        </div>
      </div>

      {rows && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No active loans have any real interest accrued as of this date.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Include</th>
                  <th className="text-left px-4 py-3">Client / Loan</th>
                  <th className="text-left px-4 py-3">Period</th>
                  <th className="text-right px-4 py-3">Months</th>
                  <th className="text-right px-4 py-3">Balance</th>
                  <th className="text-right px-4 py-3">Rate</th>
                  <th className="text-right px-4 py-3">Interest (RWF)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.loanId} className={`border-t border-slate-100 ${r.included ? '' : 'opacity-40'}`}>
                    <td className="px-4 py-3"><input type="checkbox" checked={r.included} onChange={() => toggleIncluded(r.loanId)} /></td>
                    <td className="px-4 py-3">{r.clientName}<br /><span className="text-xs text-slate-400">{r.loanNumber}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.periodStart} → {r.periodEnd}</td>
                    <td className="px-4 py-3 text-right">{r.months}</td>
                    <td className="px-4 py-3 text-right">{r.balanceAtAccrual.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{(r.monthlyRate * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right">
                      <input type="number" className="w-28 border border-slate-200 rounded px-2 py-1 text-right text-sm"
                        value={r.interestAmount} disabled={!r.included} onChange={e => overrideAmount(r.loanId, e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-bold">
                  <td colSpan={6} className="px-4 py-3 text-right">Total to Post</td>
                  <td className="px-4 py-3 text-right">{total.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {rows && rows.length > 0 && (
        <button onClick={confirm} disabled={confirming || includedRows.length === 0}
          className="w-full bg-amber-600 text-white py-3 rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-60 text-sm">
          {confirming ? 'Posting...' : `✓ Confirm & Post ${includedRows.length} Accrual${includedRows.length === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  )
}
