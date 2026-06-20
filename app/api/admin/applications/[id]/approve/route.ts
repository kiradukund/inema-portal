import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set() {},
          remove() {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', req.url))

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/applications', req.url))
    }

    const admin = getAdminClient()

    const { data: app } = await admin
      .from('loan_applications')
      .select('*, profiles(full_name, email, phone)')
      .eq('id', params.id)
      .single()

    if (!app) return NextResponse.redirect(new URL('/admin/applications', req.url))

    const principal = Number(app.amount ?? 0)
    const months = Number(app.term_months ?? 1)
    const interest = Math.round(principal * 0.05)
    const fee = Math.round(principal * 0.04)
    const vat = Math.round(fee * 0.18)
    const month1 = interest + fee + vat
    const totalDue = principal + month1 + (interest * (months - 1))

    const startDate = new Date().toISOString().split('T')[0]
    const endDate = new Date(Date.now() + months * 30 * 86400000).toISOString().split('T')[0]

    // Update application status to approved
    await admin
      .from('loan_applications')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', params.id)

    // Add to imported_loans so it shows in admin dashboard immediately
    await admin.from('imported_loans').insert({
      client_name: app.profiles?.full_name ?? 'Portal Client',
      principal,
      loan_type: app.loan_type ?? 'salary_advance',
      term_months: months,
      date_offered: startDate,
      repayment_date: endDate,
      total_due: totalDue,
      amount_paid: 0,
      outstanding: totalDue,
      status: 'active',
      has_installments: months > 1,
      source: 'portal',
    })

    return NextResponse.redirect(new URL('/admin/applications', req.url))
  } catch (e) {
    console.error('Approve error:', e)
    return NextResponse.redirect(new URL('/admin/applications', req.url))
  }
}
