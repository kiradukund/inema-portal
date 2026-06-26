import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { RegisterSchema } from '@/lib/validations'
import { ok, err, serverError } from '@/lib/api'
import { sendWelcomeEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? 'Validation error')

    const { full_name, email, phone, password } = parsed.data
    const supabase = createAdminClient()

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: false,
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

    try {
      await sendWelcomeEmail({ clientEmail: email, clientName: full_name })
    } catch (e) { console.error('Welcome email failed:', e) }

    return ok({ message: 'Account created successfully. You can now sign in.', user_id: authData.user.id }, 201)
  } catch (e) { return serverError(e) }
}
