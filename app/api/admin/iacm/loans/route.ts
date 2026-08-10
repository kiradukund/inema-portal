import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry } from '@/lib/ledger'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
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

    // Auto-post the disbursement journal entry. Non-fatal — the loan itself
    // is already recorded above. Without this, iacm_loans.balance_outstanding
    // grows with every new loan (correctly feeding the dashboard's Loan
    // Portfolio total) but the cash that actually left the bank/vault to
    // fund it never gets subtracted from the ledger, silently inflating
    // Total Assets over time (same cash counted as both "still in the bank"
    // and "now a loan receivable"). Debiting 3110 here, and crediting it back
    // on repayment (see payments/route.ts), keeps it as a running net-
    // outstanding memo — it's still excluded from Total Assets sums
    // everywhere (iacm_loans remains the source of truth for loan portfolio
    // value), so this doesn't reopen the double-counting issue.
    //
    // Fee (4%) + VAT (18% of the fee) match every real disbursement in the
    // actual historical journal (checked all 27 examples, zero variance) —
    // recomputed here from disbursed_amount, not trusted from the client,
    // so a tampered request body can't change what posts to the ledger.
    // Booked as revenue immediately via a matching AR receivable (3030),
    // same structure as the real historical entries: Bank is only credited
    // for the principal — the fee+VAT is a receivable, collected later
    // alongside repayments, not deducted from what the client receives now.
    try {
      const cashAccount = loan.disbursement_method === 'cash'
        ? { code: '3010', name: 'Cash on Hand' }
        : { code: '3020', name: 'Bank Accounts' }
      const amount = Number(loan.disbursed_amount)
      const fee = amount * 0.04
      const vat = fee * 0.18
      const reference = `loan-${newLoan.id}`
      const narration = `Loan disbursed — ${client.full_name} (${loanNumber})`
      const { error: journalErr } = await postJournalEntry(supabase, {
        entry_date: loan.disbursement_date, narration, reference, entry_type: 'disbursement',
        created_by: auth.profile.full_name,
        lines: [
          { account_code: '3030', account_name: 'Accounts Receivable — Interest and Fees', debit: fee + vat },
          { account_code: '3110', account_name: 'Loan Issued', debit: amount },
          { account_code: cashAccount.code, account_name: cashAccount.name, credit: amount },
          { account_code: '7020', account_name: 'Fees & Commission Income', credit: fee },
          { account_code: '2530', account_name: 'VAT Control Account', credit: vat },
        ],
      })
      if (journalErr) console.error('Journal auto-entry failed (non-fatal):', journalErr)
    } catch (journalErr) {
      console.error('Journal auto-entry failed (non-fatal):', journalErr)
    }

    return ok({ loan: newLoan, loan_number: loanNumber }, 201)
  } catch (e) { return serverError(e) }
}

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('iacm_loans')
      .select('*, iacm_clients(*)')
      .order('created_at', { ascending: false })
    if (error) return serverError(error)
    return ok(data)
  } catch (e) { return serverError(e) }
}
