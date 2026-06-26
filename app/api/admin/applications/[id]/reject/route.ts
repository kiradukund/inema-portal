import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { sendLoanRejection } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const body = await req.json().catch(() => ({}))
    const review_notes = body.review_notes ?? 'Application not approved at this time.'

    const { data: app } = await supabase.from('loan_applications').select('*').eq('id', id).single()
    if (!app) return err('Application not found', 404)

    // Allow rejecting submitted OR approved (cancellation)
    if (app.status === 'rejected') return err('Application already rejected')

    const { data: { user } } = await supabase.auth.getUser()

    // If previously approved, also cancel the loan record
    if (app.status === 'approved') {
      // Find and cancel the loan in loans table
      await supabase.from('loans')
        .update({ status: 'cancelled' })
        .eq('application_id', id)

      // Cancel repayment schedules
      const { data: loan } = await supabase.from('loans').select('id').eq('application_id', id).single()
      if (loan) {
        await supabase.from('repayment_schedules')
          .update({ status: 'upcoming' })
          .eq('loan_id', loan.id)
        await supabase.from('loans').update({ status: 'cancelled' }).eq('id', loan.id)
      }

      // Also cancel the imported_loan
      await supabase.from('imported_loans')
        .update({ status: 'paid', notes: `CANCELLED: ${review_notes}` })
        .ilike('notes', `%${app.application_number}%`)
    }

    const { error } = await supabase.from('loan_applications').update({
      status: 'rejected',
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_notes,
    }).eq('id', id)
    if (error) return serverError(error)

    // Send rejection email (non-blocking)
    try {
      const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', app.client_id).single()
      if (profile?.email) {
        await sendLoanRejection({
          clientEmail: profile.email,
          clientName: profile.full_name ?? 'Client',
          applicationNumber: app.application_number,
          loanType: app.loan_type,
          amount: app.requested_amount,
          reviewNotes: review_notes,
        })
      }
    } catch (e) { console.error('Rejection email failed:', e) }

    return ok({ message: app.status === 'approved' ? 'Loan cancelled successfully.' : 'Application rejected.' })
  } catch (e) { return serverError(e) }
}
