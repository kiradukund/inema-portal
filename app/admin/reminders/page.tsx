import { requireAdmin, formatRWF, daysUntil } from '@/lib/admin'
import { createServerSupabaseClient } from '@/lib/supabase'
import { StaleDataBanner } from '../StaleDataBanner'

export default async function AdminReminders() {
  await requireAdmin()
  const supabase = await createServerSupabaseClient()

  const today = new Date().toISOString().split('T')[0]
  const in7days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const in14days = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

  const { data: clients } = await supabase.from('imported_clients').select('full_name, phone')
  const clientPhones = Object.fromEntries((clients ?? []).map(c => [c.full_name, c.phone]))

  const { data: overdueInst } = await supabase
    .from('installments')
    .select('*, imported_loans(client_name, principal)')
    .in('status', ['not paid', 'partial'])
    .lt('due_date', today)
    .order('due_date')

  const { data: dueWeekInst } = await supabase
    .from('installments')
    .select('*, imported_loans(client_name, principal)')
    .eq('status', 'not paid')
    .gte('due_date', today)
    .lte('due_date', in7days)
    .order('due_date')

  const { data: due14Inst } = await supabase
    .from('installments')
    .select('*, imported_loans(client_name, principal)')
    .eq('status', 'not paid')
    .gt('due_date', in7days)
    .lte('due_date', in14days)
    .order('due_date')

  const { data: overdueLoans } = await supabase
    .from('imported_loans')
    .select('*')
    .neq('status', 'paid')
    .eq('has_installments', false)
    .lt('repayment_date', today)

  const { data: dueWeekLoans } = await supabase
    .from('imported_loans')
    .select('*')
    .neq('status', 'paid')
    .eq('has_installments', false)
    .gte('repayment_date', today)
    .lte('repayment_date', in7days)

  type InstRow = { id: string; due_date: string; amount: number; amount_paid: number; num: number; imported_loans: { client_name: string } | null }
  type LoanRow = { id: string; client_name: string; repayment_date: string; total_due: number; amount_paid: number }

  function Card({ name, phone, dueDate, amount, label }: { name: string; phone?: string; dueDate: string; amount: number; label?: string }) {
    const days = daysUntil(dueDate)
    const isOverdue = days < 0
    const waNum = (phone ?? '').replace(/\D/g, '')
    const waMsg = encodeURIComponent(`Dear ${name}, this is a reminder from INEMA Financial Solutions Ltd. Your payment of ${formatRWF(amount)} was due on ${dueDate}. Please contact us to arrange payment. Thank you.`)
    return (
      <div className={`flex items-center justify-between p-4 rounded-xl border ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
        <div>
          <p className={`font-semibold text-sm ${isOverdue ? 'text-red-800' : 'text-slate-800'}`}>{name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Due: {dueDate} · <span className={`font-semibold ${isOverdue ? 'text-red-600' : days <= 3 ? 'text-amber-600' : 'text-slate-600'}`}>
              {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'TODAY' : `${days} days`}
            </span>
            {label && <> · <span className="text-purple-600">{label}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-bold text-sm text-slate-800">{formatRWF(amount)}</p>
            {phone && <p className="text-xs text-slate-400">{phone}</p>}
          </div>
          {phone && (
            <div className="flex flex-col gap-1">
              <a href={`https://wa.me/${waNum}?text=${waMsg}`} target="_blank"
                className="bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-green-600 whitespace-nowrap">
                💬 WhatsApp
              </a>
              <a href={`tel:${phone}`} className="bg-slate-100 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-slate-200 text-center">
                📞 Call
              </a>
            </div>
          )}
        </div>
      </div>
    )
  }

  const totalOverdue = (overdueInst?.length ?? 0) + (overdueLoans?.length ?? 0)
  const totalDueWeek = (dueWeekInst?.length ?? 0) + (dueWeekLoans?.length ?? 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <StaleDataBanner currentHref="/admin" currentLabel="Dashboard (real overdue/maturing alerts)" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Payment Reminders</h1>
        <p className="text-slate-500 text-sm mt-1">
          {totalOverdue > 0 && <span className="text-red-600 font-semibold">{totalOverdue} overdue · </span>}
          {totalDueWeek > 0 && <span className="text-amber-600 font-semibold">{totalDueWeek} due this week · </span>}
          WhatsApp messages are pre-filled for you
        </p>
      </div>

      {totalOverdue > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-red-800 text-lg">🔴 Overdue — Contact Immediately</h2>
            <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">{totalOverdue}</span>
          </div>
          <div className="space-y-3">
            {overdueInst?.map((inst: InstRow) => {
              const name = inst.imported_loans?.client_name ?? 'Unknown'
              return <Card key={inst.id} name={name} phone={clientPhones[name]} dueDate={inst.due_date}
                amount={(inst.amount ?? 0) - (inst.amount_paid ?? 0)} label={`Instalment ${inst.num}`} />
            })}
            {overdueLoans?.map((loan: LoanRow) => (
              <Card key={loan.id} name={loan.client_name} phone={clientPhones[loan.client_name]}
                dueDate={loan.repayment_date} amount={(loan.total_due ?? 0) - (loan.amount_paid ?? 0)} />
            ))}
          </div>
        </div>
      )}

      {totalDueWeek > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-amber-800 text-lg">⚠️ Due This Week</h2>
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-full">{totalDueWeek}</span>
          </div>
          <div className="space-y-3">
            {dueWeekInst?.map((inst: InstRow) => {
              const name = inst.imported_loans?.client_name ?? 'Unknown'
              return <Card key={inst.id} name={name} phone={clientPhones[name]} dueDate={inst.due_date}
                amount={inst.amount} label={`Instalment ${inst.num}`} />
            })}
            {dueWeekLoans?.map((loan: LoanRow) => (
              <Card key={loan.id} name={loan.client_name} phone={clientPhones[loan.client_name]}
                dueDate={loan.repayment_date} amount={(loan.total_due ?? 0) - (loan.amount_paid ?? 0)} />
            ))}
          </div>
        </div>
      )}

      {(due14Inst?.length ?? 0) > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-blue-800 text-lg">📅 Due in 7–14 Days</h2>
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">{due14Inst?.length}</span>
          </div>
          <div className="space-y-3">
            {due14Inst?.map((inst: InstRow) => {
              const name = inst.imported_loans?.client_name ?? 'Unknown'
              return <Card key={inst.id} name={name} phone={clientPhones[name]} dueDate={inst.due_date}
                amount={inst.amount} label={`Instalment ${inst.num}`} />
            })}
          </div>
        </div>
      )}

      {totalOverdue === 0 && totalDueWeek === 0 && (due14Inst?.length ?? 0) === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-100">
          <p className="text-5xl mb-4">✅</p>
          <p className="text-slate-600 font-semibold">No urgent reminders right now</p>
          <p className="text-slate-400 text-sm mt-2">All payments are up to date</p>
        </div>
      )}
    </div>
  )
}
