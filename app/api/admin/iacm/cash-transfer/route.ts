import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'

// Real bug found 2026-08-19 (KUBWIMANA Devotha, 9-Jul-26, 50,000): moving
// cash out of the bank into physical petty cash was recorded through
// Record Expense's 'petty_cash' category, which posted Debit 6290 (a real
// account, but "Income tax expense" per Kevin's actual chart, not petty
// cash at all) / Credit 3020 -- treating a pure internal asset transfer as
// a real business expense, wrongly reducing Net Profit by the transfer
// amount. Real accounting, confirmed: a withdrawal is Debit 3010 (Cash on
// Hand) / Credit 3020 (Bank Accounts); a deposit back reverses it. Zero
// expense-account involvement either way. This is its own dedicated
// feature, not a Record Expense category, specifically so this mistake
// cannot recur -- same reasoning and same no-new-table architecture as
// the Shareholder Loan feature (a pure two-line balance-sheet posting,
// nothing else in the app ever needs to query it as its own entity).
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { direction, amount, transaction_date, notes } = await req.json()

    if (!amount || !direction || !transaction_date) return err('Missing required fields')
    if (direction !== 'withdrawal' && direction !== 'deposit') return err('Invalid direction')
    const amountNum = Number(amount)
    if (!(amountNum > 0)) return err('Amount must be greater than 0')

    const supabase = createAdminClient()
    const cash = { code: '3010', name: 'Cash on Hand' }
    const bank = { code: '3020', name: 'Bank Accounts' }

    // "withdrawal" = cash taken OUT of the bank into physical cash on hand.
    // "deposit" = physical cash paid back INTO the bank (the reverse).
    const lines: JournalLineInput[] = direction === 'withdrawal'
      ? [
          { account_code: cash.code, account_name: cash.name, debit: amountNum },
          { account_code: bank.code, account_name: bank.name, credit: amountNum },
        ]
      : [
          { account_code: bank.code, account_name: bank.name, debit: amountNum },
          { account_code: cash.code, account_name: cash.name, credit: amountNum },
        ]

    const narration = `Cash ${direction === 'withdrawal' ? 'Withdrawal (Bank to Cash)' : 'Deposit (Cash to Bank)'}` +
      (notes ? ` — ${notes}` : '')
    const reference = `cash-transfer-${randomUUID()}`

    const { error } = await postJournalEntry(supabase, {
      entry_date: transaction_date, narration, reference, entry_type: 'cash_transfer',
      created_by: auth.profile.full_name, lines,
    })
    if (error) return serverError(error)

    return ok({ reference }, 201)
  } catch (e) { return serverError(e) }
}
