import { createServerSupabaseClient } from '@/lib/supabase'
import { ok, serverError } from '@/lib/api'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
    return ok({ message: 'Logged out successfully.' })
  } catch (e) {
    return serverError(e)
  }
}
