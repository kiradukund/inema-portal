import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'
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

    const { data: app } = await supabase
      .from('loan_applications').select('*').eq('id', id).single()
    if (!app) return err('Application not found', 404)
    if (app.status === 'rejected') return err('Application already rejected')

    const { data: { user } } = await supabase.auth.getUser()

    // If approved — cancel the active loan for this client
    if (app.status === 'approved') {
      // Try by application_id first, then by client_id + active status
      const { data: loanByAppId } = await supabase
        .from('loans').select('id').eq('application_id', id).maybeSingle()

      const { data: loanByClient } = await supabase
        .from('loans').select('id')
        .eq('client_id', app.client_id)
        .in('status', ['active', 'disbursed'])
        .maybeSingle()

      const loan = loanByAppId ?? loanByClient

      if (loan) {
        await supabase.from('loans').update({ status: 'cancelled' }).eq('id', loan.id)
        // Don't delete repayment_schedules — just mark cancelled so client sees history
      }

      // Cancel imported_loan
      await supabase.from('imported_loans')
        .update({ status: 'paid', notes: `CANCELLED by admin: ${review_notes}` })
        .eq('client_name', (await supabase.from('profiles').select('full_name').eq('id', app.client_id).single()).data?.full_name ?? '')
        .eq('status', 'active')
    }

    const { error } = await supabase.from('loan_applications').update({
      status: 'rejected',
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_notes,
    }).eq('id', id)
    if (error) return serverError(error)

    // Email — get from auth directly
    try {
      const adminClient = createAdminClient()
      const { data: authData } = await adminClient.auth.admin.getUserById(app.client_id)
      const clientEmail = authData?.user?.email
      const { data: profile } = await supabase.from('profiles')
        .select('full_name').eq('id', app.client_id).single()

      if (clientEmail) {
        await sendLoanRejection({
          clientEmail,
          clientName: profile?.full_name ?? 'Client',
          applicationNumber: app.application_number,
          loanType: app.loan_type,
          amount: Number(app.requested_amount),
          reviewNotes: review_notes,
        })
      }
    } catch (e) {
      console.error('Email error:', e)
    }

    return ok({ message: app.status === 'approved' ? 'Loan cancelled.' : 'Application rejected.' })
  } catch (e) { return serverError(e) }
}
