import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatRWF } from '@/lib/calculator'
import PaymentProofUpload from './PaymentProofUpload'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    disbursed: 'bg-green-100 text-green-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
    defaulted: 'bg-red-100 text-red-700',
    pending:   'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function AppStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    submitted: 'bg-amber-100 text-amber-700',
    approved:  'bg-green-100 text-green-700',
    rejected:  'bg-red-100 text-red-700',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

  const activeLoans = (loans ?? []).filter(l => l.status === 'active' || l.status === 'disbursed')
  const pastLoans   = (loans ?? []).filter(l => l.status !== 'active' && l.status !== 'disbursed')

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Loans</h1>
          <p className="text-slate-500 mt-1">All your loans and applications in one place.</p>
        </div>
        <Link href="/loans/apply" className="btn-gold">+ Apply for Loan</Link>
      </div>

      {/* Active Loans */}
      <div className="mb-8">
        <h2 className="font-bold text-slate-700 mb-4 uppercase tracking-wide text-xs">Active Loans</h2>
        {activeLoans.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm text-center py-12">
            <p className="text-4xl mb-3">💳</p>
            <p className="text-slate-500 mb-4">You have no active loans.</p>
            <Link href="/loans/apply" className="btn-gold">Apply for a Loan</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {activeLoans.map(loan => {
              const paid      = loan.repayment_schedules?.reduce((s: number, r: any) => s + (r.amount_paid ?? 0), 0) ?? 0
              const remaining = (loan.total_repayment ?? 0) - paid
              const pct       = loan.total_repayment ? Math.round((paid / loan.total_repayment) * 100) : 0
              const nextDue   = loan.repayment_schedules?.find((r: any) => r.status === 'upcoming' || r.status === 'due')
              return (
                <div key={loan.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="font-bold text-slate-800 text-lg">{formatRWF(loan.principal)}</p>
                      <p className="text-slate-500 text-sm">{loan.loan_number} · {loan.term_months} month(s)</p>
                    </div>
                    <StatusBadge status={loan.status} />
                  </div>
                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Paid: {formatRWF(paid)}</span>
                      <span>Remaining: {formatRWF(remaining)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{pct}% paid</p>
                  </div>
                  {nextDue && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                      <p className="text-xs font-semibold text-amber-700">Next Payment Due</p>
                      <p className="text-sm font-bold text-amber-800 mt-0.5">
                        {formatRWF(nextDue.total_due)} — {new Date(nextDue.due_date).toLocaleDateString('en-RW', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                  {/* Repayment schedule */}
                  {loan.repayment_schedules && loan.repayment_schedules.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Repayment Schedule</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100">
                              {['Month','Due Date','Amount','Paid','Status','Proof'].map(h => (
                                <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {loan.repayment_schedules.sort((a: any, b: any) => a.month_number - b.month_number).map((s: any) => (
                              <tr key={s.id} className="border-b border-slate-50">
                                <td className="py-2 px-3 text-slate-600">Month {s.month_number}</td>
                                <td className="py-2 px-3 text-slate-600">{new Date(s.due_date).toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                <td className="py-2 px-3 font-semibold text-slate-800">{formatRWF(s.total_due)}</td>
                                <td className="py-2 px-3 text-green-600">{formatRWF(s.amount_paid ?? 0)}</td>
                                <td className="py-2 px-3">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize
                                    ${s.status === 'paid' ? 'bg-green-100 text-green-700' :
                                      s.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                      s.status === 'due' ? 'bg-amber-100 text-amber-700' :
                                      'bg-slate-100 text-slate-500'}`}>
                                    {s.status}
                                  </span>
                                </td>
                                <td className="py-2 px-3">
                                  {s.status !== 'paid' && (
                                    <PaymentProofUpload loanId={loan.id} monthNumber={s.month_number}
                                      defaultAmount={(s.total_due ?? 0) - (s.amount_paid ?? 0)} />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Past / Cancelled Loans */}
      {pastLoans.length > 0 && (
        <div className="mb-8">
          <h2 className="font-bold text-slate-700 mb-4 uppercase tracking-wide text-xs">Past Loans</h2>
          <div className="space-y-3">
            {pastLoans.map(loan => (
              <div key={loan.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-700">{formatRWF(loan.principal)}</p>
                  <p className="text-slate-400 text-sm">{loan.loan_number} · {loan.term_months}mo</p>
                </div>
                <StatusBadge status={loan.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Applications */}
      <div>
        <h2 className="font-bold text-slate-700 mb-4 uppercase tracking-wide text-xs">My Applications</h2>
        {!applications || applications.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm text-center py-8">
            <p className="text-slate-400 text-sm">No applications yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map(app => (
              <div key={app.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-700 capitalize">{app.loan_type.replace('_', ' ')} — {formatRWF(app.requested_amount)}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{app.application_number} · {app.requested_term_months}mo · {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString('en-RW') : '—'}</p>
                  {app.review_notes && app.status === 'rejected' && (
                    <p className="text-red-500 text-xs mt-1">Reason: {app.review_notes}</p>
                  )}
                </div>
                <AppStatusBadge status={app.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
