import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { calculateLoan } from '@/lib/calculator'
import type { LoanType } from '@/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const body = await req.json().catch(() => ({}))

    // Fetch application
    const { data: app, error: fetchErr } = await supabase
      .from('loan_applications').select('*').eq('id', id).single()
    if (fetchErr || !app) return err('Application not found', 404)
    if (app.status !== 'submitted') return err('Application already processed')

    const approved_amount = body.approved_amount ? Number(body.approved_amount) : Number(app.requested_amount)
    const approved_term = body.approved_term_months ? Number(body.approved_term_months) : Number(app.requested_term_months)
    const review_notes = body.review_notes ?? ''

    // Calculate repayment schedule
    const calc = calculateLoan({ principal: approved_amount, term_months: approved_term, loan_type: app.loan_type as LoanType })

    // Get admin user
    const { data: { user } } = await supabase.auth.getUser()

    // 1. Update application status
    const { error: updateErr } = await supabase.from('loan_applications').update({
      status: 'approved',
      approved_amount,
      approved_term_months: approved_term,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_notes,
    }).eq('id', id)
    if (updateErr) return serverError(updateErr)

    // 2. Fetch client profile
    const { data: profile } = await supabase.from('profiles').select('full_name, phone, employer_name').eq('id', app.client_id).single()
    const clientName = profile?.full_name ?? 'Client'
    const clientPhone = profile?.phone ?? ''

    // 3. Count existing imported loans to get sequence number
    const { count: loanCount } = await supabase.from('imported_loans').select('*', { count: 'exact', head: true })
    const year = new Date().getFullYear()
    const loanNumber = `LN-${year}-${String((loanCount ?? 0) + 1).padStart(4, '0')}`

    const startDate = new Date()
    const repayDate = new Date(startDate)
    repayDate.setMonth(repayDate.getMonth() + approved_term)

    // 4. Create imported_loan record
    const { data: loan, error: loanErr } = await supabase.from('imported_loans').insert({
      client_name: clientName,
      principal: approved_amount,
      loan_type: app.loan_type,
      term_months: approved_term,
      date_offered: startDate.toISOString().split('T')[0],
      repayment_date: repayDate.toISOString().split('T')[0],
      total_due: calc.total_repayment,
      amount_paid: 0,
      outstanding: calc.total_repayment,
      status: 'active',
      has_installments: true,
      notes: `Portal application ${app.application_number}. ${review_notes}`,
      source: 'portal',
    }).select().single()
    if (loanErr) return serverError(loanErr)

    // 5. Create installment schedule
    const installments = calc.schedule.map((s, i) => ({
      loan_id: loan.id,
      client_name: clientName,
      num: i + 1,
      amount: s.total_payment,
      due_date: s.due_date,
      status: 'not paid',
      amount_paid: 0,
    }))
    await supabase.from('installments').insert(installments)

    // 6. Create loans table entry for client portal view
    await supabase.from('loans').insert({
      client_id: app.client_id,
      application_id: id,
      loan_number: loanNumber,
      loan_type: app.loan_type,
      principal: approved_amount,
      term_months: approved_term,
      status: 'active',
      disbursed_at: new Date().toISOString(),
      total_repayment: calc.total_repayment,
    }).select()

    return ok({
      message: `Loan approved for ${clientName}. RWF ${approved_amount.toLocaleString()} for ${approved_term} month(s).`,
      loan_id: loan.id,
      client_phone: clientPhone,
      total_repayment: calc.total_repayment,
      schedule: calc.schedule,
    })
  } catch (e) { return serverError(e) }
}
