import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatRWF } from '@/lib/calculator'

function RepaymentBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'badge-paid', overdue: 'badge-overdue',
    due: 'badge-pending', upcoming: 'badge-upcoming',
  }
  return <span className={map[status] ?? 'badge-upcoming'}>{status}</span>
}

export default async function LoanDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: loan } = await supabase
    .from('loans')
    .select('*, repayment_schedules(*)')
    .eq('id', params.id)
    .eq('client_id', user.id)
    .single()

  if (!loan) notFound()

  const schedule = (loan.repayment_schedules ?? []).sort(
    (a: { month_number: number }, b: { month_number: number }) => a.month_number - b.month_number
  )

  const totalPaid = schedule.reduce((s: number, r: { amount_paid: number }) => s + (r.amount_paid ?? 0), 0)
  const totalRemaining = loan.total_repayment - totalPaid
  const pct = Math.round((totalPaid / loan.total_repayment) * 100)
  const isOverdue = schedule.some((r: { status: string }) => r.status === 'overdue')

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <Link href="/loans" className="text-sm text-slate-500 hover:text-amber-600 flex items-center gap-1 mb-6">
        ← Back to Loans
      </Link>

      {/* Header */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 capitalize">
              {loan.loan_type.replace('_', ' ')} Loan
            </h1>
            <p className="text-slate-400 text-sm mt-1">{loan.loan_number}</p>
          </div>
          <div className="text-right">
            <span className={
              loan.status === 'active' || loan.status === 'disbursed' ? 'badge-active' :
              loan.status === 'completed' ? 'badge-completed' : 'badge-overdue'
            }>{loan.status}</span>
            {isOverdue && <p className="text-red-600 text-xs font-semibold mt-1">⚠ Has overdue payments</p>}
          </div>
        </div>

        {/* Progress */}
        <div className="mt-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-500">Repayment Progress</span>
            <span className="font-semibold text-slate-700">{pct}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3">
            <div className="bg-amber-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>Paid: {formatRWF(totalPaid)}</span>
            <span>Remaining: {formatRWF(totalRemaining)}</span>
          </div>
        </div>
      </div>

      {/* Loan details grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Principal',      value: formatRWF(loan.principal) },
          { label: 'Total Repayment',value: formatRWF(loan.total_repayment) },
          { label: 'Total Interest', value: formatRWF(loan.total_interest) },
          { label: 'Fees + VAT',     value: formatRWF(loan.upfront_fee_amount + loan.vat_amount) },
          { label: 'Term',           value: `${loan.term_months} month(s)` },
          { label: 'Month 1 Payment',value: formatRWF(loan.month1_payment) },
          { label: 'Monthly Payment',value: formatRWF(loan.monthly_payment) },
          { label: 'Disbursed',      value: loan.disbursed_at ? new Date(loan.disbursed_at).toLocaleDateString() : '—' },
        ].map(item => (
          <div key={item.label} className="card p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{item.label}</p>
            <p className="font-bold text-slate-800 mt-1 text-sm">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Repayment schedule */}
      <div className="card">
        <h2 className="font-bold text-slate-800 mb-4">Repayment Schedule</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Month', 'Due Date', 'Interest', 'Fees', 'VAT', 'Total Due', 'Paid', 'Status'].map(h => (
                  <th key={h} className="text-left pb-3 pr-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.map((row: {
                id: string
                month_number: number
                due_date: string
                interest_amount: number
                fee_amount: number
                total_due: number
                amount_paid: number
                paid_at: string | null
                status: string
                late_fee: number
              }) => (
                <tr key={row.id} className={`border-b border-slate-50 ${row.status === 'overdue' ? 'bg-red-50' : row.status === 'paid' ? 'bg-green-50' : ''}`}>
                  <td className="py-3 pr-4 font-semibold text-slate-700">{row.month_number}</td>
                  <td className="py-3 pr-4 text-slate-600">{row.due_date}</td>
                  <td className="py-3 pr-4 text-slate-600">{formatRWF(row.interest_amount)}</td>
                  <td className="py-3 pr-4 text-slate-600">
                    {row.fee_amount > 0 ? formatRWF(row.fee_amount) : '—'}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {row.month_number === 1 ? formatRWF(Math.round(row.fee_amount * 0.18)) : '—'}
                  </td>
                  <td className="py-3 pr-4 font-semibold text-slate-800">{formatRWF(row.total_due)}</td>
                  <td className="py-3 pr-4 text-slate-600">{row.amount_paid > 0 ? formatRWF(row.amount_paid) : '—'}</td>
                  <td className="py-3"><RepaymentBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-bold">
                <td colSpan={5} className="pt-3 text-slate-700">TOTALS</td>
                <td className="pt-3 text-slate-800">{formatRWF(loan.total_repayment)}</td>
                <td className="pt-3 text-green-700">{formatRWF(totalPaid)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Late fee notice */}
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          ⚠ Late payments attract a 5% monthly penalty on overdue amounts. Please repay on time to protect your CRB record.
          <a href="https://wa.me/250788834132" target="_blank" className="ml-2 font-semibold underline">Contact us if you need support.</a>
        </div>
      </div>

      {/* Payment instructions */}
      <div className="card mt-4">
        <h2 className="font-bold text-slate-800 mb-3">How to Pay</h2>
        <p className="text-slate-600 text-sm mb-3">
          All repayments are made directly to INEMA Financial Solutions Ltd. Contact us to confirm payment details.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href="https://wa.me/250788834132" target="_blank"
            className="flex items-center gap-3 p-3 border border-green-200 rounded-xl hover:bg-green-50 transition-colors">
            <span className="text-2xl">💬</span>
            <div>
              <p className="font-semibold text-slate-700 text-sm">WhatsApp</p>
              <p className="text-xs text-slate-400">+250 788 834 132</p>
            </div>
          </a>
          <a href="tel:+250788834132"
            className="flex items-center gap-3 p-3 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors">
            <span className="text-2xl">📞</span>
            <div>
              <p className="font-semibold text-slate-700 text-sm">Call Us</p>
              <p className="text-xs text-slate-400">+250 788 834 132</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}
