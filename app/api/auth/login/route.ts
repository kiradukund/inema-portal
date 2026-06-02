import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { LoginSchema } from '@/lib/validations'
import { ok, err, serverError } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = LoginSchema.safeParse(body)
    if (!parsed.success) {
      return err(parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? 'Validation error')
    }

    const { email, password } = parsed.data
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return err('Invalid email or password.', 401)
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()

    return ok({
      user: {
        id: data.user.id,
        email: data.user.email,
        role: profile?.role ?? 'client',
      },
      profile,
    })

  } catch (e) {
    return serverError(e)
  }
}
