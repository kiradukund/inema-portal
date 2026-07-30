import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import { ok, err, serverError } from '@/lib/api'

// PATCH /api/admin/payment-proofs/[id] — approve or reject a client's
// proof-of-payment upload. Approving does NOT itself record the payment
// against repayment_schedules — the admin still confirms the actual amount
// via "Mark Payment" (POST /api/admin/loans/[id]/payments); this only
// updates the review status so the client isn't left waiting silently.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const status = body.status as string
    if (!['approved', 'rejected'].includes(status)) return err('status must be "approved" or "rejected"')

    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase.from('iacm_payment_proofs').update({ status }).eq('id', id)
    if (error) return serverError(error)

    return ok({ message: `Proof ${status}.` })
  } catch (e) { return serverError(e) }
}
