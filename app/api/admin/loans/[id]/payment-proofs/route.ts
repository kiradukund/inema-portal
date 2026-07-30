import { requireAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import { ok, serverError } from '@/lib/api'

const SIGNED_URL_TTL_SECONDS = 600

// GET /api/admin/loans/[id]/payment-proofs — proof-of-payment uploads for a
// portal loan, with signed download links (the storage bucket is private).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id: loanId } = await params
    const adminSupabase = createAdminClient()

    const { data: proofs, error } = await adminSupabase
      .from('iacm_payment_proofs').select('*').eq('loan_id', loanId).order('created_at', { ascending: false })
    if (error) return serverError(error)

    const withUrls = await Promise.all((proofs ?? []).map(async (p: any) => {
      const { data } = await adminSupabase.storage
        .from('loan-documents').createSignedUrl(p.file_url, SIGNED_URL_TTL_SECONDS)
      return { ...p, signed_url: data?.signedUrl ?? null }
    }))

    return ok({ proofs: withUrls })
  } catch (e) { return serverError(e) }
}
