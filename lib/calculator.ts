import type {
  CalculatorInput,
  CalculatorResult,
  MonthlyBreakdown,
  LoanType,
} from '@/types'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
export const MONTHLY_INTEREST_RATE = 0.05        // 5% per month
export const UPFRONT_FEE_RATE = 0.04             // 4% total (1% application + 1.5% processing + 1.5% management)
export const VAT_RATE = 0.18                     // 18% VAT applied on the 4% upfront fee ONLY
export const LATE_PAYMENT_RATE = 0.05            // 5% per month on overdue

// Full calendar months between two dates (e.g. 22-Jan to 23-Mar = 2,
// 09-Mar to 02-Jun = 2 -- day-of-month precision, not a rough diff).
// Shared by the Record Payment route (lib/ledger's caller in
// app/api/admin/iacm/payments/route.ts) and its live preview in
// app/admin/iacm/payments/new/page.tsx, so the number shown before
// submission always matches what actually gets posted -- previously these
// drifted (the preview assumed a flat 1 month, the backend computed real
// elapsed months), which is how a real 6-month catch-up payment for
// HABINEZA Jean Marie got silently truncated to 1 month of interest with no
// warning on screen. See docs/known-gaps.md for the full incident.
//
// `isFirstPayment` controls the floor, confirmed 2026-08-22: a genuine
// FIRST payment on a loan (reference date = disbursement_date, no real
// payment history yet) always floors to a minimum of 1 month -- a client
// owes at least one month's interest the moment a loan is disbursed,
// however few days have actually elapsed, and this floor is what protects
// against that being silently undercounted. But for every payment AFTER
// the first (reference date = the loan's own last real payment date),
// flooring to 1 is wrong: real evidence found it silently overcharged
// NKUBITO RUSAMAZA Desire Demino a full month of interest (75,090) on a
// second real payment made only 3 days after her first, when the true
// elapsed time was genuinely 0 complete months. Staff still have the
// "Months of Interest to Charge" override to manually add a month when
// they know one is genuinely owed (e.g. a real multi-month gap that
// happens to floor to 0 some other way) -- this only removes the
// automatic, unconditional floor for non-first payments. Floored at 0
// (never negative) regardless -- a payment can't owe less than no time at
// all, but this is a defensive minimum against a payment_date entered
// before the loan's own last real payment date, not the removed business
// floor itself.
export function monthsElapsed(from: Date, to: Date, isFirstPayment: boolean = true): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return isFirstPayment ? Math.max(1, months) : Math.max(0, months)
}

export const LOAN_LIMITS: Record<LoanType, { min: number; max: number; maxMonths: number }> = {
  salary_advance: { min: 50_000,  max: 2_000_000,  maxMonths: 6 },
  quinzaine:      { min: 50_000,  max: 1_000_000,  maxMonths: 1 },   // 15 days = 1 month billing
  school_fees:    { min: 100_000, max: 5_000_000,  maxMonths: 6 },
  business:       { min: 500_000, max: 10_000_000, maxMonths: 6 },
}

// ─── CORE CALCULATOR ─────────────────────────────────────────────────────────
//
// FORMULA (as confirmed by INEMA):
//
// Month 1:
//   interest     = principal × 5%
//   upfront_fee  = principal × 4%
//   vat          = upfront_fee × 18%
//   month1_total = interest + upfront_fee + vat
//
// Months 2+:
//   monthly = principal × 5%  (no fee, no VAT)
//
// Example: RWF 1,000,000 for 3 months
//   Month 1: 50,000 + 40,000 + 7,200 = 97,200
//   Month 2: 50,000
//   Month 3: 50,000
//   Total interest: 197,200  →  Total repayment: 1,197,200
//
// ─────────────────────────────────────────────────────────────────────────────

export function calculateLoan(input: CalculatorInput): CalculatorResult {
  const { principal, term_months, loan_type } = input

  // Validate
  const limits = LOAN_LIMITS[loan_type]
  if (principal < limits.min || principal > limits.max) {
    throw new Error(`Amount must be between RWF ${limits.min.toLocaleString()} and RWF ${limits.max.toLocaleString()}`)
  }
  if (term_months < 1 || term_months > limits.maxMonths) {
    throw new Error(`Term must be between 1 and ${limits.maxMonths} months for this loan type`)
  }

  // ── Month 1 calculations ──
  const month1_interest = Math.round(principal * MONTHLY_INTEREST_RATE)
  const month1_fee      = Math.round(principal * UPFRONT_FEE_RATE)
  const month1_vat      = Math.round(month1_fee * VAT_RATE)
  const month1_total    = month1_interest + month1_fee + month1_vat

  // ── Months 2+ ──
  const subsequent_monthly = Math.round(principal * MONTHLY_INTEREST_RATE)

  // ── Totals ──
  const total_interest      = month1_interest + (subsequent_monthly * (term_months - 1))
  const total_fees_and_vat  = month1_fee + month1_vat
  const total_cost          = total_interest + total_fees_and_vat
  const total_repayment     = principal + total_cost
  const effective_total_rate = ((total_cost / principal) * 100).toFixed(2) + '%'

  // ── Monthly schedule ──
  const schedule: MonthlyBreakdown[] = []
  const startDate = new Date()

  for (let m = 1; m <= term_months; m++) {
    const dueDate = new Date(startDate)
    dueDate.setMonth(dueDate.getMonth() + m)

    const interest    = Math.round(principal * MONTHLY_INTEREST_RATE)
    const fee_amount  = m === 1 ? month1_fee : 0
    const vat_amount  = m === 1 ? month1_vat : 0
    const total_payment = interest + fee_amount + vat_amount

    schedule.push({
      month: m,
      due_date: dueDate.toISOString().split('T')[0],
      interest,
      fee_amount,
      vat_amount,
      total_payment,
      running_balance: principal, // interest-only model, principal paid at end
      label: m === 1
        ? `Month 1 (5% interest + 4% fees + 18% VAT on fees)`
        : `Month ${m} (5% interest only)`,
    })
  }

  return {
    principal,
    term_months,
    loan_type,
    monthly_interest_rate: MONTHLY_INTEREST_RATE,
    upfront_fee_rate: UPFRONT_FEE_RATE,
    vat_rate: VAT_RATE,
    month1_interest,
    month1_fee,
    month1_vat,
    month1_total,
    subsequent_monthly,
    total_interest,
    total_fees_and_vat,
    total_cost,
    total_repayment,
    effective_total_rate,
    schedule,
  }
}

// ─── LATE FEE CALCULATOR ─────────────────────────────────────────────────────
export function calculateLateFee(overdueAmount: number, monthsOverdue: number): number {
  return Math.round(overdueAmount * LATE_PAYMENT_RATE * monthsOverdue)
}

// ─── RESTRUCTURING BREAKDOWN ─────────────────────────────────────────────────
// Whole calendar months between two YYYY-MM-DD strings, floored at 1.
// String-parsed (not `new Date(str)`) to stay immune to the UTC/local
// day-shift bug class documented in lib/ledger.ts and elsewhere.
export function wholeMonthsBetween(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split('-').map(Number)
  const [ty, tm, td] = toStr.split('-').map(Number)
  let months = (ty - fy) * 12 + (tm - fm)
  if (td < fd) months -= 1
  return Math.max(1, months)
}

export interface RestructureScheduleRow {
  month: number
  interest: number
  fee: number
  vat: number
  principal: number
  total: number
}
export interface RestructureBreakdown {
  amount: number
  months: number
  fee: number
  vat: number
  monthlyInterest: number
  month1Total: number
  finalTotal: number
  totalRepayment: number
  schedule: RestructureScheduleRow[]
}

// The fee / VAT / interest composition for a restructured contract, built
// the SAME way calculateLoan() builds a normal new loan of that amount:
// fee = 4% of the (agreed) principal, VAT = 18% of that fee, monthly
// interest = 5% of principal. Month 1 carries fee + VAT + interest;
// interior months carry interest only; the final month adds the whole
// principal balloon (INEMA's real interest-only-then-lump-sum model).
//
// Deliberately NOT rounded here — it mirrors the restructuring route's
// existing `amount * UPFRONT_FEE_RATE` / `fee * VAT_RATE` math exactly, so
// the form's "review before you confirm" schedule preview and the journal
// the route actually posts can never drift. Used by BOTH
// app/api/admin/iacm/loans/restructure/route.ts and its form.
// (calculateLoan() is left untouched — it has a different schedule
// contract, rounds, and is consumed by the public loan calculator.)
export function buildRestructureBreakdown(amount: number, months: number): RestructureBreakdown {
  const n = Math.max(1, Math.floor(months || 0))
  const fee = amount * UPFRONT_FEE_RATE
  const vat = fee * VAT_RATE
  const monthlyInterest = amount * MONTHLY_INTEREST_RATE
  const schedule: RestructureScheduleRow[] = []
  for (let m = 1; m <= n; m++) {
    const feeAmt = m === 1 ? fee : 0
    const vatAmt = m === 1 ? vat : 0
    const principalAmt = m === n ? amount : 0
    schedule.push({
      month: m,
      interest: monthlyInterest,
      fee: feeAmt,
      vat: vatAmt,
      principal: principalAmt,
      total: monthlyInterest + feeAmt + vatAmt + principalAmt,
    })
  }
  return {
    amount,
    months: n,
    fee,
    vat,
    monthlyInterest,
    month1Total: monthlyInterest + fee + vat,
    finalTotal: schedule[n - 1].total,
    totalRepayment: schedule.reduce((s, r) => s + r.total, 0),
    schedule,
  }
}

// ─── DAYS OVERDUE ────────────────────────────────────────────────────────────
// Shared by both regulatory report generators (BNR quarterly, CRB monthly).
// Originally lived only in lib/bnr-report.ts, where it was built but never
// wired into bucket assignment (BNR defaults every loan to Normal — see that
// file's comments). Moved here 2026-08-14 so CRB can reuse the exact same
// logic for its real, computed Days in Arrears — no behavior change to BNR.
export function getDaysOverdue(maturityDate: string, balance: number, today: Date): number {
  if (balance <= 0) return -1
  const maturity = new Date(maturityDate)
  if (maturity >= today) return 0
  return Math.floor((today.getTime() - maturity.getTime()) / 86400000)
}

// ─── BNR / CRB LOAN CLASSIFICATION BY DAYS IN ARREARS ────────────────────────
// SINGLE SOURCE OF TRUTH for the day-boundary rule. This exact rule was
// independently (and, on 2026-08-23, inconsistently) reimplemented in four
// separate places — lib/crb-report.ts, app/admin/page.tsx's portfolio chart,
// app/admin/iacm/reports/bnr/page.tsx's descriptive copy, and
// app/admin/iacm/loans/page.tsx's getBNRClass(). All four now call this.
// Boundaries per the real BNR "CLASSIFICATION" sheet, cross-checked against
// the TransUnion Rwanda Data Specification v1.9 — see
// docs/bnr-codification-reference.json ("classification").
//
// NOTE: lib/bnr-report.ts deliberately does NOT use this to assign buckets —
// it defaults every loan to Normal by real filed-practice policy (see that
// file and docs/known-gaps.md "Loan classification"). This helper is for the
// CRB generator (which classifies for real) and every day-bucket the admin
// UI DISPLAYS.
export type BnrClass = 1 | 2 | 3 | 4 | 5

export function classifyByDays(days: number): BnrClass {
  if (days <= 29) return 1   // Normal — real 0–29 day grace window
  if (days <= 89) return 2   // Watch
  if (days <= 179) return 3  // Substandard
  if (days <= 359) return 4  // Doubtful
  return 5                   // Loss
}

export const BNR_CLASS_LABEL: Record<BnrClass, string> = {
  1: 'Normal', 2: 'Watch', 3: 'Substandard', 4: 'Doubtful', 5: 'Loss',
}

// Day-range strings, kept next to the boundaries above so descriptive UI copy
// can't drift from the real thresholds.
export const BNR_CLASS_DAY_RANGE: Record<BnrClass, string> = {
  1: '0-29', 2: '30-89', 3: '90-179', 4: '180-359', 5: '360+',
}

// "Normal (0-29d)" style labels for chart legends.
export const BNR_CLASS_RANGE_LABEL: Record<BnrClass, string> = {
  1: `Normal (${BNR_CLASS_DAY_RANGE[1]}d)`,
  2: `Watch (${BNR_CLASS_DAY_RANGE[2]}d)`,
  3: `Substandard (${BNR_CLASS_DAY_RANGE[3]}d)`,
  4: `Doubtful (${BNR_CLASS_DAY_RANGE[4]}d)`,
  5: `Loss (${BNR_CLASS_DAY_RANGE[5]}d)`,
}

// ─── FORMAT HELPERS ──────────────────────────────────────────────────────────
export function formatRWF(amount: number): string {
  return `RWF ${amount.toLocaleString('en-RW')}`
}

export function generateLoanNumber(sequence: number): string {
  const year = new Date().getFullYear()
  return `LN-${year}-${String(sequence).padStart(4, '0')}`
}

export function generateApplicationNumber(sequence: number): string {
  const year = new Date().getFullYear()
  return `INEMA-${year}-${String(sequence).padStart(4, '0')}`
}

// ─── MONTH-LABEL HELPERS ─────────────────────────────────────────────────────
// Shared by Split Expense and Record Salary (2026-08-21) to auto-derive real
// month names from a single entered date, instead of requiring Kevin to type
// them by hand -- the same fix, generalized, for both features' journal
// narrations. Safe to import from both server routes and 'use client' forms
// (no server-only dependencies), same as monthsElapsed() above.
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// The calendar month `offsetMonths` months after the month of `dateStr`
// (offsetMonths=0 -> the same month `dateStr` falls in). Parses the
// YYYY-MM-DD prefix directly rather than `new Date(dateStr)` to avoid the
// UTC-parsing/local-timezone-shift class of bug already documented in
// lib/ledger.ts's toLocalDateString.
export function monthOffset(dateStr: string, offsetMonths: number): { name: string; year: number } {
  const [y, m] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1 + offsetMonths, 1)
  return { name: MONTH_NAMES[d.getMonth()], year: d.getFullYear() }
}

// Joins month labels into natural language matching real historical
// narration style: "July 2026" (one), "July & August 2026" (two), "July,
// August & September 2026" (three or more) -- year shown once at the end
// when every month shares the same year, or spelled out per-month if the
// list crosses a year boundary (e.g. a payment spanning Dec into Jan).
export function joinMonthLabels(months: { name: string; year: number }[]): string {
  if (months.length === 0) return ''
  const sameYear = months.every(m => m.year === months[0].year)
  const labels = sameYear ? months.map(m => m.name) : months.map(m => `${m.name} ${m.year}`)
  const suffix = sameYear ? ` ${months[months.length - 1].year}` : ''
  if (labels.length === 1) return `${labels[0]}${suffix}`
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}${suffix}`
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}${suffix}`
}
