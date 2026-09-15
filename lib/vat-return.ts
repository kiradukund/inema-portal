// Piece 1 (2026-09-14): the real VAT Return Summary. Pure classification
// logic only -- no I/O here, the real query lives in the route
// (app/api/admin/iacm/vat-return/route.ts), matching the same
// pure-function/real-I/O split already used throughout this codebase
// (buildRentNarrations, calculateRestructuringFee, etc.).
//
// Real accounting concept this implements: a period's Net VAT Payable is
// Output VAT (collected on loan fees, credits to 2530) minus Input VAT
// (reclaimed on real business costs like rent, debits to 2530) -- it must
// NOT include the actual cash payments made to RRA settling a PRIOR
// period's liability, which are a separate, later event on the same
// account. See docs/accounting-reference.md and tonight's own
// VAT-Return-Summary consultation for the full real reasoning.

export interface VatJournalLine {
  entryDate: string // YYYY-MM-DD
  narration: string
  entryType: string
  reference: string
  debitAmount: number
  creditAmount: number
}

export interface VatReturnLine {
  date: string
  narration: string
  reference: string
  amount: number
}

export interface VatReturnSummary {
  periodStart: string
  periodEnd: string
  outputVat: VatReturnLine[]
  inputVat: VatReturnLine[]
  vatPayments: VatReturnLine[]
  unclassified: VatReturnLine[] // real, honest overflow bucket -- see classifyDebitLine()
}

// Real, deliberate narration fallback for HISTORICAL entries predating the
// dedicated Record VAT Payment action (entry_type: 'vat_payment') -- every
// real payment entry found tonight in the actual Journal used this exact
// phrasing ("Payment of quarterly VAT from September to december", "...from
// january to april"). Case-insensitive, tolerant of the real "to"/"-"
// variations, but deliberately narrow: a false NEGATIVE here (a real
// payment misclassified as Input VAT) inflates Input VAT and understates
// Net Payable -- the wrong direction to be sloppy about for a real
// regulatory figure, so this only matches text closely resembling the
// real, confirmed historical pattern rather than a loose "contains vat"
// check.
const HISTORICAL_PAYMENT_PATTERN = /payment of (quarterly |monthly )?vat/i

// Classifies one real debit-side line (a reduction of the VAT Control
// Account balance) into exactly one of: a real settlement payment
// (excluded from the Output-Input net), real Input VAT (included), or
// genuinely unclassified (included in neither total, surfaced separately
// so a human decides rather than the report silently guessing wrong).
function classifyDebitLine(line: VatJournalLine): 'payment' | 'input' | 'unclassified' {
  // Real, unambiguous: recorded through the dedicated Record VAT Payment
  // action (this Piece's own new route). No guessing needed going forward.
  if (line.entryType === 'vat_payment') return 'payment'
  // Real, unambiguous the other way: the real split-expense feature always
  // posts entry_type 'expense' for a rent-VAT recognition debit -- genuine
  // Input VAT, never a settlement payment.
  if (line.entryType === 'expense') return 'input'
  // Historical manual entries (entry_type 'manual', predating this Piece):
  // fall back to the real, confirmed narration pattern.
  if (line.entryType === 'manual') {
    return HISTORICAL_PAYMENT_PATTERN.test(line.narration) ? 'payment' : 'input'
  }
  // Anything else (a debit to 2530 from an entry_type this function wasn't
  // built to expect) -- surfaced honestly, not silently netted either way.
  return 'unclassified'
}

export function buildVatReturnSummary(
  lines: VatJournalLine[],
  periodStart: string,
  periodEnd: string
): VatReturnSummary {
  const outputVat: VatReturnLine[] = []
  const inputVat: VatReturnLine[] = []
  const vatPayments: VatReturnLine[] = []
  const unclassified: VatReturnLine[] = []

  for (const line of lines) {
    const asReturnLine: VatReturnLine = {
      date: line.entryDate, narration: line.narration, reference: line.reference,
      amount: line.creditAmount > 0 ? line.creditAmount : line.debitAmount,
    }
    if (line.creditAmount > 0) {
      outputVat.push(asReturnLine)
      continue
    }
    if (line.debitAmount > 0) {
      const kind = classifyDebitLine(line)
      if (kind === 'payment') vatPayments.push(asReturnLine)
      else if (kind === 'input') inputVat.push(asReturnLine)
      else unclassified.push(asReturnLine)
    }
  }

  return { periodStart, periodEnd, outputVat, inputVat, vatPayments, unclassified }
}
