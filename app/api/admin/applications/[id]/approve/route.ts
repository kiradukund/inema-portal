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

    const { data: app, error: fetchErr } = await supabase.from('loan_applications').select('*').eq('id', id).single()
    if (fetchErr || !app) return err('Application not found', 404)
    if (app.status !== 'submitted') return err('Application already processed')

    const approved_amount = body.approved_amount ? Number(body.approved_amount) : Number(app.requested_amount)
    const approved_term   = body.approved_term_months ? Number(body.approved_term_months) : Number(app.requested_term_months)
    const review_notes    = body.review_notes ?? ''

    const calc = calculateLoan({ principal: approved_amount, term_months: approved_term, loan_type: app.loan_type as LoanType })
    const { data: { user } } = await supabase.auth.getUser()

    // 1. Update application status
    await supabase.from('loan_applications').update({
      status: 'approved', approved_amount, approved_term_months: approved_term,
      reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_notes,
    }).eq('id', id)

    // 2. Fetch client profile
    const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', app.client_id).single()
    const clientName = profile?.full_name ?? 'Client'

    // 3. Create imported_loan record (for admin dashboard)
    const { count: loanCount } = await supabase.from('imported_loans').select('*', { count: 'exact', head: true })
    const loanNumber = `LN-${new Date().getFullYear()}-${String((loanCount ?? 0) + 1).padStart(4, '0')}`
    const startDate  = new Date()
    const repayDate  = new Date(startDate)
    repayDate.setMonth(repayDate.getMonth() + approved_term)

    const { data: importedLoan } = await supabase.from('imported_loans').insert({
      client_name: clientName, principal: approved_amount, loan_type: app.loan_type,
      term_months: approved_term, date_offered: startDate.toISOString().split('T')[0],
      repayment_date: repayDate.toISOString().split('T')[0], total_due: calc.total_repayment,
      amount_paid: 0, outstanding: calc.total_repayment, status: 'active',
      has_installments: true, notes: `Portal app ${app.application_number}. ${review_notes}`, source: 'portal',
    }).select().single()

    // 4. Create installments (for admin view)
    if (importedLoan) {
      const installments = calc.schedule.map((s, i) => ({
        loan_id: importedLoan.id, client_name: clientName, num: i + 1,
        amount: s.total_payment, due_date: s.due_date, status: 'not paid', amount_paid: 0,
      }))
      await supabase.from('installments').insert(installments)
    }

    // 5. Create loan record in loans table (for CLIENT portal)
    const { data: clientLoan, error: loanErr } = await supabase.from('loans').insert({
      client_id:          app.client_id,
      application_id:     id,
      loan_number:        loanNumber,
      loan_type:          app.loan_type,
      principal:          approved_amount,
      term_months:        approved_term,
      status:             'active',
      disbursed_at:       new Date().toISOString(),
      total_repayment:    calc.total_repayment,
      total_interest:     calc.total_interest,
      upfront_fee_amount: calc.month1_fee,
      vat_amount:         calc.month1_vat,
      month1_payment:     calc.month1_total,
      monthly_payment:    calc.subsequent_monthly,
    }).select().single()

    if (loanErr) return serverError(loanErr)

    // 6. Create repayment_schedules (for CLIENT portal repayment table)
    const repaymentSchedules = calc.schedule.map((s, i) => ({
      loan_id:         clientLoan.id,
      month_number:    i + 1,
      due_date:        s.due_date,
      interest_amount: s.interest,
      fee_amount:      s.fee_amount,
      total_due:       s.total_payment,
      amount_paid:     0,
      status:          'upcoming',
      late_fee:        0,
    }))
    const { error: schedErr } = await supabase.from('repayment_schedules').insert(repaymentSchedules)
    if (schedErr) return serverError(schedErr)

    return ok({
      message: `Approved for ${clientName}. RWF ${approved_amount.toLocaleString()} / ${approved_term}mo.`,
      loan_id: clientLoan.id,
      client_phone: profile?.phone ?? '',
      total_repayment: calc.total_repayment,
    })
  } catch (e) { return serverError(e) }
}
