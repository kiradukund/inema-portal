import { requireAdmin, daysUntil } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'

export default async function AdminCompliance() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  const { data: deadlines } = await supabase
    .from('compliance_deadlines')
    .select('*')
    .order('deadline_date', { ascending: true })

  const all = deadlines ?? []
  const pending = all.filter(d => !d.is_done)
  const done = all.filter(d => d.is_done)

  const monthly = pending.filter(d => d.recurrence === 'monthly_15th')
  const quarterly = pending.filter(d => d.recurrence === 'quarterly')
  const annual = pending.filter(d => d.recurrence === 'annual')

  function DeadlineCard({ d }: { d: typeof all[0] }) {
    const days = daysUntil(d.deadline_date)
    const overdue = days < 0
    const urgent = days >= 0 && days <= 7
    const soon = days >= 0 && days <= 30

    return (
      <div className={`flex items-start justify-between p-4 rounded-xl border ${overdue ? 'bg-red-50 border-red-200' : urgent ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              d.category === 'tax' ? 'bg-blue-100 text-blue-700' :
              d.category === 'bnr' ? 'bg-purple-100 text-purple-700' :
              d.category === 'rssb' ? 'bg-green-100 text-green-700' :
              'bg-slate-100 text-slate-600'
            }`}>{d.category?.toUpperCase()}</span>
            <p className={`font-semibold text-sm ${overdue ? 'text-red-800' : 'text-slate-800'}`}>{d.title}</p>
          </div>
          {d.description && <p className="text-xs text-slate-500 mt-0.5">{d.description}</p>}
          <p className="text-xs text-slate-400 mt-1">📅 {d.deadline_date} · {d.recurrence?.replace('_', ' ')}</p>
        </div>
        <div className="text-right ml-4 flex flex-col items-end gap-2">
          <span className={`text-sm font-bold px-3 py-1.5 rounded-lg ${
            overdue ? 'bg-red-100 text-red-700' :
            urgent ? 'bg-amber-100 text-amber-700' :
            soon ? 'bg-yellow-100 text-yellow-700' :
            'bg-slate-100 text-slate-600'
          }`}>
            {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'TODAY' : `${days} days`}
          </span>
          <form action={`/api/admin/compliance/${d.id}/done`} method="POST">
            <button className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200 transition-colors">
              ✓ Mark Done
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Tax &amp; BNR Compliance</h1>
        <p className="text-slate-500 text-sm mt-1">
          {pending.filter(d => daysUntil(d.deadline_date) <= 30).length} deadlines in the next 30 days
        </p>
      </div>

      {/* Important note about CIT exemption */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="font-bold text-green-800">Corporate Income Tax Exemption</p>
            <p className="text-green-700 text-sm mt-1">
              INEMA Financial Solutions Ltd is exempt from Corporate Income Tax at <strong>0% rate for 5 years</strong> from BNR approval (June 2025 → June 2030). You still must file a declaration annually by March 31, but pay RWF 0. Keep all records clean for the declaration.
            </p>
          </div>
        </div>
      </div>

      {/* Monthly */}
      <div className="mb-6">
        <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wide mb-3">📅 Monthly (Due 15th of each month)</h2>
        <div className="space-y-2">
          {monthly.map(d => <DeadlineCard key={d.id} d={d} />)}
          {monthly.length === 0 && <p className="text-slate-400 text-sm">All monthly obligations up to date ✅</p>}
        </div>
      </div>

      {/* Quarterly */}
      <div className="mb-6">
        <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wide mb-3">📆 Quarterly</h2>
        <div className="space-y-2">
          {quarterly.map(d => <DeadlineCard key={d.id} d={d} />)}
          {quarterly.length === 0 && <p className="text-slate-400 text-sm">All quarterly obligations up to date ✅</p>}
        </div>
      </div>

      {/* Annual */}
      <div className="mb-6">
        <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wide mb-3">🗓️ Annual</h2>
        <div className="space-y-2">
          {annual.map(d => <DeadlineCard key={d.id} d={d} />)}
          {annual.length === 0 && <p className="text-slate-400 text-sm">All annual obligations up to date ✅</p>}
        </div>
      </div>

      {/* Done */}
      {done.length > 0 && (
        <div>
          <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wide mb-3">✅ Completed ({done.length})</h2>
          <div className="space-y-2">
            {done.map(d => (
              <div key={d.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 opacity-60">
                <div>
                  <p className="font-semibold text-sm text-slate-600 line-through">{d.title}</p>
                  <p className="text-xs text-slate-400">{d.deadline_date}</p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Done</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full tax reference */}
      <div className="mt-8 bg-slate-900 rounded-xl p-6 text-white">
        <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest mb-4">Rwanda Tax Reference — INEMA</p>
        <div className="space-y-3 text-sm">
          {[
            { tax: 'PAYE', rate: 'Progressive (0% to 30%)', deadline: '15th of following month', authority: 'RRA' },
            { tax: 'RSSB Pension', rate: '6% employee + 6% employer', deadline: '15th of following month', authority: 'RSSB' },
            { tax: 'RSSB Maternity', rate: '0.3% employee + 0.3% employer', deadline: '15th of following month', authority: 'RSSB' },
            { tax: 'CBHI', rate: '0.5% of gross salary', deadline: '15th of following month', authority: 'RSSB' },
            { tax: 'VAT on Fees', rate: '18% on upfront loan fees', deadline: '15th of following month', authority: 'RRA' },
            { tax: 'Corporate Income Tax', rate: '0% (exempt until June 2030)', deadline: 'March 31 annually', authority: 'RRA' },
            { tax: 'BNR Quarterly Report', rate: 'N/A', deadline: '30 days after quarter end', authority: 'BNR' },
            { tax: 'CRB Reporting', rate: 'N/A', deadline: 'Monthly', authority: 'BNR/TransUnion' },
          ].map(row => (
            <div key={row.tax} className="flex items-center gap-4 py-2 border-b border-slate-800 last:border-0">
              <span className="text-slate-300 font-medium w-44 flex-shrink-0">{row.tax}</span>
              <span className="text-slate-400 flex-1">{row.rate}</span>
              <span className="text-amber-400 text-xs w-44 flex-shrink-0">{row.deadline}</span>
              <span className="text-slate-500 text-xs w-20 text-right">{row.authority}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
