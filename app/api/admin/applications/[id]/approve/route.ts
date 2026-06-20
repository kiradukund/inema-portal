import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(req: NextRequest, context: any) {
  const id = context.params.id
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: app } = await admin
      .from('loan_applications')
      .select('*, profiles(full_name, email, phone)')
      .eq('id', id)
      .single()

    if (app) {
      const principal = Number(app.amount ?? 0)
      const months = Number(app.term_months ?? 1)
      const interest = Math.round(principal * 0.05)
      const fee = Math.round(principal * 0.04)
      const vat = Math.round(fee * 0.18)
      const m1 = interest + fee + vat
      const totalDue = principal + m1 + (interest * (months - 1))
      const start = new Date().toISOString().split('T')[0]
      const end = new Date(Date.now() + months * 30 * 86400000).toISOString().split('T')[0]

      await admin.from('loan_applications').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', id)
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientName = (app.profiles as any)?.full_name ?? 'Portal Client'
      await admin.from('imported_loans').insert({
        client_name: clientName,
        principal, loan_type: app.loan_type ?? 'salary_advance',
        term_months: months, date_offered: start, repayment_date: end,
        total_due: totalDue, amount_paid: 0, outstanding: totalDue,
        status: 'active', has_installments: months > 1, source: 'portal',
      })
    }

    return NextResponse.redirect(new URL('/admin/applications', req.url))
  } catch (e) {
    console.error(e)
    return NextResponse.redirect(new URL('/admin/applications', req.url))
  }
}
