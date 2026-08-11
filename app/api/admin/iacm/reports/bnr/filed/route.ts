import { requireAdminApi } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import { ok, serverError } from '@/lib/api'

const SIGNED_URL_TTL_SECONDS = 600
const BUCKET = 'bnr-filed-reports'

// GET /api/admin/iacm/reports/bnr/filed — lists every filed BNR report with
// a signed download link. Same pattern as
// app/api/admin/applications/[id]/documents/route.ts: the bucket is
// private with no client-facing storage policies, so the service-role
// client is the only path that can read from it.
export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const { data: reports, error } = await supabase
      .from('iacm_bnr_filed_reports')
      .select('*')
      .order('period_end_date', { ascending: false })
    if (error) return serverError(error)

    const withLinks = await Promise.all((reports ?? []).map(async (r: any) => {
      const { data } = await supabase.storage
        .from(BUCKET).createSignedUrl(r.storage_path, SIGNED_URL_TTL_SECONDS)
      return { ...r, download_url: data?.signedUrl ?? null }
    }))

    return ok({ reports: withLinks })
  } catch (e) { return serverError(e) }
}
