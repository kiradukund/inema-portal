import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'

// Piece 1 (2026-09-14, VAT Return Summary): a real, dedicated action for
// recording an actual VAT payment made to RRA -- pulled out of the
// generic manual-journal screen specifically so these entries are
// unambiguously identifiable (entry_type: 'vat_payment') going forward,
// not distinguished only by narration text. Devotha's real historical
// entries ("Payment of quarterly VAT from September to december") were
// entered manually, with entry_type: 'manual' -- the VAT Return Summary's
// classification of THOSE has to fall back to narration matching; every
// new one recorded through this route needs no such guesswork.
//
// Same no-new-table shape as Cash Transfer / Shareholder Loan: a pure
// two-line balance-sheet posting (Debit VAT Control Account, reducing the
// real liability; Credit Cash/Bank), nothing else in the app needs to
// query this as its own entity.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { amount, payment_date, payment_method, period_description, notes } = await req.json()

    if (!amount || !payment_date) return err('Missing required fields')
    const amountNum = Number(amount)
    if (!(amountNum > 0)) return err('Amount must be greater than 0')
    if (payment_method !== 'cash' && payment_method !== 'bank') return err('Invalid payment_method')

    const supabase = createAdminClient()
    const vat = { code: '2530', name: 'VAT Control Account' }
    const cashAccount = payment_method === 'cash'
      ? { code: '3010', name: 'Cash on Hand' }
      : { code: '3020', name: 'Bank Accounts' }

    const lines: JournalLineInput[] = [
      { account_code: vat.code, account_name: vat.name, debit: amountNum },
      { account_code: cashAccount.code, account_name: cashAccount.name, credit: amountNum },
    ]

    const narration = `Payment of quarterly VAT${period_description ? ` ${period_description}` : ''}` +
      (notes ? ` — ${notes}` : '')
    const reference = `vat-payment-${randomUUID()}`

    const { error } = await postJournalEntry(supabase, {
      entry_date: payment_date, narration, reference, entry_type: 'vat_payment',
      created_by: auth.profile.full_name, lines,
    })
    if (error) return serverError(error)

    return ok({ reference }, 201)
  } catch (e) { return serverError(e) }
}
