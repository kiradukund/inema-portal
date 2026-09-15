import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAdminApi } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import { ok, err, serverError } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'

const AR_INTEREST_FEES = { code: '3030', name: 'Accounts Receivable – Interest and Fees' }
const INTEREST_INCOME = { code: '7010', name: 'Interest Income on Loans' }

interface ConfirmedAccrual {
  loanId: string
  loanNumber: string
  clientName: string
  periodStart: string
  periodEnd: string
  months: number
  balanceAtAccrual: number
  monthlyRate: number
  interestAmount: number
}

// Piece 2 (2026-09-14): the real confirm step. Takes the (possibly
// Devotha-edited -- a row excluded or its figures overridden) final list
// from the real preview, and for each: posts one real journal entry
// (Debit 3030 Accounts Receivable — Interest and Fees, Credit 7010
// Interest Income), then writes the itemized iacm_interest_accruals row
// linking to it -- the real, permanent, per-client detail that Devotha's
// own hand-maintained sheet currently holds, closing the real gap
// confirmed earlier tonight.
//
// Real, deliberate per-loan independence: each accrual is its own real
// transaction, not one atomic batch -- a failure on one loan doesn't
// roll back the others (unlike Reverse Transaction, where a partial
// failure would be worse than the bug it fixes; here, each loan's
// accrual is already an independent real event). Every real outcome
// (posted or failed) is reported back explicitly, never silently
// swallowed.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const body = await req.json()
    const accruals: ConfirmedAccrual[] = body?.accruals
    if (!Array.isArray(accruals) || accruals.length === 0) return err('Missing or empty accruals array')

    const supabase = createAdminClient()
    const posted: { loanId: string; loanNumber: string; interestAmount: number }[] = []
    const failed: { loanId: string; loanNumber: string; error: string }[] = []

    for (const a of accruals) {
      if (!(a.interestAmount > 0)) {
        failed.push({ loanId: a.loanId, loanNumber: a.loanNumber, error: 'interestAmount must be greater than 0' })
        continue
      }
      const reference = `interest-accrual-${a.loanId}-${randomUUID()}`
      const narration = `Interest accrual for ${a.clientName} (${a.loanNumber}) — ${a.months} month(s)`
      const lines: JournalLineInput[] = [
        { account_code: AR_INTEREST_FEES.code, account_name: AR_INTEREST_FEES.name, debit: a.interestAmount },
        { account_code: INTEREST_INCOME.code, account_name: INTEREST_INCOME.name, credit: a.interestAmount },
      ]

      const { error: journalErr } = await postJournalEntry(supabase, {
        entry_date: a.periodEnd, narration, reference, entry_type: 'interest_accrual',
        created_by: auth.profile.full_name, lines,
      })
      if (journalErr) {
        failed.push({ loanId: a.loanId, loanNumber: a.loanNumber, error: JSON.stringify(journalErr) })
        continue
      }

      // postJournalEntry() only ever returns { error }, never the created
      // entry's id (same real, documented limitation already worked
      // around identically in tonight's own VAT-return smoke test) -- the
      // reference above is unique per posting, so re-selecting by it is
      // safe and unambiguous.
      const { data: entryRow, error: lookupErr } = await supabase
        .from('iacm_journal_entries').select('id').eq('reference', reference).single()
      if (lookupErr || !entryRow) {
        failed.push({ loanId: a.loanId, loanNumber: a.loanNumber, error: `Journal entry posted but could not be looked back up: ${lookupErr?.message}` })
        continue
      }

      const { error: accrualErr } = await supabase.from('iacm_interest_accruals').insert({
        loan_id: a.loanId, loan_number: a.loanNumber, client_name: a.clientName,
        period_start: a.periodStart, period_end: a.periodEnd, months: a.months,
        balance_at_accrual: a.balanceAtAccrual, monthly_rate: a.monthlyRate, interest_amount: a.interestAmount,
        journal_entry_id: entryRow.id, created_by_user_id: auth.user.id, created_by_name: auth.profile.full_name,
      })
      if (accrualErr) {
        failed.push({ loanId: a.loanId, loanNumber: a.loanNumber, error: `Journal entry posted (reference ${reference}) but the accrual record failed: ${accrualErr.message}` })
        continue
      }

      posted.push({ loanId: a.loanId, loanNumber: a.loanNumber, interestAmount: a.interestAmount })
    }

    return ok({ posted, failed, posted_count: posted.length, failed_count: failed.length })
  } catch (e) { return serverError(e) }
}
