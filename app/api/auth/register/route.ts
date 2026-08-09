import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { RegisterSchema } from '@/lib/validations'
import { ok, err, serverError } from '@/lib/api'
import { sendWelcomeEmail } from '@/lib/email'
import { checkRegisterLimit, getClientIp, rateLimitResponse } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  // Rate limit: 3 registrations per hour per IP
  const ip = getClientIp(req)
  const { success } = await checkRegisterLimit(ip)
  if (!success) return rateLimitResponse()

  try {
    const body = await req.json()
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? 'Validation error')

    const { full_name, email, phone, password } = parsed.data
    const supabase = createAdminClient()

    // Email confirmation adds no real security value here — identity is
    // already verified via document upload at the loan application step —
    // and with no confirmation-link email ever actually sent, `false` here
    // left every registrant permanently unable to log in.
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name, phone },
    })

    if (authError) {
      if (authError.message.includes('already registered')) return err('An account with this email already exists.', 409)
      return err(authError.message)
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id, full_name, email, phone, role: 'client', crb_consent: false,
    })

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      return serverError(profileError)
    }

    try { await sendWelcomeEmail({ clientEmail: email, clientName: full_name }) }
    catch (e) { console.error('Welcome email failed:', e) }

    return ok({ message: 'Account created successfully. You can now sign in.', user_id: authData.user.id }, 201)
  } catch (e) { return serverError(e) }
}
