import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

function formatRWF(n: number) {
  return 'RWF ' + Math.round(n).toLocaleString()
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminApplications() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {},
        remove() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const admin = getAdminClient()
  const { data: applications } = await admin
    .from('loan_applications')
    .select('*, profiles(full_name, email, phone)')
    .order('created_at', { ascending: false })

  const all = applications ?? []
  const pending = all.filter((a: any) => a.status === 'submitted' || a.status === 'under_review')
  const approved = all.filter((a: any) => a.status === 'approved')
  const rejected = all.filter((a: any) => a.status === 'rejected')

  const statusColors: Record<string, string> = {
    submitted: 'bg-amber-100 text-amber-700',
    under_review: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    draft: 'bg-slate-100 text-slate-600',
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Loan Applications</h1>
        <p className="text-slate-500 text-sm mt-1">
          {pending.length} pending · {approved.length} approved · {rejected.length} rejected
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', count: all.length, color: 'border-slate-400' },
          { label: 'Pending', count: pending.length, color: 'border-amber-500' },
          { label: 'Approved', count: approved.length, color: 'border-green-500' },
          { label: 'Rejected', count: rejected.length, color: 'border-red-500' },
        ].map(c => (
          <div key={c.label} className={`bg-white rounded-xl p-4 border border-slate-100 border-l-4 ${c.color} shadow-sm`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{c.count}</p>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-amber-100 bg-amber-50">
            <h2 className="font-bold text-amber-800">⏳ Pending Review — Action Required ({pending.length})</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {pending.map((app: any) => (
              <div key={app.id} className="p-5 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <p className="font-bold text-slate-800 text-lg">{app.profiles?.full_name ?? 'Unknown Client'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[app.status] ?? ''}`}>{app.status}</span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                    <div><p className="text-xs text-slate-400">Loan Type</p><p className="text-sm font-semibold text-slate-700 capitalize">{(app.loan_type ?? '').replace(/_/g, ' ')}</p></div>
                    <div><p className="text-xs text-slate-400">Amount</p><p className="text-sm font-semibold text-slate-700">{formatRWF(app.amount ?? 0)}</p></div>
                    <div><p className="text-xs text-slate-400">Term</p><p className="text-sm font-semibold text-slate-700">{app.term_months} months</p></div>
                    <div><p className="text-xs text-slate-400">Applied On</p><p className="text-sm font-semibold text-slate-700">{new Date(app.created_at).toLocaleDateString()}</p></div>
                  </div>
                  <div className="flex gap-6 text-sm mb-3">
                    <div><span className="text-slate-400">Phone: </span><a href={`tel:${app.profiles?.phone ?? ''}`} className="text-blue-600 font-medium">{app.profiles?.phone ?? '—'}</a></div>
                    <div><span className="text-slate-400">Email: </span><span className="text-slate-600">{app.profiles?.email ?? '—'}</span></div>
                  </div>
                  {app.purpose && (
                    <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
                      <span className="font-medium text-slate-700">Purpose: </span>{app.purpose}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0 min-w-[130px]">
                  <form action={"/api/admin/applications/" + app.id + "/approve"} method="POST">
                    <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
                      ✓ Approve
                    </button>
                  </form>
                  <form action={"/api/admin/applications/" + app.id + "/reject"} method="POST">
                    <button type="submit" className="w-full bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
                      ✕ Reject
                    </button>
                  </form>
                  <a href={"https://wa.me/" + (app.profiles?.phone ?? '').replace(/\D/g, '') + "?text=" + encodeURIComponent("Dear " + (app.profiles?.full_name ?? '') + ", we have received your INEMA loan application for " + formatRWF(app.amount ?? 0) + ". We will review it within 24 hours. For queries call +250788834132.")}
                    target="_blank"
                    className="w-full bg-green-500 hover:bg-green-400 text-white text-sm font-bold px-5 py-2.5 rounded-lg text-center transition-colors">
                    💬 WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50">
          <h2 className="font-bold text-slate-800">All Applications ({all.length})</h2>
        </div>
        {all.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-5xl mb-3">📋</p>
            <p className="text-slate-600 font-semibold mb-2">No applications yet</p>
            <p className="text-slate-400 text-sm">When clients apply through the portal, they will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Client', 'Phone', 'Loan Type', 'Amount', 'Term', 'Status', 'Applied', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {all.map((app: any) => (
                  <tr key={app.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{app.profiles?.full_name ?? '—'}</p>
                      <p className="text-xs text-slate-400">{app.profiles?.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-blue-600">{app.profiles?.phone ?? '—'}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{(app.loan_type ?? '').replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{formatRWF(app.amount ?? 0)}</td>
                    <td className="px-4 py-3 text-slate-600">{app.term_months}mo</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[app.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(app.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {(app.status === 'submitted' || app.status === 'under_review') && (
                        <div className="flex gap-2">
                          <form action={"/api/admin/applications/" + app.id + "/approve"} method="POST">
                            <button type="submit" className="bg-green-100 hover:bg-green-200 text-green-700 text-xs font-bold px-3 py-1.5 rounded-lg">✓</button>
                          </form>
                          <form action={"/api/admin/applications/" + app.id + "/reject"} method="POST">
                            <button type="submit" className="bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold px-3 py-1.5 rounded-lg">✕</button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
