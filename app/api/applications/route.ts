import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { LoanApplicationSchema } from '@/lib/validations'
import { generateApplicationNumber, LOAN_LIMITS } from '@/lib/calculator'
import { ok, err, unauthorized, serverError } from '@/lib/api'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { data, error } = await supabase
      .from('loan_applications')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return serverError(error)
    return ok(data)
  } catch (e) {
    return serverError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const body = await req.json()
    const parsed = LoanApplicationSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? 'Validation error')

    const { loan_type, requested_amount, requested_term_months } = parsed.data
    const limits = LOAN_LIMITS[loan_type]

    if (requested_amount < limits.min || requested_amount > limits.max) {
      return err(`Amount for ${loan_type} must be between RWF ${limits.min.toLocaleString()} and RWF ${limits.max.toLocaleString()}`)
    }
    if (requested_term_months > limits.maxMonths) {
      return err(`Maximum term for ${loan_type} is ${limits.maxMonths} month(s)`)
    }

    // Block if active loan exists
    const { data: activeLoans } = await supabase
      .from('loans').select('id').eq('client_id', user.id).in('status', ['active', 'disbursed'])
    if (activeLoans && activeLoans.length > 0) {
      return err('You have an active loan. Please complete repayment before applying for a new one.', 409)
    }

    const { count } = await supabase
      .from('loan_applications').select('*', { count: 'exact', head: true })
    const application_number = generateApplicationNumber((count ?? 0) + 1)

    const { data: application, error: insertError } = await supabase
      .from('loan_applications')
      .insert({
        ...parsed.data,
        client_id: user.id,
        application_number,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .select().single()

    if (insertError) return serverError(insertError)

    return ok({
      message: 'Application submitted successfully. Our team will review within 24 hours.',
      application,
    }, 201)
  } catch (e) {
    return serverError(e)
  }
}
