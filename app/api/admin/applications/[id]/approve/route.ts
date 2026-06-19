import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const admin = createAdminClient()

    // Get application
    const { data: app } = await admin
      .from('loan_applications')
      .select('*, profiles(full_name, email, phone)')
      .eq('id', params.id)
      .single()

    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    // Calculate loan figures
    const principal = app.amount ?? 0
    const months = app.term_months ?? 1
    const interest = Math.round(principal * 0.05)
    const fee = Math.round(principal * 0.04)
    const vat = Math.round(fee * 0.18)
    const month1 = interest + fee + vat
    const totalDue = principal + month1 + (interest * (months - 1))

    const startDate = new Date()
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + months)

    // Create loan record
    const { data: loan, error: loanErr } = await admin
      .from('loans')
      .insert({
        application_id: app.id,
        client_id: app.client_id,
        loan_type: app.loan_type,
        principal,
        term_months: months,
        monthly_interest_rate: 5,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        total_due: totalDue,
        amount_paid: 0,
        status: 'active',
      })
      .select('id')
      .single()

    if (loanErr) {
      console.error('Loan creation error:', loanErr)
      // Still update application status even if loan table missing
    }

    // Create repayment schedule
    if (loan?.id) {
      const installments = []
      for (let i = 1; i <= months; i++) {
        const dueDate = new Date(startDate)
        dueDate.setMonth(dueDate.getMonth() + i)
        const amount = i === 1 ? month1 : interest
        installments.push({
          loan_id: loan.id,
          installment_number: i,
          due_date: dueDate.toISOString().split('T')[0],
          amount_due: amount,
          amount_paid: 0,
          status: 'pending',
        })
      }
      await admin.from('repayment_schedules').insert(installments)
    }

    // Update application status
    await admin
      .from('loan_applications')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq('id', params.id)

    // Also add to imported_loans so it shows in admin dashboard
    await admin.from('imported_loans').insert({
      client_name: app.profiles?.full_name ?? 'Portal Client',
      principal,
      loan_type: app.loan_type,
      term_months: months,
      date_offered: startDate.toISOString().split('T')[0],
      repayment_date: endDate.toISOString().split('T')[0],
      total_due: totalDue,
      amount_paid: 0,
      outstanding: totalDue,
      status: 'active',
      source: 'portal',
    })

    return NextResponse.redirect(new URL('/admin/applications', req.url))
  } catch (e) {
    console.error(e)
    return NextResponse.redirect(new URL('/admin/applications?error=1', req.url))
  }
}
