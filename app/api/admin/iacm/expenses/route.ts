import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const body = await req.json()
    const { expense_date, category, description, amount, payment_method, confirmed_duplicate } = body
    if (!expense_date || !category || !description || !amount) return err('Missing required fields')
    // Rejected before any insert happens -- a stale client (cached page,
    // old bookmark) sending the removed 'petty_cash' category must not
    // create an orphaned iacm_expenses row with no journal entry, and must
    // not silently fall back to 'other' (6300) either; that would just
    // trade one wrong account for another. See EXPENSE_ACCOUNTS below.
    if (category === 'petty_cash') {
      return err("'petty_cash' has been removed — use Cash Withdrawal / Transfer instead, this is not a real expense")
    }

    const supabase = createAdminClient()

    // Duplicate-detection warning (not a hard block): same category, same
    // amount, same date is the exact shape of an accidental double-submit.
    // A real second identical expense does happen (e.g. two equal bank
    // charges in a month), so this only warns -- resubmit with
    // confirmed_duplicate:true to proceed.
    if (!confirmed_duplicate) {
      const { data: dup } = await supabase
        .from('iacm_expenses')
        .select('category, amount, expense_date, description')
        .eq('category', category)
        .eq('amount', Number(amount))
        .eq('expense_date', expense_date)
        .maybeSingle()
      if (dup) {
        return ok({
          possible_duplicate: true,
          existing: { label: dup.description, amount: dup.amount, date: dup.expense_date },
        })
      }
    }

    const { data, error } = await supabase.from('iacm_expenses').insert({
      expense_date, category, description,
      amount: Number(amount), payment_method: payment_method ?? 'bank_transfer',
    }).select().single()

    if (error) return serverError(error)

    // Auto-post the journal entry for this expense. Non-fatal — the expense
    // itself is already recorded above. iacm_journal_entries (header) +
    // iacm_journal_lines (the actual debit/credit rows) — see
    // postJournalEntry in lib/ledger.ts. Keyed by this expense's own id, not
    // by category, so two "rent" expenses don't collide into one
    // indistinguishable transaction. Account codes/names match Devotha's
    // real chart of accounts.
    try {
      // Codes cross-checked against the real "Accounts" reference sheet in
      // Kevin's actual journal file (INEMA_Journal_Q3_2026.xlsx), not just
      // which codes happened to appear in journal rows — that's the gap
      // that let this go wrong the first time. Real evidence found
      // 2026-08-19: the prior comment here CLAIMED PAYE/Pension/Maternity/
      // CBHI "already have their own dedicated codes... settled alongside
      // salary" but no such code path ever existed — every one of those
      // would have silently fallen into the generic 'tax' bucket (2640) had
      // this category ever been used for them. The real historical journal
      // itself posted all four correctly to 2540/2550/2560/2570 every
      // single month from Dec 2025 through Jun 2026 (one real exception:
      // two June entries misfiled to 2640 on 2026-07-08 — a manual
      // bookkeeping slip, not a pattern). 'tax' now specifically means
      // Corporate Income Tax (2640), matching the one real historical use
      // of that code with that meaning (narration "Corporate Income tax").
      // 'wht' (2590, Withholding Tax) had no category at all before and no
      // real historical precedent either way — added as its own real,
      // distinct account per the authoritative chart, not folded into 'tax'.
      // communication/stationery/transport/advertising/legal/maintenance are
      // UNCHANGED and still a known, separate, documented gap (several map
      // to real account codes that mean something else entirely per the
      // Accounts sheet) — out of scope for this fix, see docs/known-gaps.md.
      //
      // 'petty_cash' REMOVED entirely, 2026-08-19: a real cash withdrawal
      // (KUBWIMANA Devotha, 9-Jul-26, 50,000) went through this category to
      // 6290 — a real account, but "Income tax expense" per the actual
      // chart, not petty cash — treating a pure internal asset transfer
      // (Bank -> Cash on Hand) as a real business expense, wrongly reducing
      // both Net Profit and (less obviously) Total Assets, since the real
      // 3010 side was never recorded anywhere. Moving cash between Bank and
      // Cash on Hand is never an expense — it now has its own dedicated
      // feature (/admin/iacm/cash-transfer/new), deliberately NOT a Record
      // Expense category, so this mistake can't recur here.
      // Real chart cross-checked again 2026-08-20 against Kevin's full 72-
      // account chart (12 named 6xxx expense accounts, checked one by one):
      // the 6220-6270 block was scrambled (communication/stationery/
      // transport/advertising/legal/maintenance each pointed at a code that
      // really means something else) -- see docs/known-gaps.md for the full
      // before/after table. 'stationery', 'advertising', and 'maintenance'
      // are REMOVED here: none has a match anywhere in the real chart given
      // tonight, and none had any real historical usage (checked live data
      // first) -- they were squatting on the correct codes for communication/
      // legal/transport, which DO have real matches. Falls back to 'other'
      // (6300) if a real expense doesn't fit a named category, same as
      // before. If any of the three removed categories turn out to be real,
      // distinct accounts elsewhere in the full chart, they can be re-added
      // with their real code once confirmed -- not guessed here.
      //
      // 2500-series liability payables extended 2026-08-20: VAT Control
      // Account (2530) was confirmed missing entirely -- same pattern as
      // PAYE/CBHI/Pension/Maternity, a liability settlement, not a real
      // expense. Social Security (2600) and Other Statutory (2620) added
      // the same way, per Kevin's real chart. Every liability category
      // here (vat/paye/cbhi/pension/maternity/wht/social_security/
      // other_statutory/tax) is excluded from Net Profit -- see
      // lib/net-profit.ts's LIABILITY_EXPENSE_CATEGORIES, kept in sync
      // with this map.
      const EXPENSE_ACCOUNTS: Record<string, { code: string; name: string }> = {
        interest_on_borrowings: { code: '6010', name: 'Interest on Borrowings' },
        personnel:     { code: '6110', name: 'Salaries & Wages' },
        staff_benefits: { code: '6120', name: 'Staff Benefits & Welfare' },
        rent:          { code: '6210', name: 'Office Rent' },
        utilities:     { code: '6220', name: 'Utilities' },
        it_software:   { code: '6230', name: 'IT & Software Expenses' },
        legal:         { code: '6250', name: 'Legal & Professional Fees' },
        transport:     { code: '6260', name: 'Travel & Transport' },
        communication: { code: '6270', name: 'Communication Expenses' },
        bank_charges:  { code: '6280', name: 'Bank Charges & Commissions' },
        income_tax_expense: { code: '6290', name: 'Income tax expense' },
        vat:           { code: '2530', name: 'VAT Control Account' },
        paye:          { code: '2540', name: 'PAYE Payables' },
        cbhi:          { code: '2570', name: 'CBHI Payables' },
        pension:       { code: '2560', name: 'Pension and Risk Contribution Payables' },
        maternity:     { code: '2550', name: 'Maternity Contribution Payables' },
        wht:           { code: '2590', name: 'Withholding Tax (WHT) Payables' },
        social_security: { code: '2600', name: 'Social Security Payables' },
        other_statutory: { code: '2620', name: 'Other Statutory Payables' },
        tax:           { code: '2640', name: 'Tax Payable' },
        other:         { code: '6300', name: 'Miscellaneous Expenses' },
      }
      const amountNum = Number(amount)
      const reference = `expense-${data.id}`
      let lines: JournalLineInput[]

      if (category === 'depreciation') {
        // Non-cash adjusting entry — reduces the carrying value of fixed
        // assets, never touches cash/bank. Code corrected 2026-08-20:
        // 6240 "Depreciation & Amortization" per the real chart, not 6310
        // (not a real account anywhere in the given chart) -- zero real
        // historical usage of this category, so safe to correct outright.
        lines = [
          { account_code: '6240', account_name: 'Depreciation & Amortization', debit: amountNum },
          { account_code: '3220', account_name: 'Accumulated Depreciation', credit: amountNum },
        ]
      } else {
        const expenseAccount = EXPENSE_ACCOUNTS[category] ?? EXPENSE_ACCOUNTS.other
        // Route to Cash on Hand or Bank Accounts based on how it was actually
        // paid — previously this always hit Bank Accounts even for cash
        // expenses, silently corrupting the Cash-vs-Bank split over time.
        const cashAccount = payment_method === 'cash'
          ? { code: '3010', name: 'Cash on Hand' }
          : { code: '3020', name: 'Bank Accounts' }
        lines = [
          { account_code: expenseAccount.code, account_name: expenseAccount.name, debit: amountNum },
          { account_code: cashAccount.code, account_name: cashAccount.name, credit: amountNum },
        ]
      }
      const { error: journalErr } = await postJournalEntry(supabase, {
        entry_date: expense_date, narration: description, reference, entry_type: 'expense',
        created_by: auth.profile.full_name, lines,
      })
      if (journalErr) console.error('Journal auto-entry failed (non-fatal):', journalErr)
    } catch (journalErr) {
      console.error('Journal auto-entry failed (non-fatal):', journalErr)
    }

    return ok({ expense: data }, 201)
  } catch (e) { return serverError(e) }
}

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('iacm_expenses')
      .select('*')
      .order('expense_date', { ascending: false })
    if (error) return serverError(error)
    return ok(data)
  } catch (e) { return serverError(e) }
}
