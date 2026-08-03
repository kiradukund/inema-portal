import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { sendLoanRejection } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { id } = await params
    // auth.getUser() needs the logged-in admin's session cookie, so this one
    // call stays on the regular client; every table read/write below uses
    // the service-role client so none of it depends on RLS matching the
    // acting admin's own profile row (profiles RLS only allows auth.uid() =
    // id, which would silently return nothing for any other client's row).
    const supabase = await createServerSupabaseClient()
    const adminClient = createAdminClient()
    const body = await req.json().catch(() => ({}))
    const review_notes = body.review_notes ?? 'Application not approved at this time.'

    const { data: app, error: appErr } = await adminClient.from('loan_applications').select('*').eq('id', id).single()
    if (appErr || !app) return err('Application not found', 404)
    if (app.status === 'rejected') return err('Application already rejected')

    const { data: { user } } = await supabase.auth.getUser()

    // If previously approved, cancel the associated loan
    if (app.status === 'approved') {
      const { data: loanByAppId } = await adminClient
        .from('loans').select('id').eq('application_id', id).maybeSingle()

      let loanToCancel = loanByAppId

      if (!loanToCancel) {
        const { data: loanByClient } = await adminClient
          .from('loans').select('id')
          .eq('client_id', app.client_id)
          .in('status', ['active', 'disbursed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        loanToCancel = loanByClient
      }

      if (loanToCancel) {
        const { error: cancelErr } = await adminClient
          .from('loans').update({ status: 'cancelled' }).eq('id', loanToCancel.id)
        if (cancelErr) {
          console.error('Failed to cancel loan:', cancelErr)
          return serverError(cancelErr)
        }
      }

      // Also mark the imported_loan as inactive (best-effort, non-fatal)
      const { data: profileForCancel } = await adminClient.from('profiles').select('full_name').eq('id', app.client_id).single()
      if (profileForCancel?.full_name) {
        await adminClient.from('imported_loans')
          .update({ status: 'paid', notes: `CANCELLED by admin: ${review_notes}` })
          .eq('client_name', profileForCancel.full_name)
          .eq('status', 'active')
      }
    }

    const { error } = await adminClient.from('loan_applications').update({
      status: 'rejected',
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_notes,
    }).eq('id', id)
    if (error) return serverError(error)

    // Email — non-blocking but logged
    try {
      const { data: authData } = await adminClient.auth.admin.getUserById(app.client_id)
      const clientEmail = authData?.user?.email
      const { data: profile } = await adminClient.from('profiles').select('full_name').eq('id', app.client_id).single()

      if (clientEmail) {
        await sendLoanRejection({
          clientEmail,
          clientName: profile?.full_name ?? 'Client',
          applicationNumber: app.application_number,
          loanType: app.loan_type,
          amount: Number(app.requested_amount),
          reviewNotes: review_notes,
        })
      } else {
        console.error('No client email found for', app.client_id)
      }
    } catch (e) {
      console.error('Rejection email error (non-fatal):', e)
    }

    return ok({ message: app.status === 'approved' ? 'Loan cancelled.' : 'Application rejected.' })
  } catch (e) { return serverError(e) }
}
