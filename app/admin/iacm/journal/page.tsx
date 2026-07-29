import { requireAdmin, formatRWF } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import { getTrialBalance } from '@/lib/ledger'
import Link from 'next/link'
import DownloadButton from './DownloadButton'

export const dynamic = 'force-dynamic'

export default async function JournalPage() {
  await requireAdmin()
  const supabase = createAdminClient()

  const [trialBalance, { data: entries }] = await Promise.all([
    getTrialBalance(),
    supabase.from('iacm_journal_entries').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
  ])

  const assets = trialBalance.filter(a => a.category === 'asset')
  const liabilities = trialBalance.filter(a => a.category === 'liability')
  const equity = trialBalance.filter(a => a.category === 'equity')

  const groupedEntries: Record<string, any[]> = {}
  ;(entries ?? []).forEach((e: any) => {
    const key = e.reference ?? e.id
    if (!groupedEntries[key]) groupedEntries[key] = []
    groupedEntries[key].push(e)
  })

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Journal Entries</h1>
          <p className="text-slate-500 text-sm mt-1">Ledger for cash, fixed assets, payables, equity and borrowings — feeds the BNR balance sheet</p>
        </div>
        <div className="flex items-center gap-3">
          <DownloadButton />
          <Link href="/admin/iacm/journal/new" className="bg-amber-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-amber-700">
            + New Entry
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {[
          { title: 'Assets', rows: assets },
          { title: 'Liabilities', rows: liabilities },
          { title: 'Equity', rows: equity },
        ].map(({ title, rows }) => (
          <div key={title} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">{title}</p>
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.code} className="flex justify-between text-sm">
                  <span className="text-slate-600">{r.name}</span>
                  <span className={`font-semibold ${r.balance === null ? 'text-slate-300' : r.balance < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {r.balance === null ? 'no data yet' : formatRWF(r.balance)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <p className="text-sm font-bold text-slate-700 mb-4">Recent Entries</p>
        {Object.keys(groupedEntries).length === 0 && (
          <p className="text-sm text-slate-400">No journal entries recorded yet. Use "+ New Entry" to record opening balances or transactions.</p>
        )}
        <div className="space-y-4">
          {Object.entries(groupedEntries).map(([reference, lines]) => (
            <div key={reference} className="border border-slate-100 rounded-lg p-4">
              <div className="flex justify-between items-baseline mb-2">
                <p className="text-sm font-semibold text-slate-700">{lines[0].description}</p>
                <p className="text-xs text-slate-400">{new Date(lines[0].entry_date).toLocaleDateString('en-RW')} · {reference}</p>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {lines.map((l: any) => (
                    <tr key={l.id} className="border-t border-slate-50">
                      <td className="py-1.5 text-slate-600">{l.account_name}</td>
                      <td className="py-1.5 text-right w-32">{Number(l.debit) > 0 ? formatRWF(l.debit) : ''}</td>
                      <td className="py-1.5 text-right w-32 text-slate-400">{Number(l.credit) > 0 ? formatRWF(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
