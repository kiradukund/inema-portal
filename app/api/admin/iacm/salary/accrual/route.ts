import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { postJournalEntry, type JournalLineInput } from '@/lib/ledger'

// Real gap found 2026-08-21: Kevin's real historical practice for salary
// is a genuine two-step process, not a single payment -- confirmed by the
// historical backfill's own journal entries (Jan-Jun 2026, 6 real matching
// pairs of accrual + payment). Record Expense's 'personnel' category
// cannot represent this: it's a strict one-category-to-one-account map (2
// lines only), so it would post the full gross straight to 6110 with zero
// PAYE/Maternity/Pension/CBHI/net-payable breakdown -- silently
// understating what's actually owed to RRA/RSSB and never creating those
// liabilities at all. Same structural class of gap as Split Expense/rent.
// Confirmed via real data that 'personnel' has never actually been used
// live (zero iacm_expenses rows), so this is a live risk, not yet a
// realized miscoding.
//
// This is Step 1 only (the accrual, when salary is earned) -- Step 2 (the
// actual net payment) is a separate action in
// app/api/admin/iacm/salary/payment/route.ts, matching how the historical
// backfill always recorded them as two distinct journal entries, not one.
//
// Real iacm_expenses row for the FULL gross amount (so Net Profit
// correctly reflects the true cost), plus a direct 6-line journal entry:
// Dr 6110 (gross) / Cr 2540 (PAYE) / Cr 2550 (Maternity) / Cr 2560
// (Pension) / Cr 2570 (CBHI) / Cr 2580 (net payable). No cash/bank line --
// matches the real historical accrual entries exactly, which never touch
// 3020; the cash only moves in Step 2.
//
// Single-tenant assumption, documented not fixed: same as every other
// IACM route -- no tenant scoping exists anywhere in this schema. See
// docs/tenant-isolation-inventory.md and docs/saas-readiness-notes.md.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { expense_date, employee_name, gross_amount, paye_amount, maternity_amount, pension_amount, cbhi_amount, notes } = await req.json()

    if (!expense_date || !employee_name) return err('Missing required fields')
    const gross = Number(gross_amount) || 0
    const paye = Number(paye_amount) || 0
    const maternity = Number(maternity_amount) || 0
    const pension = Number(pension_amount) || 0
    const cbhi = Number(cbhi_amount) || 0
    if (gross <= 0) return err('Gross salary must be greater than 0')
    if (paye < 0 || maternity < 0 || pension < 0 || cbhi < 0) return err('Deduction amounts cannot be negative')
    const netPayable = gross - paye - maternity - pension - cbhi
    if (netPayable < 0) return err('Deductions cannot exceed the gross salary')

    const supabase = createAdminClient()

    // Real expense row for the full gross -- what Net Profit actually
    // reads (app/admin/page.tsx and app/admin/income/page.tsx both sum
    // iacm_expenses.amount directly). Also keeps this reversible via the
    // Reverse Transaction feature's existing 'expense' handler for free.
    const { data: expenseRow, error: expErr } = await supabase.from('iacm_expenses').insert({
      expense_date, category: 'personnel', description: notes || `Salary accrual — ${employee_name}`,
      amount: gross, payment_method: 'accrual',
    }).select().single()
    if (expErr) return serverError(expErr)

    const lines: JournalLineInput[] = [{ account_code: '6110', account_name: 'Salaries & Wages', debit: gross }]
    if (paye > 0) lines.push({ account_code: '2540', account_name: 'PAYE Payables', credit: paye })
    if (maternity > 0) lines.push({ account_code: '2550', account_name: 'Maternity Contribution Payables', credit: maternity })
    if (pension > 0) lines.push({ account_code: '2560', account_name: 'Pension and Risk Contribution Payables', credit: pension })
    if (cbhi > 0) lines.push({ account_code: '2570', account_name: 'CBHI Payables', credit: cbhi })
    if (netPayable > 0) lines.push({ account_code: '2580', account_name: 'Salary Payables', credit: netPayable })

    const reference = `expense-${expenseRow.id}`
    const narration = `Salary accrual — ${employee_name}`

    const { error: journalErr } = await postJournalEntry(supabase, {
      entry_date: expense_date, narration, reference, entry_type: 'expense',
      created_by: auth.profile.full_name, lines,
    })
    if (journalErr) return serverError(journalErr)

    return ok({ reference, expense_id: expenseRow.id, net_payable: netPayable }, 201)
  } catch (e) { return serverError(e) }
}
