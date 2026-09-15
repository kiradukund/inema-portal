import { describe, it, expect } from 'vitest'
import { calculateInterestAccrual, calculateInterestAccrualBatch, type AccrualLoanInput } from '../lib/interest-accrual'

const loan = (overrides: Partial<AccrualLoanInput>): AccrualLoanInput => ({
  id: 'loan-1', loanNumber: 'INEMA-2026-0001', clientName: 'Test Client',
  disbursedAmount: 1_500_000, disbursementDate: '2025-12-25', lastPaymentDate: null,
  balanceOutstanding: 1_500_000, interestRate: 0.05, interestMethod: 'flat', status: 'active',
  ...overrides,
})

describe('calculateInterestAccrual (Piece 2)', () => {
  it('matches the real Emmanuel HABIMANA figure from Devotha\'s own hand-calculated sheet: 1,500,000 at 5%/month x 2 months = 150,000', () => {
    // Real, direct evidence: Interest Calculations R3 -- "Emmanuel HABIMANA",
    // 1,500,000, disbursed 2025-12-25, "Accrued interest for 2 months".
    const result = calculateInterestAccrual(loan({ disbursementDate: '2025-12-25' }), new Date(2026, 1, 25)) // 2 real months later
    expect(result).not.toBeNull()
    expect(result!.months).toBe(2)
    expect(result!.interestAmount).toBe(150_000)
  })

  it('flat method bases interest on the original disbursed amount, never the current balance', () => {
    const result = calculateInterestAccrual(
      loan({ disbursedAmount: 2_000_000, balanceOutstanding: 500_000, interestMethod: 'flat', disbursementDate: '2026-01-01' }),
      new Date(2026, 2, 1) // 2 months later
    )
    expect(result!.balanceAtAccrual).toBe(2_000_000)
    expect(result!.interestAmount).toBe(2_000_000 * 0.05 * 2)
  })

  it('declining method bases interest on the real current outstanding balance, not the original amount', () => {
    const result = calculateInterestAccrual(
      loan({ disbursedAmount: 2_000_000, balanceOutstanding: 500_000, interestMethod: 'declining', disbursementDate: '2026-01-01' }),
      new Date(2026, 2, 1)
    )
    expect(result!.balanceAtAccrual).toBe(500_000)
    expect(result!.interestAmount).toBe(500_000 * 0.05 * 2)
  })

  it('measures the period from the real last payment date when one exists, not the disbursement date', () => {
    const result = calculateInterestAccrual(
      loan({ disbursementDate: '2026-01-01', lastPaymentDate: '2026-05-01' }),
      new Date(2026, 6, 1) // 2 months after the LAST PAYMENT, 6 months after disbursement
    )
    expect(result!.periodStart).toBe('2026-05-01')
    expect(result!.months).toBe(2)
  })

  it('a freshly-disbursed loan with genuinely zero elapsed months returns null, never an artificial 1-month floor', () => {
    // Real, deliberate difference from payment allocation's own
    // isFirstPayment=true floor -- accrual has no "first payment always
    // covers a month" business rule to apply.
    const result = calculateInterestAccrual(loan({ disbursementDate: '2026-06-01' }), new Date(2026, 5, 15))
    expect(result).toBeNull()
  })

  it('a non-active loan never accrues, regardless of elapsed time', () => {
    const result = calculateInterestAccrual(loan({ status: 'completed', disbursementDate: '2025-01-01' }), new Date(2026, 5, 1))
    expect(result).toBeNull()
  })

  it('batch: only active loans with real, nonzero accrual are included -- others simply absent, not zero-padded', () => {
    const results = calculateInterestAccrualBatch([
      loan({ id: 'a', disbursementDate: '2025-12-01' }), // real accrual
      loan({ id: 'b', status: 'completed', disbursementDate: '2025-12-01' }), // excluded: not active
      loan({ id: 'c', disbursementDate: '2026-06-20' }), // excluded: 0 months elapsed
    ], new Date(2026, 6, 1))
    expect(results.map(r => r.loanId)).toEqual(['a'])
  })
})
