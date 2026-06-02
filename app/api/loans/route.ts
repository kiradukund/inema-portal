import { createServerSupabaseClient } from '@/lib/supabase'
import { ok, unauthorized, serverError } from '@/lib/api'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { data: loans, error } = await supabase
      .from('loans')
      .select('*, repayment_schedules(*)')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return serverError(error)
    return ok(loans)
  } catch (e) {
    return serverError(e)
  }
}
