import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { ContactSchema } from '@/lib/validations'
import { ok, err, serverError } from '@/lib/api'
import { checkContactLimit, getClientIp, rateLimitResponse } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  // Rate limit: 3 messages per hour per IP
  const ip = getClientIp(req)
  const { success } = checkContactLimit(ip)
  if (!success) return rateLimitResponse()

  try {
    const body = await req.json()
    const parsed = ContactSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation error')

    const supabase = createAdminClient()
    const { error } = await supabase.from('contact_messages').insert({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      loan_type: parsed.data.loan_type || 'general',
      message: parsed.data.message,
      is_read: false,
    })

    if (error) return serverError(error)
    return ok({ message: 'Message received. We will contact you within 24 hours.' })
  } catch (e) { return serverError(e) }
}
