import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { ok, serverError } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const { error } = await admin
      .from('compliance_deadlines')
      .update({ is_done: true, done_at: new Date().toISOString() })
      .eq('id', params.id)

    if (error) return serverError(error)
    return ok({ message: 'Marked as done' })
  } catch (e) {
    return serverError(e)
  }
}
