import { monthsElapsed } from './calculator'

// Piece 2 (2026-09-14): the real Interest Accruals feature. Pure
// calculation only -- no I/O here, matching the same pure-function/real-
// I/O split already used for lib/vat-return.ts and every other real
// calculation in this codebase.
//
// Real, deliberate design decision worth being explicit about (flagged
// for Kevin, not silently assumed): this reuses monthsElapsed() with
// isFirstPayment = FALSE always, never TRUE -- unlike the real payment-
// allocation logic, which floors a genuine first payment up to at least 1
// month by deliberate business/pricing convention (a real payment is
// being processed; INEMA charges at least one month's interest on it
// regardless of exact elapsed days). Accrual is a different real
// question -- "as of today, how much interest has silently built up" --
// with no payment being processed and no reason to inflate a
// freshly-disbursed loan's accrual. A loan disbursed 3 real days ago
// should show ~0 accrued interest, not a full artificial month. If this
// reading is wrong for how Devotha actually wants it, this is the one
// line to change.
export interface AccrualLoanInput {
  id: string
  loanNumber: string
  clientName: string
  disbursedAmount: number
  disbursementDate: string // YYYY-MM-DD
  lastPaymentDate: string | null
  balanceOutstanding: number
  interestRate: number // monthly, e.g. 0.05 = 5%/month
  interestMethod: 'flat' | 'declining'
  status: string
}

export interface InterestAccrualResult {
  loanId: string
  loanNumber: string
  clientName: string
  periodStart: string
  periodEnd: string
  months: number
  balanceAtAccrual: number
  monthlyRate: number
  interestAmount: number
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// One real loan -> one real accrual result, or null when there is
// genuinely nothing to accrue (a non-active loan, or zero months
// elapsed -- a real, correct 0-accrual outcome, not an error).
export function calculateInterestAccrual(loan: AccrualLoanInput, asOfDate: Date): InterestAccrualResult | null {
  if (loan.status !== 'active') return null

  const periodStart = loan.lastPaymentDate ?? loan.disbursementDate
  const months = monthsElapsed(parseLocalDate(periodStart), asOfDate, false)
  if (months <= 0) return null

  // The one real difference between the two methods, matching exactly
  // the same real distinction already proven in payment allocation:
  // flat bases interest on the original disbursed amount for the life of
  // the loan; declining bases it on the loan's real current balance.
  const base = loan.interestMethod === 'declining' ? loan.balanceOutstanding : loan.disbursedAmount
  const interestAmount = base * loan.interestRate * months

  return {
    loanId: loan.id, loanNumber: loan.loanNumber, clientName: loan.clientName,
    periodStart, periodEnd: `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, '0')}-${String(asOfDate.getDate()).padStart(2, '0')}`,
    months, balanceAtAccrual: base, monthlyRate: loan.interestRate, interestAmount,
  }
}

// Real batch entry point -- every active loan, real per-loan results,
// loans with nothing to accrue simply absent (not zero-padded), matching
// the real preview/review UI's own natural shape (nothing to show for a
// loan nobody needs to look at).
export function calculateInterestAccrualBatch(loans: AccrualLoanInput[], asOfDate: Date): InterestAccrualResult[] {
  return loans
    .map(loan => calculateInterestAccrual(loan, asOfDate))
    .filter((r): r is InterestAccrualResult => r !== null)
}
