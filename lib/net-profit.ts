// Hard 30-Jun-2026 cutoff for Net Profit — shared by the main dashboard
// (app/admin/page.tsx) and Income & P&L (app/admin/income/page.tsx), which
// must always show the same Net Profit figure. NET_PROFIT_BASE_AS_OF_CUTOFF
// is the real, BNR-reconciled cumulative profit as of that date (sourced
// from retained earnings, not computed here). Only payments/expenses dated
// strictly after the cutoff get added on top of it, so the Jan-Jun payment
// history backfilled from the internal journal isn't counted twice.
export const NET_PROFIT_CUTOFF = '2026-06-30'
export const NET_PROFIT_BASE_AS_OF_CUTOFF = 5018004.4

// Real gap confirmed 2026-08-20: both Net Profit calculations (this page's
// callers) summed EVERY iacm_expenses row unconditionally, with no
// exclusion for these categories -- even though each one settles a real
// 2xxx liability (PAYE/CBHI/Pension/Maternity/WHT/Corporate Income Tax
// Payable), not a 6xxx operating expense. Paying down a payable isn't a new
// cost hitting the P&L; only the six 6xxx-mapped categories should reduce
// Net Profit. Confirmed materially wrong on real live data at the time of
// the fix: 4 real post-cutoff liability payments (188,773 RWF total) were
// being wrongly subtracted. See docs/known-gaps.md.
export const LIABILITY_EXPENSE_CATEGORIES = ['paye', 'cbhi', 'pension', 'maternity', 'wht', 'tax']
