import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { ok, err, unauthorized, forbidden, serverError } from '@/lib/api'

// GET /api/loans/[id] — single loan with repayment schedule
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { data: loan, error } = await supabase
      .from('loans')
      .select(`
        *,
        repayment_schedules (
          id,
          month_number,
          due_date,
          interest_amount,
          fee_amount,
          total_due,
          amount_paid,
          paid_at,
          status,
          late_fee,
          notes
        )
      `)
      .eq('id', params.id)
      .single()

    if (error || !loan) return err('Loan not found', 404)

    // Clients can only see their own loans
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'client' && loan.client_id !== user.id) {
      return forbidden()
    }

    // Sort schedule by month number
    if (loan.repayment_schedules) {
      loan.repayment_schedules.sort(
        (a: { month_number: number }, b: { month_number: number }) =>
          a.month_number - b.month_number
      )
    }

    // Calculate summary stats
    const schedule = loan.repayment_schedules ?? []
    const totalPaid = schedule.reduce(
      (sum: number, s: { amount_paid: number }) => sum + (s.amount_paid ?? 0), 0
    )
    const totalRemaining = loan.total_repayment - totalPaid
    const nextDue = schedule.find(
      (s: { status: string }) => s.status === 'upcoming' || s.status === 'due' || s.status === 'overdue'
    )

    return ok({
      ...loan,
      summary: {
        total_paid: totalPaid,
        total_remaining: totalRemaining,
        months_completed: schedule.filter((s: { status: string }) => s.status === 'paid').length,
        months_remaining: schedule.filter((s: { status: string }) => s.status !== 'paid').length,
        next_due: nextDue ?? null,
        is_overdue: schedule.some((s: { status: string }) => s.status === 'overdue'),
      },
    })
  } catch (e) {
    return serverError(e)
  }
}
