import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { ContactSchema } from '@/lib/validations'
import { ok, err, serverError } from '@/lib/api'

// POST /api/contact — save contact form message to database
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = ContactSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? 'Validation error')

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('contact_messages')
      .insert({
        full_name: parsed.data.full_name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        loan_type: parsed.data.loan_type || null,
        message: parsed.data.message,
        is_read: false,
      })
      .select()
      .single()

    if (error) return serverError(error)

    return ok({
      message: 'Message received. Our team will contact you within a few hours.',
      id: data.id,
    }, 201)

  } catch (e) {
    return serverError(e)
  }
}
