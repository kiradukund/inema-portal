import { requireAdminApi } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import { ok, serverError } from '@/lib/api'

const SIGNED_URL_TTL_SECONDS = 600
const BUCKET = 'crb-filed-reports'

// GET /api/admin/iacm/reports/crb/filed — lists every archived CRB report
// with a signed download link. Same pattern as the BNR filed route: the
// bucket is private with no client-facing storage policies, so only the
// service-role client can read from it.
export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const { data: reports, error } = await supabase
      .from('iacm_crb_filed_reports')
      .select('*')
      .order('submission_date', { ascending: false })
    if (error) return serverError(error)

    const withLinks = await Promise.all((reports ?? []).map(async (r: any) => {
      const { data } = await supabase.storage
        .from(BUCKET).createSignedUrl(r.storage_path, SIGNED_URL_TTL_SECONDS)
      return { ...r, download_url: data?.signedUrl ?? null }
    }))

    return ok({ reports: withLinks })
  } catch (e) { return serverError(e) }
}
