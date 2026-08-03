import { requireAdminApi } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import { ok, err, serverError } from '@/lib/api'

const SIGNED_URL_TTL_SECONDS = 600

// GET /api/admin/applications/[id]/documents — signed download links for an
// application's uploaded documents. Always uses the service-role client:
// the bucket is private with no client-facing storage policies, so this is
// the only path that can read from it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { id } = await params
    const adminSupabase = createAdminClient()

    const { data: application, error } = await adminSupabase
      .from('loan_applications').select('document_urls').eq('id', id).single()
    if (error || !application) return err('Application not found', 404)

    const docs = Array.isArray(application.document_urls) ? application.document_urls : []
    const signed = await Promise.all(docs.map(async (d: any) => {
      const { data } = await adminSupabase.storage
        .from('loan-documents').createSignedUrl(d.path, SIGNED_URL_TTL_SECONDS)
      return { type: d.type, label: d.label, uploaded_at: d.uploaded_at, url: data?.signedUrl ?? null }
    }))

    return ok({ documents: signed })
  } catch (e) { return serverError(e) }
}
