import { requireAdmin, formatRWF } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'
import { StaleDataBanner } from '../StaleDataBanner'

export default async function AdminClients() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  const { data: clients } = await supabase
    .from('imported_clients')
    .select('*')
    .order('full_name')

  const { data: loans } = await supabase
    .from('imported_loans')
    .select('*')

  const allLoans = loans ?? []

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <StaleDataBanner currentHref="/admin/iacm/loans" currentLabel="Loan Portfolio (current clients & balances)" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clients</h1>
          <p className="text-slate-500 text-sm mt-1">{clients?.length ?? 0} total clients</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Client Name', 'Phone', 'NID', 'Employer', 'Total Loans', 'Total Borrowed', 'Outstanding', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(clients ?? []).map(client => {
                const clientLoans = allLoans.filter(l => l.client_name === client.full_name)
                const totalBorrowed = clientLoans.reduce((s, l) => s + (l.principal ?? 0), 0)
                const totalOutstanding = clientLoans
                  .filter(l => l.status !== 'paid')
                  .reduce((s, l) => s + ((l.total_due ?? 0) - (l.amount_paid ?? 0)), 0)
                const hasOverdue = clientLoans.some(l => l.status === 'overdue')
                const hasActive = clientLoans.some(l => l.status === 'active' || l.status === 'partial')
                const status = hasOverdue ? 'overdue' : hasActive ? 'active' : 'paid'
                const statusStyle = {
                  overdue: 'bg-red-100 text-red-700',
                  active: 'bg-blue-100 text-blue-700',
                  paid: 'bg-green-100 text-green-700',
                }[status]

                return (
                  <tr key={client.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{client.full_name}</p>
                      {client.address && <p className="text-xs text-slate-400">{client.address}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {client.phone ? (
                        <a href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} target="_blank"
                          className="text-green-600 hover:underline font-medium">
                          {client.phone}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{client.nid ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{client.employer ?? '—'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-700">{clientLoans.length}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{formatRWF(totalBorrowed)}</td>
                    <td className="px-4 py-3 font-semibold text-amber-700">{totalOutstanding > 0 ? formatRWF(totalOutstanding) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyle}`}>{status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {(clients?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-slate-500 mb-4">No clients yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
