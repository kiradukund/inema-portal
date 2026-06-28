import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatRWF } from '@/lib/calculator'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'badge-pending', submitted: 'badge-pending', under_review: 'badge-pending',
    approved: 'badge-approved', disbursed: 'badge-active', active: 'badge-active',
    completed: 'badge-completed', rejected: 'badge-rejected', defaulted: 'badge-overdue',
  }
  return <span className={map[status] ?? 'badge-upcoming'}>{status.replace('_', ' ')}</span>
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

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
    .limit(3)

  const activeLoans = loans?.filter(l => l.status === 'active' || l.status === 'disbursed') ?? []
  const totalBorrowed = loans?.reduce((s, l) => s + l.principal, 0) ?? 0
  const totalOwed = activeLoans.reduce((s, l) => {
    const paid = l.repayment_schedules?.reduce((sp: number, r: { amount_paid: number }) => sp + (r.amount_paid ?? 0), 0) ?? 0
    return s + l.total_repayment - paid
  }, 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome back, {profile?.full_name?.split(' ')[0]} 👋
        </h1>
        <p className="text-slate-500 mt-1">Here&apos;s a summary of your account.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link href="/loans" className="card border-l-4 border-l-amber-500 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Loans</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{activeLoans.length}</p>
          <p className="text-xs text-amber-600 mt-1">View all →</p>
        </Link>
        <Link href="/loans" className="card border-l-4 border-l-blue-500 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Borrowed</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{formatRWF(totalBorrowed)}</p>
          <p className="text-xs text-blue-600 mt-1">View history →</p>
        </Link>
        <Link href="/loans" className="card border-l-4 border-l-red-400 hover:border-red-300 hover:shadow-md transition-all cursor-pointer">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount Owed</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{formatRWF(totalOwed)}</p>
          <p className="text-xs text-red-500 mt-1">View schedule →</p>
        </Link>
      </div>

      {/* Profile completeness warning */}
      {!profile?.national_id && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
          <div>
            <p className="font-semibold text-amber-800 text-sm">Complete your profile</p>
            <p className="text-amber-700 text-sm mt-0.5">Add your National ID and income details to speed up loan approval.</p>
          </div>
          <Link href="/profile" className="btn-gold text-sm whitespace-nowrap ml-4">Update Profile</Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active loans */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Active Loans</h2>
              <Link href="/loans" className="text-sm text-amber-600 hover:underline font-semibold">View all →</Link>
            </div>
            <Link href="/loans" className="text-amber-600 text-sm hover:underline">View all</Link>
          </div>
          {activeLoans.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400 text-sm mb-4">No active loans</p>
              <Link href="/loans/apply" className="btn-gold text-sm">Apply for a Loan</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeLoans.map(loan => {
                const paid = loan.repayment_schedules?.reduce((s: number, r: { amount_paid: number }) => s + (r.amount_paid ?? 0), 0) ?? 0
                const remaining = loan.total_repayment - paid
                const pct = Math.round((paid / loan.total_repayment) * 100)
                return (
                  <Link key={loan.id} href={`/loans/${loan.id}`}
                    className="block p-4 border border-slate-100 rounded-xl hover:border-amber-300 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-slate-700 text-sm capitalize">{loan.loan_type.replace('_', ' ')}</p>
                        <p className="text-xs text-slate-400">{loan.loan_number}</p>
                      </div>
                      <StatusBadge status={loan.status} />
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-500">Remaining</span>
                      <span className="font-semibold text-slate-800">{formatRWF(remaining)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{pct}% repaid</p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent applications */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800">Recent Applications</h2>
            <Link href="/loans/apply" className="btn-gold text-sm">+ New</Link>
          </div>
          {!applications || applications.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400 text-sm mb-4">No applications yet</p>
              <Link href="/loans/apply" className="btn-gold text-sm">Apply Now</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map(app => (
                <Link key={app.id} href="/loans" className="block p-4 border border-slate-100 rounded-xl hover:border-amber-200 hover:bg-amber-50 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-slate-700 text-sm capitalize">
                        {app.loan_type.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-slate-400">{app.application_number}</p>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mt-2">{formatRWF(app.requested_amount)}</p>
                  <p className="text-xs text-slate-400">{app.requested_term_months} month(s)</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6 card">
        <h2 className="font-bold text-slate-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/loans/apply',  icon: '📝', label: 'Apply for Loan' },
            { href: '/calculator',   icon: '🧮', label: 'Loan Calculator' },
            { href: '/loans',        icon: '💳', label: 'View My Loans' },
            { href: '/profile',      icon: '👤', label: 'Update Profile' },
          ].map(a => (
            <Link key={a.href} href={a.href}
              className="flex flex-col items-center gap-2 p-4 border border-slate-100 rounded-xl hover:border-amber-300 hover:bg-amber-50 transition-colors text-center">
              <span className="text-2xl">{a.icon}</span>
              <span className="text-xs font-semibold text-slate-600">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
