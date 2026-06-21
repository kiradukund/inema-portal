import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'

function rwf(n: number) { return 'RWF ' + Math.round(n).toLocaleString() }

export default async function AdminApplications() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') redirect('/dashboard')

  // Use service role to bypass RLS completely
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: apps, error } = await admin
    .from('loan_applications')
    .select(`
      id, loan_type, requested_amount, requested_term_months,
      status, purpose, employer, created_at, client_id,
      profiles!loan_applications_client_id_fkey(full_name, email, phone)
    `)
    .order('created_at', { ascending: false })

  const debugInfo = error ? `Error: ${JSON.stringify(error)}` : `Loaded ${(apps??[]).length} apps`
  const all = (apps ?? []) as any[]
  const pending = all.filter(a => ['submitted','under_review','draft'].includes(a.status))
  const approved = all.filter(a => a.status === 'approved')
  const rejected = all.filter(a => a.status === 'rejected')

  const sc: Record<string, string> = {
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
          {pending.length} pending · {approved.length} approved · {rejected.length} rejected · {all.length} total
        </p>
        {/* Debug info - remove after fixing */}
        <p className="text-xs text-slate-400 mt-1 font-mono">{debugInfo}</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { l: 'Total', c: all.length, b: 'border-slate-400' },
          { l: 'Pending', c: pending.length, b: 'border-amber-500' },
          { l: 'Approved', c: approved.length, b: 'border-green-500' },
          { l: 'Rejected', c: rejected.length, b: 'border-red-500' },
        ].map(x => (
          <div key={x.l} className={`bg-white rounded-xl p-4 border border-slate-100 border-l-4 ${x.b} shadow-sm`}>
            <p className="text-xs font-semibold text-slate-400 uppercase">{x.l}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{x.c}</p>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-amber-100 bg-amber-50">
            <h2 className="font-bold text-amber-800">⏳ Pending — Action Required ({pending.length})</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {pending.map((app: any) => {
              const profile = Array.isArray(app.profiles) ? app.profiles[0] : app.profiles
              return (
                <div key={app.id} className="p-5 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <p className="font-bold text-slate-800 text-lg">{profile?.full_name ?? 'Unknown'}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc[app.status] ?? ''}`}>{app.status}</span>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                      <div><p className="text-xs text-slate-400">Loan Type</p><p className="text-sm font-semibold text-slate-700 capitalize">{(app.loan_type ?? '').replace(/_/g, ' ')}</p></div>
                      <div><p className="text-xs text-slate-400">Amount</p><p className="text-sm font-semibold text-slate-700">{rwf(app.requested_amount ?? 0)}</p></div>
                      <div><p className="text-xs text-slate-400">Term</p><p className="text-sm font-semibold text-slate-700">{app.requested_term_months} months</p></div>
                      <div><p className="text-xs text-slate-400">Applied</p><p className="text-sm font-semibold text-slate-700">{new Date(app.created_at).toLocaleDateString()}</p></div>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <span><span className="text-slate-400">Phone: </span><a href={`tel:${profile?.phone ?? ''}`} className="text-blue-600 font-medium">{profile?.phone ?? '—'}</a></span>
                      <span><span className="text-slate-400">Email: </span><span className="text-slate-600">{profile?.email ?? '—'}</span></span>
                    </div>
                    {app.purpose && <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded p-2"><b>Purpose:</b> {app.purpose}</p>}
                  </div>
                  <div className="flex flex-col gap-2 min-w-[130px]">
                    <form action={`/api/admin/applications/${app.id}/approve`} method="POST">
                      <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-5 py-2.5 rounded-lg">✓ Approve</button>
                    </form>
                    <form action={`/api/admin/applications/${app.id}/reject`} method="POST">
                      <button type="submit" className="w-full bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold px-5 py-2.5 rounded-lg">✕ Reject</button>
                    </form>
                    <a href={`https://wa.me/${(profile?.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent('Dear ' + (profile?.full_name ?? '') + ', your INEMA loan application for ' + rwf(app.requested_amount ?? 0) + ' is under review. We will contact you within 24 hours. Call +250788834132.')}`}
                      target="_blank" className="w-full bg-green-500 text-white text-sm font-bold px-5 py-2.5 rounded-lg text-center">
                      💬 WhatsApp
                    </a>
                  </div>
                </div>
              )
            })}
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
            <p className="text-slate-600 font-semibold">No applications yet</p>
            <p className="text-slate-400 text-sm mt-1">{debugInfo}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Client','Phone','Type','Amount','Term','Status','Date','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {all.map((app: any) => {
                  const profile = Array.isArray(app.profiles) ? app.profiles[0] : app.profiles
                  return (
                    <tr key={app.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3"><p className="font-semibold text-slate-800">{profile?.full_name ?? '—'}</p><p className="text-xs text-slate-400">{profile?.email ?? ''}</p></td>
                      <td className="px-4 py-3 text-xs text-blue-600">{profile?.phone ?? '—'}</td>
                      <td className="px-4 py-3 capitalize text-slate-600">{(app.loan_type ?? '').replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{rwf(app.requested_amount ?? 0)}</td>
                      <td className="px-4 py-3 text-slate-600">{app.requested_term_months}mo</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${sc[app.status] ?? 'bg-slate-100 text-slate-600'}`}>{app.status}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{new Date(app.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {['submitted','under_review','draft'].includes(app.status) && (
                          <div className="flex gap-2">
                            <form action={`/api/admin/applications/${app.id}/approve`} method="POST">
                              <button type="submit" className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-lg">✓</button>
                            </form>
                            <form action={`/api/admin/applications/${app.id}/reject`} method="POST">
                              <button type="submit" className="bg-red-100 text-red-700 text-xs font-bold px-3 py-1.5 rounded-lg">✕</button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
