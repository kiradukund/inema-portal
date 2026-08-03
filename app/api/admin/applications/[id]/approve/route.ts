import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { calculateLoan } from '@/lib/calculator'
import { sendLoanApproval } from '@/lib/email'
import type { LoanType } from '@/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { id } = await params
    // auth.getUser() needs the logged-in admin's session cookie, so this one
    // call stays on the regular client; every table read/write below uses
    // the service-role client so none of it depends on RLS matching the
    // acting admin's own profile row.
    const supabase = await createServerSupabaseClient()
    const adminSupabase = createAdminClient()
    const body = await req.json().catch(() => ({}))

    const { data: app, error: fetchErr } = await adminSupabase.from('loan_applications').select('*').eq('id', id).single()
    if (fetchErr || !app) return err('Application not found', 404)
    if (app.status !== 'submitted') return err('Application already processed')

    const approved_amount = body.approved_amount ? Number(body.approved_amount) : Number(app.requested_amount)
    const approved_term   = body.approved_term_months ? Number(body.approved_term_months) : Number(app.requested_term_months)
    const review_notes    = body.review_notes ?? ''

    const calc = calculateLoan({ principal: approved_amount, term_months: approved_term, loan_type: app.loan_type as LoanType })
    const { data: { user } } = await supabase.auth.getUser()

    await adminSupabase.from('loan_applications').update({
      status: 'approved', approved_amount, approved_term_months: approved_term,
      reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_notes,
    }).eq('id', id)

    const { data: profile } = await adminSupabase.from('profiles').select('full_name, phone, email').eq('id', app.client_id).single()
    const clientName = profile?.full_name ?? 'Client'

    const { count: loanCount } = await adminSupabase.from('imported_loans').select('*', { count: 'exact', head: true })
    const loanNumber = `LN-${new Date().getFullYear()}-${String((loanCount ?? 0) + 1).padStart(4, '0')}`
    const startDate  = new Date()
    const repayDate  = new Date(startDate)
    repayDate.setMonth(repayDate.getMonth() + approved_term)

    const { data: importedLoan } = await adminSupabase.from('imported_loans').insert({
      client_name: clientName, principal: approved_amount, loan_type: app.loan_type,
      term_months: approved_term, date_offered: startDate.toISOString().split('T')[0],
      repayment_date: repayDate.toISOString().split('T')[0], total_due: calc.total_repayment,
      amount_paid: 0, outstanding: calc.total_repayment, status: 'active',
      has_installments: true, notes: `Portal app ${app.application_number}. ${review_notes}`, source: 'portal',
    }).select().single()

    if (importedLoan) {
      const installments = calc.schedule.map((s: any, i: number) => ({
        loan_id: importedLoan.id, client_name: clientName, num: i + 1,
        amount: s.total_payment, due_date: s.due_date, status: 'not paid', amount_paid: 0,
      }))
      await adminSupabase.from('installments').insert(installments)
    }

    const { data: clientLoan, error: loanErr } = await adminSupabase.from('loans').insert({
      client_id: app.client_id,
      application_id: id,
      loan_number: loanNumber,
      loan_type: app.loan_type,
      principal: approved_amount,
      term_months: approved_term,
      monthly_interest_rate: 0.05,
      upfront_fee_rate: 0.04,
      vat_rate: 0.18,
      late_payment_rate: 0.05,
      upfront_fee_amount: calc.month1_fee,
      vat_amount: calc.month1_vat,
      total_interest: calc.total_interest,
      total_repayment: calc.total_repayment,
      month1_payment: calc.month1_total,
      monthly_payment: calc.subsequent_monthly,
      status: 'active',
      disbursed_at: new Date().toISOString(),
      due_date: repayDate.toISOString(),
    }).select().single()

    if (loanErr) return serverError(loanErr)

    // FIX: repayment_schedules also requires client_id (NOT NULL)
    const repaymentSchedules = calc.schedule.map((s: any, i: number) => ({
      loan_id: clientLoan.id,
      client_id: app.client_id,
      month_number: i + 1,
      due_date: s.due_date,
      interest_amount: s.interest,
      fee_amount: s.fee_amount,
      total_due: s.total_payment,
      amount_paid: 0,
      status: 'upcoming',
      late_fee: 0,
    }))
    const { error: schedErr } = await adminSupabase.from('repayment_schedules').insert(repaymentSchedules)
    if (schedErr) return serverError(schedErr)

    try {
      if (profile?.email) {
        await sendLoanApproval({
          clientEmail: profile.email, clientName, loanNumber,
          loanType: app.loan_type, amount: approved_amount, termMonths: approved_term,
          totalRepayment: calc.total_repayment, month1Payment: calc.month1_total,
          monthlyPayment: calc.subsequent_monthly, schedule: calc.schedule,
        })
      } else {
        console.error('No client email for approval notification, client_id:', app.client_id)
      }
    } catch (e) { console.error('Approval email failed (non-fatal):', e) }

    return ok({
      message: `Approved for ${clientName}. RWF ${approved_amount.toLocaleString()} / ${approved_term}mo.`,
      loan_id: clientLoan.id, client_phone: profile?.phone ?? '', total_repayment: calc.total_repayment,
    })
  } catch (e) { return serverError(e) }
}
