import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin'
import { ok, err, serverError } from '@/lib/api'

// POST /api/admin/loans/[id]/payments — record a payment against a portal
// loan (the client-facing `loans`/`repayment_schedules` tables, not
// iacm_loans/iacm_payments — that's a separate, unrelated accounting system).
// Distributes the amount across unpaid schedules oldest-first so the
// client's own /loans and /dashboard reflect it immediately.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id: loanId } = await params
    const body = await req.json().catch(() => ({}))
    const amount = Number(body.amount)
    const paymentDate = body.payment_date as string | undefined
    const paymentMethod = body.payment_method as string | undefined
    const notes = body.notes as string | undefined

    if (!amount || amount <= 0) return err('Amount must be greater than 0')
    if (!paymentDate) return err('Payment date is required')

    const adminSupabase = createAdminClient()
    const { data: loan, error: loanErr } = await adminSupabase
      .from('loans').select('*, repayment_schedules(*)').eq('id', loanId).single()
    if (loanErr || !loan) return err('Loan not found', 404)

    const schedules = (loan.repayment_schedules ?? []).sort((a: any, b: any) => a.month_number - b.month_number)
    let remaining = amount
    const noteLine = `${paymentDate} — ${paymentMethod ?? 'Payment'}${notes ? `: ${notes}` : ''}`

    for (const s of schedules) {
      if (remaining <= 0) break
      const outstanding = Number(s.total_due) - Number(s.amount_paid ?? 0)
      if (outstanding <= 0) continue

      const applied = Math.min(remaining, outstanding)
      const newAmountPaid = Number(s.amount_paid ?? 0) + applied
      const fullyPaid = newAmountPaid >= Number(s.total_due)

      const { error: updErr } = await adminSupabase.from('repayment_schedules').update({
        amount_paid: newAmountPaid,
        status: fullyPaid ? 'paid' : s.status,
        paid_at: fullyPaid ? new Date().toISOString() : s.paid_at,
        notes: s.notes ? `${s.notes}\n${noteLine}` : noteLine,
      }).eq('id', s.id)
      if (updErr) return serverError(updErr)

      remaining -= applied
    }

    const { data: refreshedSchedules } = await adminSupabase
      .from('repayment_schedules').select('status').eq('loan_id', loanId)
    const allPaid = (refreshedSchedules ?? []).length > 0 && (refreshedSchedules ?? []).every((s: any) => s.status === 'paid')

    if (allPaid && loan.status !== 'completed') {
      await adminSupabase.from('loans').update({ status: 'completed' }).eq('id', loanId)
    }

    return ok({ message: `Payment of RWF ${amount.toLocaleString()} recorded.`, fully_paid: allPaid, unapplied: remaining })
  } catch (e) { return serverError(e) }
}
