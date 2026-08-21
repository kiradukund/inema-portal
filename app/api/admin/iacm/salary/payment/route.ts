import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'
import { monthOffset } from '@/lib/calculator'

// Step 2 of the real two-step salary process (see
// app/api/admin/iacm/salary/accrual/route.ts for Step 1 and the full real
// evidence). This is the actual net payment, done when salary is paid
// out -- Dr 2580 Salary Payables / Cr Bank (or Cash), clearing the
// liability Step 1 already created. NOT a new expense, does NOT touch
// Net Profit again -- matches the real historical "Payment of Salary and
// wages" entries exactly, which only ever touch 2580 and 3020/3010.
//
// No dedicated table, same no-new-table architecture as Shareholder Loan/
// Cash Transfer -- a pure two-line posting with nothing else in the app
// that needs to query it as its own entity. entry_type 'salary_payment'
// is in lib/ledger.ts's REVERSAL_HANDLERS (domainTable: null) so it's
// reversible via the Reverse Transaction feature like everything else.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { payment_date, amount, payment_method, notes } = await req.json()

    if (!payment_date || !amount) return err('Missing required fields')
    const amountNum = Number(amount)
    if (!(amountNum > 0)) return err('Amount must be greater than 0')

    const supabase = createAdminClient()
    const cashAccount = payment_method === 'cash'
      ? { code: '3010', name: 'Cash on Hand' }
      : { code: '3020', name: 'Bank Accounts' }

    const lines: JournalLineInput[] = [
      { account_code: '2580', account_name: 'Salary Payables', debit: amountNum },
      { account_code: cashAccount.code, account_name: cashAccount.name, credit: amountNum },
    ]

    // Real gap found 2026-08-21: this used a generic "Salary payment"
    // narration -- checked the real historical payment entries directly:
    // 5 of the 6 real Jan-Jun 2026 backfill entries read "Payment of
    // Salary and wages for [month] [year]"; May's is the one outlier
    // ("Payment of salary", no month), a one-off inconsistency in that
    // real entry rather than the intended convention. Matches the 5/6
    // majority pattern, derived from payment_date so it's automatic.
    const month = monthOffset(payment_date, 0)
    const narration = `Payment of Salary and wages for ${month.name} ${month.year}${notes ? ` — ${notes}` : ''}`
    const reference = `salary-payment-${randomUUID()}`

    const { error } = await postJournalEntry(supabase, {
      entry_date: payment_date, narration, reference, entry_type: 'salary_payment',
      created_by: auth.profile.full_name, lines,
    })
    if (error) return serverError(error)

    return ok({ reference }, 201)
  } catch (e) { return serverError(e) }
}
