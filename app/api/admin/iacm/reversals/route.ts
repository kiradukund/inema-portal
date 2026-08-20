import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { reverseTransaction } from '@/lib/ledger'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { journal_entry_id, reason, acknowledged_pre_cutoff } = await req.json()
    if (!journal_entry_id || !reason) return err('Missing required fields')

    const supabase = createAdminClient()
    const result = await reverseTransaction(supabase, {
      journal_entry_id,
      reason,
      acknowledged_pre_cutoff: Boolean(acknowledged_pre_cutoff),
      reversed_by_user_id: auth.user.id,
      reversed_by_name: auth.profile.full_name,
    })
    if (result.error) return err(result.error)

    return ok({ reversal_id: result.reversal_id })
  } catch (e) { return serverError(e) }
}

// Used by the Journal page's "Reversal History" section.
export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('iacm_reversals').select('*').order('reversed_at', { ascending: false }).limit(50)
    if (error) return serverError(error)
    return ok(data)
  } catch (e) { return serverError(e) }
}
