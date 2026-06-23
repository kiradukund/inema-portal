import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 })

    const body = await req.json()
    const {
      loan_type, requested_amount, requested_term_months, purpose, employer,
      has_id_copy, has_payslips, has_bank_statement,
      has_employment_letter, has_marital_certificate,
      fee_consent, crb_consent,
    } = body

    // Validation
    if (!loan_type) return Response.json({ success: false, error: 'Please select a loan type' })
    if (!requested_amount || requested_amount <= 0) return Response.json({ success: false, error: 'Please enter a valid loan amount' })
    if (!requested_term_months || requested_term_months <= 0) return Response.json({ success: false, error: 'Please select a repayment term' })
    if (!purpose) return Response.json({ success: false, error: 'Please describe the purpose of your loan' })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await admin
      .from('loan_applications')
      .insert({
        client_id: user.id,
        loan_type,
        requested_amount: Number(requested_amount),
        requested_term_months: Number(requested_term_months),
        purpose: purpose || null,
        employer: employer || null,
        has_id_copy: has_id_copy ?? false,
        has_payslips: has_payslips ?? false,
        has_bank_statement: has_bank_statement ?? false,
        has_employment_letter: has_employment_letter ?? false,
        has_marital_certificate: has_marital_certificate ?? false,
        has_valuation_report: false,
        fee_consent: fee_consent ?? false,
        crb_consent: crb_consent ?? false,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Application error:', error)
      return Response.json({ success: false, error: error.message })
    }

    return Response.json({ success: true, data })
  } catch (e) {
    console.error('Server error:', e)
    return Response.json({ success: false, error: 'Server error. Please try again.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await admin
      .from('loan_applications')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return Response.json({ success: false, error: error.message })
    return Response.json({ success: true, data })
  } catch (e) {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
