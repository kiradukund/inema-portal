import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase'
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
    if (app.status === 'rejected') return err('Application already rejected')

    const { data: { user } } = await supabase.auth.getUser()

    // If previously approved, cancel the loan
    if (app.status === 'approved') {
      const { data: loan } = await supabase.from('loans').select('id').eq('application_id', id).single()
      if (loan) {
        await supabase.from('loans').update({ status: 'cancelled' }).eq('id', loan.id)
        await supabase.from('repayment_schedules').delete().eq('loan_id', loan.id)
      }
      await supabase.from('imported_loans')
        .update({ status: 'paid', notes: `CANCELLED: ${review_notes}` })
        .ilike('notes', `%${app.application_number}%`)
    }

    const { error } = await supabase.from('loan_applications').update({
      status: 'rejected', reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(), review_notes,
    }).eq('id', id)
    if (error) return serverError(error)

    // Send email — get email from auth (most reliable source)
    try {
      const adminClient = createAdminClient()
      const { data: authUser } = await adminClient.auth.admin.getUserById(app.client_id)
      const clientEmail = authUser?.user?.email
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', app.client_id).single()

      console.log('Sending rejection email to:', clientEmail)

      if (clientEmail) {
        await sendLoanRejection({
          clientEmail,
          clientName: profile?.full_name ?? 'Client',
          applicationNumber: app.application_number,
          loanType: app.loan_type,
          amount: app.requested_amount,
          reviewNotes: review_notes,
        })
        console.log('Rejection email sent successfully')
      }
    } catch (e) {
      console.error('Rejection email error:', e)
    }

    return ok({ message: app.status === 'approved' ? 'Loan cancelled.' : 'Application rejected.' })
  } catch (e) { return serverError(e) }
}
