import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'
import { ok, err, unauthorized, serverError } from '@/lib/api'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return unauthorized()

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return err('Admin only', 403)

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
