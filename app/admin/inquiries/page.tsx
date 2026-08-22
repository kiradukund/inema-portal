import { requireAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
// See app/admin/layout.tsx and docs/known-gaps.md — `force-dynamic` alone
// was found not to reliably prevent a stale render (Journal page
// incident, 2026-08-22). Audited and fixed across every admin page.
export const revalidate = 0

export default async function AdminInquiries() {
  await requireAdmin()
  const supabase = createAdminClient()
  const { data: messages } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false })
  const all = messages ?? []
  const unread = all.filter(m => !m.is_read).length

  // Real bug found 2026-08-19: the sidebar badge (app/admin/layout.tsx)
  // counts contact_messages where is_read=false, but nothing anywhere in
  // the app ever set is_read=true -- opening this page was a pure read,
  // so the badge stayed stuck forever no matter how many times it was
  // viewed. Mark everything currently unread as read now that Kevin is
  // looking at it. `all`/`unread` above were already fetched before this
  // runs, so this page's own render still reflects what WAS unread on
  // load (correct — you should see what you're about to clear); only the
  // *next* page load, and the sidebar badge on it, reflects the cleared
  // state, since app/admin/layout.tsx computes its own count independently
  // on every request and this page's render doesn't block or feed it.
  if (unread > 0) {
    await supabase.from('contact_messages').update({ is_read: true }).eq('is_read', false)
  }
  const loanLabel: Record<string,string> = { salary_advance:'Salary Advance', quinzaine:'Quinzaine', school_fees:'School Fees', business:'Business', general:'General' }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Website Inquiries</h1>
          <p className="text-slate-500 text-sm mt-1">Messages from the contact form</p>
        </div>
        {unread > 0 && <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">{unread} unread</span>}
      </div>
      {all.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm text-center py-16">
          <p className="text-4xl mb-3">✉️</p>
          <p className="text-slate-500 font-medium">No inquiries yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {all.map(msg => (
            <div key={msg.id} className={`bg-white rounded-xl border shadow-sm p-5 ${!msg.is_read ? 'border-l-4 border-l-amber-500 border-amber-200' : 'border-slate-100'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-slate-800">{msg.full_name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <a href={`tel:${msg.phone}`} className="text-sm text-amber-600 hover:underline">{msg.phone}</a>
                    {msg.email && <a href={`mailto:${msg.email}`} className="text-sm text-slate-500 hover:underline">{msg.email}</a>}
                  </div>
                </div>
                <div className="text-right">
                  {msg.loan_type && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{loanLabel[msg.loan_type]??msg.loan_type}</span>}
                  <p className="text-xs text-slate-400 mt-1">{new Date(msg.created_at).toLocaleDateString('en-RW',{day:'2-digit',month:'short',year:'numeric'})}</p>
                </div>
              </div>
              <p className="text-slate-700 text-sm bg-slate-50 rounded-lg p-3">{msg.message}</p>
              <div className="flex gap-3 mt-3">
                <a href={`https://wa.me/${msg.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                  className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 font-semibold">WhatsApp</a>
                {msg.email && <a href={`mailto:${msg.email}?subject=Re: Your INEMA Loan Inquiry`}
                  className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-semibold">Email Reply</a>}
                <a href={`tel:${msg.phone}`} className="text-xs bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 font-semibold">Call</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
