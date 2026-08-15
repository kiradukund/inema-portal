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
