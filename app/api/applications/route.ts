import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { LoanApplicationSchema } from '@/lib/validations'
import { LOAN_LIMITS } from '@/lib/calculator'
import { ok, err, unauthorized, serverError } from '@/lib/api'
import { sendApplicationConfirmation } from '@/lib/email'
import { checkApplicationLimit, getClientIp, rateLimitResponse } from '@/lib/ratelimit'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()
    const { data, error } = await supabase
      .from('loan_applications').select('*').eq('client_id', user.id)
      .order('created_at', { ascending: false })
    if (error) return serverError(error)
    return ok(data)
  } catch (e) { return serverError(e) }
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 applications per hour per IP
  const ip = getClientIp(req)
  const { success } = checkApplicationLimit(ip)
  if (!success) return rateLimitResponse()

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const body = await req.json()
    const parsed = LoanApplicationSchema.strip().safeParse(body)
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation error')

    const { loan_type, requested_amount, requested_term_months } = parsed.data
    const limits = LOAN_LIMITS[loan_type]
    if (requested_amount < limits.min || requested_amount > limits.max)
      return err(`Amount must be between RWF ${limits.min.toLocaleString()} and RWF ${limits.max.toLocaleString()}`)
    if (requested_term_months > limits.maxMonths)
      return err(`Maximum term for ${loan_type} is ${limits.maxMonths} month(s)`)

    const { data: activeLoans } = await supabase
      .from('loans').select('id').eq('client_id', user.id).in('status', ['active', 'disbursed'])
    if (activeLoans && activeLoans.length > 0)
      return err('You have an active loan. Complete repayment before applying again.', 409)

    // Generated via a Postgres sequence (next_application_number() RPC),
    // not counted from existing rows — a count-then-insert approach races
    // under concurrent submissions and also collides with existing rows
    // whenever any row has ever been deleted, since count() no longer
    // matches the highest number actually in use.
    const { data: application_number, error: seqError } = await supabase.rpc('next_application_number')
    if (seqError || !application_number) return serverError(seqError ?? new Error('Failed to generate application number'))

    const { data: application, error: insertError } = await supabase
      .from('loan_applications')
      .insert({ ...parsed.data, client_id: user.id, application_number, status: 'submitted', submitted_at: new Date().toISOString() })
      .select().single()

    if (insertError) return serverError(insertError)

    try {
      const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single()
      const emailAddr = profile?.email ?? (await supabase.auth.getUser()).data.user?.email
      if (emailAddr) {
        await sendApplicationConfirmation({
          clientEmail: emailAddr, clientName: profile?.full_name ?? 'Client',
          applicationNumber: application_number, loanType: loan_type,
          amount: requested_amount, termMonths: requested_term_months,
        })
      }
    } catch (e) { console.error('Confirmation email failed:', e) }

    return ok({ message: 'Application submitted. Our team reviews within 24 hours.', application }, 201)
  } catch (e) { return serverError(e) }
}
