import { describe, it, expect } from 'vitest'
import { buildVatReturnSummary, type VatJournalLine } from '../lib/vat-return'

const line = (overrides: Partial<VatJournalLine>): VatJournalLine => ({
  entryDate: '2026-04-15', narration: 'x', entryType: 'expense', reference: 'ref-1',
  debitAmount: 0, creditAmount: 0, ...overrides,
})

describe('buildVatReturnSummary (Piece 1)', () => {
  it('classifies a real output-VAT credit (loan fee) correctly', () => {
    const result = buildVatReturnSummary(
      [line({ narration: 'Loan issued to claude', entryType: 'disbursement', creditAmount: 3600, reference: 'loan-1' })],
      '2026-04-01', '2026-06-30'
    )
    expect(result.outputVat).toHaveLength(1)
    expect(result.outputVat[0]).toMatchObject({ amount: 3600, reference: 'loan-1' })
    expect(result.inputVat).toHaveLength(0)
    expect(result.vatPayments).toHaveLength(0)
  })

  it('classifies a real split-expense rent-VAT debit (entry_type expense) as Input VAT, never as a payment', () => {
    const result = buildVatReturnSummary(
      [line({ narration: 'Recognition of rent payment made for may & june', entryType: 'expense', debitAmount: 76271, reference: 'expense-1' })],
      '2026-04-01', '2026-06-30'
    )
    expect(result.inputVat).toHaveLength(1)
    expect(result.inputVat[0].amount).toBe(76271)
    expect(result.vatPayments).toHaveLength(0)
  })

  it('classifies a real, dedicated vat_payment entry as a settlement payment, excluded from input VAT', () => {
    const result = buildVatReturnSummary(
      [line({ narration: 'Payment of quarterly VAT for Q2 2026', entryType: 'vat_payment', debitAmount: 91489, reference: 'vat-payment-1' })],
      '2026-04-01', '2026-06-30'
    )
    expect(result.vatPayments).toHaveLength(1)
    expect(result.vatPayments[0].amount).toBe(91489)
    expect(result.inputVat).toHaveLength(0)
  })

  it('falls back to real, confirmed narration matching for historical manual settlement entries', () => {
    const result = buildVatReturnSummary(
      [line({ narration: 'Payment of quarterly VAT from january to april', entryType: 'manual', debitAmount: 41235, reference: 'manual-1' })],
      '2026-01-01', '2026-04-30'
    )
    expect(result.vatPayments).toHaveLength(1)
    expect(result.inputVat).toHaveLength(0)
  })

  it('treats a manual debit NOT matching the payment pattern as real Input VAT, not a payment', () => {
    const result = buildVatReturnSummary(
      [line({ narration: 'Some other manual VAT adjustment', entryType: 'manual', debitAmount: 5000, reference: 'manual-2' })],
      '2026-01-01', '2026-04-30'
    )
    expect(result.inputVat).toHaveLength(1)
    expect(result.vatPayments).toHaveLength(0)
  })

  it('surfaces a genuinely unexpected entry_type as unclassified, never silently netted either way', () => {
    const result = buildVatReturnSummary(
      [line({ narration: 'Something unexpected', entryType: 'loan_restructuring', debitAmount: 1000, reference: 'r-1' })],
      '2026-01-01', '2026-04-30'
    )
    expect(result.unclassified).toHaveLength(1)
    expect(result.inputVat).toHaveLength(0)
    expect(result.vatPayments).toHaveLength(0)
  })

  it('a real, complete mixed period nets correctly: several output credits, one real input debit, one real payment', () => {
    const result = buildVatReturnSummary([
      line({ creditAmount: 3600, entryType: 'disbursement' }),
      line({ creditAmount: 43200, entryType: 'disbursement' }),
      line({ debitAmount: 76271, entryType: 'expense' }),
      line({ debitAmount: 91489, entryType: 'vat_payment' }),
    ], '2026-01-01', '2026-03-31')
    const totalOutput = result.outputVat.reduce((s, l) => s + l.amount, 0)
    const totalInput = result.inputVat.reduce((s, l) => s + l.amount, 0)
    const totalPaid = result.vatPayments.reduce((s, l) => s + l.amount, 0)
    expect(totalOutput).toBe(46800)
    expect(totalInput).toBe(76271)
    expect(totalOutput - totalInput).toBe(-29471) // real net position -- input exceeded output this period
    expect(totalPaid).toBe(91489) // real cash paid, kept separate from the net calc
  })
})
