import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'
import { ok, err, unauthorized, forbidden, serverError } from '@/lib/api'
import { isAllowedUpload, UPLOAD_REJECT_MESSAGE } from '@/lib/file-validation'

// POST /api/loans/[id]/payment-proof — client uploads proof of a payment
// against their own portal loan. Runs through the service-role client
// (iacm_payment_proofs has RLS disabled entirely, and the storage bucket is
// private with no client-facing policies), so ownership of the loan is
// checked explicitly here first.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: loanId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const adminSupabase = createAdminClient()
    const { data: loan, error: loanErr } = await adminSupabase
      .from('loans').select('id, client_id').eq('id', loanId).single()
    if (loanErr || !loan) return err('Loan not found', 404)
    if (loan.client_id !== user.id) return forbidden()

    const formData = await req.formData()
    const file = formData.get('file')
    const amount = formData.get('amount')
    const paymentDate = formData.get('payment_date')
    const notes = formData.get('notes')

    if (!(file instanceof File)) return err('No file provided')
    if (!amount || !paymentDate) return err('Amount and payment date are required')

    const buffer = Buffer.from(await file.arrayBuffer())
    if (!isAllowedUpload(buffer, file.size)) return err(UPLOAD_REJECT_MESSAGE)

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${user.id}/payments/${loanId}/${Date.now()}_${safeName}`

    const { error: uploadErr } = await adminSupabase.storage
      .from('loan-documents')
      .upload(path, buffer, { contentType: file.type, upsert: true })
    if (uploadErr) return serverError(uploadErr)

    const { error: insertErr } = await adminSupabase.from('iacm_payment_proofs').insert({
      loan_id: loanId,
      client_id: user.id,
      payment_date: String(paymentDate),
      amount: Number(amount),
      file_url: path,
      status: 'pending',
      notes: notes ? String(notes) : null,
    })
    if (insertErr) return serverError(insertErr)

    return ok({ message: 'Payment proof uploaded. Our team will review it shortly.' })
  } catch (e) { return serverError(e) }
}
