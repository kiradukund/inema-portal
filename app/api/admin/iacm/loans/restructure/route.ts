import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { restructureLoan } from '@/lib/ledger'

// Loan Restructuring / Rollover. A defaulted loan's remaining debt is
// converted into a fresh contract with NO real cash movement — the same
// underlying debt just moves from one loan record to another, plus a fresh
// 4%+VAT disbursement fee on the (agreed) new principal.
//
// `restructured_amount` is OPTIONAL. Omitted, the new loan carries the old
// loan's exact outstanding balance (pre-2026-09-03 behaviour). Provided, that
// agreed figure becomes the new loan's balance and the difference vs the old
// balance is a deliberate write-down/capitalisation — see restructureLoan()
// in lib/ledger.ts for the full accounting note and the reversal semantics.
//
// entry_type 'loan_restructuring' is reversible via the Reverse Transaction
// feature. Single-tenant assumption, documented not fixed — see
// docs/tenant-isolation-inventory.md / docs/saas-readiness-notes.md.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const body = await req.json()
    const supabase = createAdminClient()
    const result = await restructureLoan(supabase, {
      old_loan_id: body.old_loan_id,
      restructure_date: body.restructure_date,
      maturity_date: body.maturity_date,
      restructured_amount: body.restructured_amount,
      loan_type: body.loan_type,
      purpose: body.purpose,
      economic_sector: body.economic_sector,
      loan_officer: body.loan_officer,
      collateral_type: body.collateral_type,
      collateral_amount: body.collateral_amount,
      created_by: auth.profile.full_name,
    })
    if (result.error) return err(result.error)

    return ok({
      new_loan_id: result.new_loan_id,
      new_loan_number: result.new_loan_number,
      restructured_amount: result.restructured_amount,
      old_balance: result.old_balance,
      delta: result.delta,
      fee: result.fee,
      vat: result.vat,
    }, 201)
  } catch (e) { return serverError(e) }
}
