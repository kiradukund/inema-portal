import { requireAdmin, formatRWF } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import { getTrialBalance, REVERSAL_HANDLERS } from '@/lib/ledger'
import Link from 'next/link'
import DownloadButton from './DownloadButton'
import ReverseButton from './ReverseButton'

export const dynamic = 'force-dynamic'

const ENTRY_TYPE_LABELS: Record<string, string> = {
  disbursement: 'Disbursement',
  payment: 'Payment',
  expense: 'Expense',
  salary_payment: 'Salary Payment',
  shareholder_loan: 'Shareholder Loan',
  cash_transfer: 'Cash Transfer',
  manual: 'Manual',
}

export default async function JournalPage() {
  await requireAdmin()
  const supabase = createAdminClient()

  // iacm_journal_entries is a header table (one row per transaction) with
  // the actual debit/credit detail in the related iacm_journal_lines —
  // embedded here directly, since each entry row is already one complete
  // transaction and no longer needs grouping by `reference` the way the old
  // (incorrect) flat-table assumption required.
  const [trialBalance, { data: entries }, { data: reversals }] = await Promise.all([
    getTrialBalance(),
    supabase.from('iacm_journal_entries').select('*, iacm_journal_lines(*)').order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
    supabase.from('iacm_reversals').select('*').order('reversed_at', { ascending: false }).limit(50),
  ])

  const assets = trialBalance.filter(a => a.category === 'asset')
  const liabilities = trialBalance.filter(a => a.category === 'liability')
  const equity = trialBalance.filter(a => a.category === 'equity')

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
        {(entries ?? []).length === 0 && (
          <p className="text-sm text-slate-400">No journal entries recorded yet. Use "+ New Entry" to record opening balances or transactions.</p>
        )}
        <div className="space-y-4">
          {(entries ?? []).map((entry: any) => (
            <div key={entry.id} className="border border-slate-100 rounded-lg p-4">
              <div className="flex justify-between items-baseline mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-700">{entry.narration}</p>
                  {entry.entry_type && (
                    <span className="text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                      {ENTRY_TYPE_LABELS[entry.entry_type] ?? entry.entry_type}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{new Date(entry.entry_date).toLocaleDateString('en-RW')} · {entry.reference}</p>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {(entry.iacm_journal_lines ?? []).map((l: any) => (
                    <tr key={l.id} className="border-t border-slate-50">
                      <td className="py-1.5 text-slate-600">{l.account_name}</td>
                      <td className="py-1.5 text-right w-32">{Number(l.debit_amount) > 0 ? formatRWF(l.debit_amount) : ''}</td>
                      <td className="py-1.5 text-right w-32 text-slate-400">{Number(l.credit_amount) > 0 ? formatRWF(l.credit_amount) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-slate-400">{entry.created_by ? `Recorded by ${entry.created_by}` : ''}</p>
                {entry.entry_type in REVERSAL_HANDLERS && (
                  <ReverseButton journalEntryId={entry.id} entryDate={entry.entry_date} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 mt-6">
        <p className="text-sm font-bold text-slate-700 mb-4">Reversal History</p>
        {(reversals ?? []).length === 0 && (
          <p className="text-sm text-slate-400">No reversals recorded.</p>
        )}
        <div className="space-y-3">
          {(reversals ?? []).map((r: any) => (
            <div key={r.id} className="border border-slate-100 rounded-lg p-3 text-sm">
              <div className="flex justify-between items-baseline">
                <p className="font-semibold text-slate-700">
                  {ENTRY_TYPE_LABELS[r.entry_type] ?? r.entry_type} — {r.original_reference}
                </p>
                <p className="text-xs text-slate-400">{new Date(r.reversed_at).toLocaleString('en-RW')}</p>
              </div>
              <p className="text-xs text-slate-500 mt-1">Reversed by {r.reversed_by_name} · originally dated {new Date(r.original_entry_date).toLocaleDateString('en-RW')}</p>
              <p className="text-xs text-slate-600 mt-1 italic">"{r.reason}"</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
