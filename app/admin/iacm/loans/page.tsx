import { requireAdmin } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'
import LoanPortfolioTable from './LoanPortfolioTable'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
// See app/admin/layout.tsx and docs/known-gaps.md — `force-dynamic` alone
// was found not to reliably prevent a stale render (Journal page
// incident, 2026-08-22). Audited and fixed across every admin page.
export const revalidate = 0

export default async function LoanPortfolio() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  // Every loan, every status. Client-side ordering + name/loan-number search
  // live in LoanPortfolioTable (a small client component) — the portfolio is
  // tiny and already fully shipped to the browser, so a server round-trip per
  // keystroke would be pure overhead. Purely display: no filtering or sorting
  // here changes any balance, status, or payment.
  const { data: loans } = await supabase
    .from('iacm_loans')
    .select('*, iacm_clients(full_name, national_id, phone, district)')
    .order('created_at', { ascending: false })

  const all = loans ?? []

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

      <LoanPortfolioTable loans={all} />
    </div>
  )
}
