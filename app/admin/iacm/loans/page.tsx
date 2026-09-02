import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getDaysOverdue, classifyByDays, BNR_CLASS_LABEL, type BnrClass } from '@/lib/calculator'
import RecalcButton from './RecalcButton'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
// See app/admin/layout.tsx and docs/known-gaps.md — `force-dynamic` alone
// was found not to reliably prevent a stale render (Journal page
// incident, 2026-08-22). Audited and fixed across every admin page.
export const revalidate = 0

export default async function LoanPortfolio() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  const { data: loans } = await supabase
    .from('iacm_loans')
    .select('*, iacm_clients(full_name, national_id, phone, district)')
    .order('created_at', { ascending: false })

  const all = loans ?? []
  const today = new Date()

  // Day-boundary rule comes from the single shared classifyByDays() in
  // lib/calculator.ts (Normal 0-29 / Watch 30-89 / Substandard 90-179 /
  // Doubtful 180-359 / Loss 360+). This page had its own copy that never got
  // the 2026-08-23 fix — any loan 1-29 days overdue showed "Watch" here while
  // the dashboard chart and CRB generator correctly showed "Normal".
  const BNR_CLASS_BADGE: Record<BnrClass, string> = {
    1: 'bg-green-100 text-green-700',
    2: 'bg-amber-100 text-amber-700',
    3: 'bg-orange-100 text-orange-700',
    4: 'bg-red-100 text-red-700',
    5: 'bg-red-200 text-red-900',
  }
  function getBNRClass(maturityDate: string, balance: number) {
    if (balance <= 0) return { label: 'Completed', color: 'bg-blue-100 text-blue-700' }
    const cls = classifyByDays(getDaysOverdue(maturityDate, balance, today))
    return { label: BNR_CLASS_LABEL[cls], color: BNR_CLASS_BADGE[cls] }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Loan Portfolio</h1>
          <p className="text-slate-500 text-sm mt-1">{all.length} total loans</p>
        </div>
        <Link href="/admin/iacm/loans/new" className="bg-amber-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-amber-700">
          + Record New Loan
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Loan #','Client','NID','Phone','Type','Disbursed','Outstanding','Maturity','Classification','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {all.map((l: any) => {
                const cls = getBNRClass(l.maturity_date, Number(l.balance_outstanding))
                return (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.loan_number}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{l.iacm_clients?.full_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{l.iacm_clients?.national_id}</td>
                    <td className="px-4 py-3 text-slate-600">{l.iacm_clients?.phone}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{l.loan_type}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">{formatRWF(l.disbursed_amount)}</td>
                    <td className="px-4 py-3 font-semibold text-amber-700 whitespace-nowrap">{formatRWF(l.balance_outstanding)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(l.maturity_date).toLocaleDateString('en-RW')}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${cls.color}`}>{cls.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link href={`/admin/iacm/payments/new?loan=${l.id}`}
                          className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100 font-semibold">
                          Record Payment
                        </Link>
                        <a href={`https://wa.me/${l.iacm_clients?.phone?.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
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
    </div>
  )
}
