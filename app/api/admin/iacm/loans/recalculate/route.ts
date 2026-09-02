import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { recomputeLoanFromPayments } from '@/lib/ledger'

// POST /api/admin/iacm/loans/recalculate — admin-only safety net.
// Re-derives a loan's balance_outstanding / principal_repaid / status /
// installment counters / last_payment_date from ground truth (its own
// disbursed_amount + the real iacm_payments rows) and records the use in
// iacm_loan_recalculations (who, when, optional reason, before/after).
const DERIVED_FIELDS = [
  'balance_outstanding', 'principal_repaid', 'status',
  'installments_paid', 'installments_outstanding', 'last_payment_date',
] as const

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const { loan_id, reason } = await req.json()
    if (!loan_id) return err('Missing loan_id')

    const supabase = createAdminClient()

    const { data: loanBefore, error: beforeErr } = await supabase
      .from('iacm_loans').select('*').eq('id', loan_id).single()
    if (beforeErr || !loanBefore) return err('Loan not found', 404)

    const rec = await recomputeLoanFromPayments(supabase, loan_id)
    if (rec.error) return serverError(rec.error)

    const { data: loanAfter, error: afterErr } = await supabase
      .from('iacm_loans').select('*').eq('id', loan_id).single()
    if (afterErr || !loanAfter) return serverError('Loan vanished during recalculation')

    const pick = (row: any) => Object.fromEntries(DERIVED_FIELDS.map(f => [f, row[f]]))
    const before = pick(loanBefore)
    const after = pick(loanAfter)
    const changed = DERIVED_FIELDS.some(f => String(loanBefore[f]) !== String(loanAfter[f]))

    const { error: auditErr } = await supabase.from('iacm_loan_recalculations').insert({
      loan_id,
      loan_number: loanAfter.loan_number,
      reason: reason?.trim() || null,
      before_state: before,
      after_state: after,
      changed,
      triggered_by_user_id: auth.user.id,
      triggered_by_name: auth.profile.full_name,
    })
    if (auditErr) return serverError(`Loan recalculated, but the audit record failed: ${auditErr.message}`)

    return ok({ before, after, changed })
  } catch (e) { return serverError(e) }
}
