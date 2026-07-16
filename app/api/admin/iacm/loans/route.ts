import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { client, loan } = await req.json()
    const supabase = createAdminClient()

    // 1. Check if client already exists by NID
    let clientId: string
    const { data: existing } = await supabase
      .from('iacm_clients')
      .select('id')
      .eq('national_id', client.national_id)
      .maybeSingle()

    if (existing) {
      clientId = existing.id
      // Update client info in case anything changed
      await supabase.from('iacm_clients').update({
        full_name: client.full_name, phone: client.phone, gender: client.gender,
        age: Number(client.age) || null, marital_status: client.marital_status,
        district: client.district, sector: client.sector, cell: client.cell,
        village: client.village, previous_loans_paid: client.previous_loans_paid,
        updated_at: new Date().toISOString(),
      }).eq('id', clientId)
    } else {
      // Create new client
      const { data: newClient, error: clientErr } = await supabase
        .from('iacm_clients').insert({
          full_name: client.full_name, national_id: client.national_id,
          phone: client.phone, gender: client.gender,
          age: Number(client.age) || null, marital_status: client.marital_status,
          district: client.district, sector: client.sector,
          cell: client.cell, village: client.village,
          previous_loans_paid: client.previous_loans_paid,
        }).select().single()
      if (clientErr) return serverError(clientErr)
      clientId = newClient.id
    }

    // 2. Generate loan number
    const { count } = await supabase.from('iacm_loans').select('*', { count: 'exact', head: true })
    const loanNumber = `INEMA-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`

    // 3. Create loan record
    const { data: newLoan, error: loanErr } = await supabase.from('iacm_loans').insert({
      client_id: clientId,
      loan_number: loanNumber,
      loan_type: loan.loan_type,
      disbursed_amount: Number(loan.disbursed_amount),
      disbursement_date: loan.disbursement_date,
      maturity_date: loan.maturity_date,
      interest_rate: 0.05,
      interest_method: loan.interest_method,
      repayment_frequency_days: Number(loan.repayment_frequency_days),
      grace_period_days: Number(loan.grace_period_days) || 0,
      first_payment_date: loan.first_payment_date || null,
      collateral_type: loan.collateral_type,
      collateral_amount: Number(loan.collateral_amount) || 0,
      purpose: loan.purpose,
      economic_sector: loan.economic_sector,
      loan_officer: loan.loan_officer,
      balance_outstanding: Number(loan.disbursed_amount),
      principal_repaid: 0,
      status: 'active',
    }).select().single()

    if (loanErr) return serverError(loanErr)
    return ok({ loan: newLoan, loan_number: loanNumber }, 201)
  } catch (e) { return serverError(e) }
}

export async function GET() {
  try {
    await requireAdmin()
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('iacm_loans')
      .select('*, iacm_clients(*)')
      .order('created_at', { ascending: false })
    if (error) return serverError(error)
    return ok(data)
  } catch (e) { return serverError(e) }
}
