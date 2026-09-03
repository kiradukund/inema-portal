'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { getDaysOverdue, classifyByDays, BNR_CLASS_LABEL, type BnrClass } from '@/lib/calculator'
import RecalcButton from './RecalcButton'

// Local money formatter — matches lib/admin.ts's formatRWF() exactly
// ('RWF ' + Math.round(n).toLocaleString('en-RW')). Not imported from
// @/lib/admin because that module pulls the server-only next/headers chain.
const money = (n: any) => 'RWF ' + Math.round(Number(n) || 0).toLocaleString('en-RW')

const BNR_CLASS_BADGE: Record<BnrClass, string> = {
  1: 'bg-green-100 text-green-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-orange-100 text-orange-700',
  4: 'bg-red-100 text-red-700',
  5: 'bg-red-200 text-red-900',
}

// 'restructured' and 'completed' are genuinely different real states —
// kept as distinct badges. Any other (active) loan gets its day-count
// classification from the shared classifyByDays() (same rule as BNR/CRB).
function loanBadge(status: string, maturityDate: string, balance: number, today: Date) {
  if (status === 'restructured') return { label: 'Restructured', color: 'bg-violet-100 text-violet-700' }
  if (status === 'completed' || balance <= 0) return { label: 'Completed', color: 'bg-blue-100 text-blue-700' }
  const cls = classifyByDays(getDaysOverdue(maturityDate, balance, today))
  return { label: BNR_CLASS_LABEL[cls], color: BNR_CLASS_BADGE[cls] }
}

// Ordering tiers: Active (0, top) → Restructured (1) → Completed / other (2, bottom).
function tier(status: string): number {
  if (status === 'active') return 0
  if (status === 'restructured') return 1
  return 2
}

const COLS = ['Loan #', 'Client', 'NID', 'Phone', 'Type', 'Disbursed', 'Outstanding', 'Maturity', 'Classification', 'Actions']

export default function LoanPortfolioTable({ loans }: { loans: any[] }) {
  const [query, setQuery] = useState('')
  const today = useMemo(() => new Date(), [])

  // Sort a copy — never mutate the prop. Active block: most overdue first,
  // tie-broken by soonest maturity. Restructured/Completed block: newest first.
  const sorted = useMemo(() => {
    return [...loans].sort((a, b) => {
      const t = tier(a.status) - tier(b.status)
      if (t !== 0) return t
      if (tier(a.status) === 0) {
        const da = getDaysOverdue(a.maturity_date, Number(a.balance_outstanding), today)
        const db = getDaysOverdue(b.maturity_date, Number(b.balance_outstanding), today)
        if (db !== da) return db - da
        return String(a.maturity_date).localeCompare(String(b.maturity_date))
      }
      return String(b.created_at).localeCompare(String(a.created_at))
    })
  }, [loans, today])

  const q = query.trim().toLowerCase()
  const rows = q
    ? sorted.filter(l =>
        (l.iacm_clients?.full_name ?? '').toLowerCase().includes(q) ||
        (l.loan_number ?? '').toLowerCase().includes(q))
    : sorted

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by client name or loan number…"
          className="flex-1 min-w-[240px] border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <span className="text-xs text-slate-400 whitespace-nowrap">Showing {rows.length} of {loans.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {COLS.map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={COLS.length} className="px-4 py-12 text-center text-sm text-slate-400">No loans match “{query}”.</td></tr>
            )}
            {rows.map((l: any) => {
              const badge = loanBadge(l.status, l.maturity_date, Number(l.balance_outstanding), today)
              return (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.loan_number}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{l.iacm_clients?.full_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{l.iacm_clients?.national_id}</td>
                  <td className="px-4 py-3 text-slate-600">{l.iacm_clients?.phone}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{l.loan_type}</td>
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">{money(l.disbursed_amount)}</td>
                  <td className="px-4 py-3 font-semibold text-amber-700 whitespace-nowrap">{money(l.balance_outstanding)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(l.maturity_date).toLocaleDateString('en-RW')}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badge.color}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link href={`/admin/iacm/payments/new?loan=${l.id}`}
                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100 font-semibold">
                        Record Payment
                      </Link>
                      <a href={`https://wa.me/${l.iacm_clients?.phone?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        className="text-xs bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100">
                        WhatsApp
                      </a>
                      <RecalcButton loanId={l.id} loanNumber={l.loan_number} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
