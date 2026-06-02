import { createServerSupabaseClient } from '@/lib/supabase'
import { UpdateProfileSchema } from '@/lib/validations'
import { ok, err, unauthorized, serverError } from '@/lib/api'
import { NextRequest } from 'next/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { data: profile, error } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()

    if (error) return err('Profile not found', 404)
    return ok(profile)
  } catch (e) {
    return serverError(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const body = await req.json()
    const parsed = UpdateProfileSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? 'Validation error')

    const { data: profile, error } = await supabase
      .from('profiles')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', user.id).select().single()

    if (error) return serverError(error)
    return ok(profile)
  } catch (e) {
    return serverError(e)
  }
}
