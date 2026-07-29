'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Kept in sync with lib/ledger.ts CHART_OF_ACCOUNTS.
const ACCOUNTS = [
  { code: '3010', name: 'Cash in Vault' },
  { code: '3020', name: 'Cash at Bank' },
  { code: '3030', name: 'Interest Receivable' },
  { code: '3040', name: 'Other Receivables' },
  { code: '3050', name: 'Prepaid Expenses' },
  { code: '3060', name: 'Caution & Deposits' },
  { code: '3210', name: 'Fixed Assets (Net)' },
  { code: '4010', name: 'PAYE Payable' },
  { code: '4020', name: 'RSSB Pension Payable' },
  { code: '4030', name: 'Maternity Payable' },
  { code: '4040', name: 'CBHI Payable' },
  { code: '4050', name: 'Other Liabilities' },
  { code: '4110', name: 'Borrowings — Shareholders' },
  { code: '4120', name: 'Borrowings — Related Parties' },
  { code: '4130', name: 'Borrowings — Banks/MFIs' },
  { code: '4140', name: 'Borrowings — Other' },
  { code: '5010', name: 'Share Capital' },
  { code: '5020', name: 'Retained Earnings' },
]

type Line = { account_code: string; side: 'debit' | 'credit'; amount: string }

export default function NewJournalEntry() {
  const router = useRouter()
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState<Line[]>([
    { account_code: ACCOUNTS[0].code, side: 'debit', amount: '' },
    { account_code: ACCOUNTS[0].code, side: 'credit', amount: '' },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function updateLine(i: number, patch: Partial<Line>) {
    setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines(ls => [...ls, { account_code: ACCOUNTS[0].code, side: 'debit', amount: '' }])
  }
  function removeLine(i: number) {
    setLines(ls => ls.filter((_, idx) => idx !== i))
  }

  const totalDebit = lines.reduce((s, l) => s + (l.side === 'debit' ? Number(l.amount) || 0 : 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (l.side === 'credit' ? Number(l.amount) || 0 : 0), 0)
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01

  async function submit() {
    if (!description) { setError('Description is required'); return }
    if (!balanced) { setError('Total debits must equal total credits'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/iacm/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_date: entryDate,
        description,
        reference,
        lines: lines.map(l => ({
          account_code: l.account_code,
          debit: l.side === 'debit' ? Number(l.amount) : 0,
          credit: l.side === 'credit' ? Number(l.amount) : 0,
        })),
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) { setSuccess(true); setTimeout(() => router.push('/admin/iacm/journal'), 1200) }
    else setError(data.error ?? 'Failed to save entry')
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1"

  if (success) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <p className="text-5xl mb-4">✓</p>
        <p className="text-xl font-bold text-green-700">Journal Entry Recorded</p>
        <p className="text-slate-500 text-sm mt-2">Redirecting to Journal Entries...</p>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">New Journal Entry</h1>
        <p className="text-slate-500 text-sm mt-1">Record a balance-sheet transaction (opening balance, capital movement, borrowing, etc.)</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Date *</label>
            <input type="date" className={inputCls} value={entryDate} onChange={e => setEntryDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Reference (optional)</label>
            <input className={inputCls} value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. opening-balances-2026" />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Description *</label>
            <input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Record Q3 2026 opening cash balance" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls}>Lines * (debits must equal credits)</label>
            <button type="button" onClick={addLine} className="text-xs font-semibold text-amber-700 hover:underline">+ Add line</button>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <select className={inputCls} value={line.account_code} onChange={e => updateLine(i, { account_code: e.target.value })}>
                  {ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                </select>
                <select className={inputCls + ' max-w-[110px]'} value={line.side} onChange={e => updateLine(i, { side: e.target.value as 'debit' | 'credit' })}>
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
                <input type="number" className={inputCls + ' max-w-[160px]'} value={line.amount} onChange={e => updateLine(i, { amount: e.target.value })} placeholder="Amount" />
                {lines.length > 2 && (
                  <button type="button" onClick={() => removeLine(i)} className="text-red-500 hover:text-red-700 text-sm px-2">✕</button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3 text-xs font-semibold">
            <span className={balanced ? 'text-green-600' : 'text-red-600'}>
              Debits: {totalDebit.toLocaleString()} · Credits: {totalCredit.toLocaleString()} {balanced ? '✓ balanced' : '— must match'}
            </span>
          </div>
        </div>

        <button onClick={submit} disabled={loading || !balanced}
          className="w-full bg-amber-600 text-white py-3 rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-60 text-sm">
          {loading ? 'Saving...' : '✓ Record Journal Entry'}
        </button>
      </div>
    </div>
  )
}
