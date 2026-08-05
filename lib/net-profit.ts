// Hard 30-Jun-2026 cutoff for Net Profit — shared by the main dashboard
// (app/admin/page.tsx) and Income & P&L (app/admin/income/page.tsx), which
// must always show the same Net Profit figure. NET_PROFIT_BASE_AS_OF_CUTOFF
// is the real, BNR-reconciled cumulative profit as of that date (sourced
// from retained earnings, not computed here). Only payments/expenses dated
// strictly after the cutoff get added on top of it, so the Jan-Jun payment
// history backfilled from the internal journal isn't counted twice.
export const NET_PROFIT_CUTOFF = '2026-06-30'
export const NET_PROFIT_BASE_AS_OF_CUTOFF = 5018004.4
