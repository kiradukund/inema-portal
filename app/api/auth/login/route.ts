import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { LoginSchema } from '@/lib/validations'
import { ok, err, serverError } from '@/lib/api'
import { checkLoginLimit, getClientIp, rateLimitResponse } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  // Rate limit: 5 attempts per 60 seconds per IP
  const ip = getClientIp(req)
  const { success } = checkLoginLimit(ip)
  if (!success) return rateLimitResponse()

  try {
    const body = await req.json()
    const parsed = LoginSchema.safeParse(body)
    if (!parsed.success) return err('Invalid email or password')

    const { email, password } = parsed.data
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // 'email_not_confirmed' is a distinct, real Supabase error code (see
      // node_modules/@supabase/auth-js/dist/main/lib/error-codes.d.ts) —
      // surfaced honestly here instead of folding it into a generic
      // wrong-password message, since the real cause is different and the
      // user needs to know it (manually-added accounts, edge cases, etc.
      // even though normal registration now sets email_confirm: true).
      if (error.code === 'email_not_confirmed') {
        return err('Please confirm your email address before signing in. Contact support if you need help.', 401)
      }
      return err('Invalid email or password', 401)
    }

    const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', data.user.id).single()

    return ok({ user: { id: data.user.id, email: data.user.email, role: profile?.role ?? 'client', full_name: profile?.full_name ?? '' } })
  } catch (e) { return serverError(e) }
}
