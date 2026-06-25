import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'
import ApplicationActions from './ApplicationActions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminApplications() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  const { data: apps, error: appsError } = await supabase
    .from('loan_applications')
    .select('*')
    .order('submitted_at', { ascending: false })

  if (appsError) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Database Error</h1>
        <pre className="text-xs bg-red-50 p-4 rounded text-red-800 overflow-auto">{JSON.stringify(appsError, null, 2)}</pre>
        <p className="text-sm text-slate-500 mt-4">Go to Supabase SQL Editor and run: <code>alter table loan_applications disable row level security;</code></p>
      </div>
    )
  }

  const all = apps ?? []
  const clientIds = [...new Set(all.map((a: any) => a.client_id).filter(Boolean))]
  let profileMap: Record<string, any> = {}
  if (clientIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles').select('id, full_name, phone, employer_name').in('id', clientIds)
    ;(profiles ?? []).forEach((p: any) => { profileMap[p.id] = p })
  }

  const counts = { submitted: 0, approved: 0, rejected: 0 }
  all.forEach((a: any) => { if (a.status in counts) counts[a.status as keyof typeof counts]++ })

  const loanLabel: Record<string, string> = {
    salary_advance: 'Salary Advance', quinzaine: 'Quinzaine', school_fees: 'School Fees', business: 'Business'
  }
  const statusColor: Record<string, string> = {
    submitted: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Loan Applications</h1>
        <p className="text-slate-500 text-sm mt-1">Portal applications — {all.length} total</p>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total',    value: all.length,      color: 'border-l-slate-400' },
          { label: 'Pending',  value: counts.submitted, color: 'border-l-amber-500' },
          { label: 'Approved', value: counts.approved,  color: 'border-l-green-500' },
          { label: 'Rejected', value: counts.rejected,  color: 'border-l-red-500' },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-xl p-5 border border-slate-100 border-l-4 ${s.color} shadow-sm`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">All Applications ({all.length})</h2>
        </div>
        {all.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-slate-500 font-medium">No applications yet</p>
            <p className="text-slate-400 text-sm mt-1">When clients apply through the portal they appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Ref#','Client','Phone','Type','Amount','Term','Purpose','Employer','Docs','Date','Status','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {all.map((app: any) => {
                  const profile = profileMap[app.client_id] ?? {}
                  const docs = [app.has_id_copy,app.has_payslips,app.has_bank_statement,app.has_employment_letter,app.has_application_letter].filter(Boolean).length
                  return (
                    <tr key={app.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{app.application_number}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{profile.full_name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{profile.phone ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{loanLabel[app.loan_type] ?? app.loan_type}</td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{formatRWF(app.requested_amount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{app.requested_term_months}mo</td>
                      <td className="px-4 py-3 text-slate-500 max-w-[130px] truncate" title={app.purpose}>{app.purpose ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{app.employer ?? profile.employer_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${docs >= 3 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{docs}/5</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{app.submitted_at ? new Date(app.submitted_at).toLocaleDateString('en-RW') : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${statusColor[app.status] ?? 'bg-slate-100 text-slate-600'}`}>{app.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {app.status === 'submitted'
                          ? <ApplicationActions id={app.id} clientName={profile.full_name ?? 'Client'} clientPhone={profile.phone ?? ''} amount={app.requested_amount} term={app.requested_term_months} />
                          : <span className="text-xs text-slate-400">{app.review_notes?.slice(0,40) || 'Processed'}</span>}
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
