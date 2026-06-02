import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatRWF } from '@/lib/calculator'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'badge-active', disbursed: 'badge-active',
    completed: 'badge-completed', defaulted: 'badge-overdue',
    pending: 'badge-pending',
  }
  return <span className={map[status] ?? 'badge-upcoming'}>{status.replace('_', ' ')}</span>
}

export default async function LoansPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: loans } = await supabase
    .from('loans')
    .select('*, repayment_schedules(*)')
    .eq('client_id', user.id)
    .order('created_at', { ascending: false })

  const { data: applications } = await supabase
    .from('loan_applications')
    .select('*')
    .eq('client_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Loans</h1>
          <p className="text-slate-500 mt-1">All your loans and applications in one place.</p>
        </div>
        <Link href="/loans/apply" className="btn-gold">+ Apply for Loan</Link>
      </div>

      {/* Active / Past Loans */}
      <div className="mb-8">
        <h2 className="font-bold text-slate-700 mb-4 uppercase tracking-wide text-xs">Loans</h2>
        {!loans || loans.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-4xl mb-3">💳</p>
            <p className="text-slate-500 mb-4">You have no loans yet.</p>
            <Link href="/loans/apply" className="btn-gold">Apply for Your First Loan</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {loans.map(loan => {
              const paid = loan.repayment_schedules?.reduce(
                (s: number, r: { amount_paid: number }) => s + (r.amount_paid ?? 0), 0
              ) ?? 0
              const remaining = loan.total_repayment - paid
              const pct = Math.round((paid / loan.total_repayment) * 100)
              const overdue = loan.repayment_schedules?.some((r: { status: string }) => r.status === 'overdue')
              const nextDue = loan.repayment_schedules?.find(
                (r: { status: string }) => r.status === 'upcoming' || r.status === 'due' || r.status === 'overdue'
              )

              return (
                <Link key={loan.id} href={`/loans/${loan.id}`}
                  className="card flex flex-col sm:flex-row sm:items-center gap-4 hover:border-amber-300 border transition-colors cursor-pointer">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-bold text-slate-800 capitalize">{loan.loan_type.replace('_', ' ')}</p>
                      <StatusBadge status={loan.status} />
                      {overdue && <span className="badge-overdue">⚠ Overdue</span>}
                    </div>
                    <p className="text-xs text-slate-400">{loan.loan_number} · {loan.term_months} months</p>
                    <div className="mt-3 w-full sm:w-64 bg-slate-100 rounded-full h-2">
                      <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{pct}% repaid</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs text-slate-400">Principal</p>
                    <p className="font-bold text-slate-800">{formatRWF(loan.principal)}</p>
                    <p className="text-xs text-slate-400 mt-2">Remaining</p>
                    <p className="font-semibold text-amber-600">{formatRWF(remaining)}</p>
                    {nextDue && (
                      <p className="text-xs text-slate-400 mt-2">
                        Next due: <span className="font-medium">{nextDue.due_date}</span>
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Applications */}
      <div>
        <h2 className="font-bold text-slate-700 mb-4 uppercase tracking-wide text-xs">Applications</h2>
        {!applications || applications.length === 0 ? (
          <p className="text-slate-400 text-sm">No applications yet.</p>
        ) : (
          <div className="space-y-3">
            {applications.map(app => (
              <div key={app.id} className="card flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-slate-700 capitalize">{app.loan_type.replace('_', ' ')}</p>
                    <span className={
                      app.status === 'approved' ? 'badge-approved' :
                      app.status === 'rejected' ? 'badge-rejected' : 'badge-pending'
                    }>{app.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{app.application_number}</p>
                  {app.review_notes && (
                    <p className="text-sm text-slate-600 mt-2 bg-slate-50 p-2 rounded">{app.review_notes}</p>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="font-bold text-slate-800">{formatRWF(app.requested_amount)}</p>
                  <p className="text-xs text-slate-400">{app.requested_term_months} month(s)</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
