import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'

// Real accounting, confirmed: a shareholder deposit is cash coming IN as a
// liability the business owes back (not equity) — Debit Bank (3020), Credit
// Shareholders' Loan (2030). A withdrawal reverses it. No dedicated table:
// this is a pure two-line balance-sheet posting with nothing else in the
// app that ever needs to query it as its own entity, so it goes straight
// through postJournalEntry() — the same mechanism every other transaction
// type uses, not a new posting path. 2030's real opening balance
// (1,500,000, already in iacm_opening_balances) is untouched; this only
// ever adds post-cutoff journal movements on top of it, same as every
// other account in the system.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { shareholder_name, amount, direction, transaction_date, notes } = await req.json()

    if (!shareholder_name || !amount || !direction || !transaction_date) return err('Missing required fields')
    if (direction !== 'deposit' && direction !== 'withdrawal') return err('Invalid direction')
    const amountNum = Number(amount)
    if (!(amountNum > 0)) return err('Amount must be greater than 0')

    const supabase = createAdminClient()
    const bank = { code: '3020', name: 'Bank Accounts' }
    const shareholderLoan = { code: '2030', name: "Shareholders' Loan — Long Term" }

    const lines: JournalLineInput[] = direction === 'deposit'
      ? [
          { account_code: bank.code, account_name: bank.name, debit: amountNum },
          { account_code: shareholderLoan.code, account_name: shareholderLoan.name, credit: amountNum },
        ]
      : [
          { account_code: shareholderLoan.code, account_name: shareholderLoan.name, debit: amountNum },
          { account_code: bank.code, account_name: bank.name, credit: amountNum },
        ]

    const narration = `Shareholder Loan ${direction === 'deposit' ? 'Deposit' : 'Withdrawal'} — ${shareholder_name}` +
      (notes ? ` (${notes})` : '')
    const reference = `shareholder-loan-${randomUUID()}`

    const { error } = await postJournalEntry(supabase, {
      entry_date: transaction_date, narration, reference, entry_type: 'shareholder_loan',
      created_by: auth.profile.full_name, lines,
    })
    if (error) return serverError(error)

    return ok({ reference }, 201)
  } catch (e) { return serverError(e) }
}
