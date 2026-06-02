import { NextRequest } from 'next/server'
import { calculateLoan, formatRWF } from '@/lib/calculator'
import { CalculatorSchema } from '@/lib/validations'
import { ok, err, serverError } from '@/lib/api'

// POST /api/calculator — calculate loan with full repayment schedule
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CalculatorSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? 'Validation error')

    const result = calculateLoan(parsed.data)

    // Build human-readable report
    const report = buildReport(result, parsed.data.loan_type)

    return ok({ ...result, report })

  } catch (e) {
    if (e instanceof Error) return err(e.message)
    return serverError(e)
  }
}

function buildReport(result: ReturnType<typeof calculateLoan>, loan_type: string) {
  const loanTypeNames: Record<string, string> = {
    salary_advance: 'Salary Advance',
    quinzaine: 'Quinzaine Loan',
    school_fees: 'School Fees Loan',
    business: 'Business Loan',
  }

  return {
    title: `INEMA Financial Solutions Ltd — Loan Calculation Report`,
    loan_product: loanTypeNames[loan_type] ?? loan_type,
    summary: {
      'Principal Amount':        formatRWF(result.principal),
      'Loan Term':               `${result.term_months} month${result.term_months > 1 ? 's' : ''}`,
      'Monthly Interest Rate':   `5%`,
      'Upfront Fees (Month 1)':  `4% of principal`,
      'VAT (on fees only)':      `18%`,
    },
    month1_breakdown: {
      label: 'Month 1 Payment Breakdown',
      '5% Monthly Interest':    formatRWF(result.month1_interest),
      '4% Upfront Fees':        formatRWF(result.month1_fee),
      '  └ 1% Application Fee': formatRWF(Math.round(result.principal * 0.01)),
      '  └ 1.5% Processing Fee':formatRWF(Math.round(result.principal * 0.015)),
      '  └ 1.5% Management Fee':formatRWF(Math.round(result.principal * 0.015)),
      '18% VAT (on fees)':      formatRWF(result.month1_vat),
      'MONTH 1 TOTAL':          formatRWF(result.month1_total),
    },
    subsequent_months: result.term_months > 1 ? {
      label: `Months 2–${result.term_months} (each)`,
      '5% Monthly Interest':    formatRWF(result.subsequent_monthly),
      'Fees':                   'None',
      'VAT':                    'None',
      'MONTHLY TOTAL':          formatRWF(result.subsequent_monthly),
    } : null,
    totals: {
      'Total Interest':         formatRWF(result.total_interest),
      'Total Fees + VAT':       formatRWF(result.total_fees_and_vat),
      'Total Cost of Loan':     formatRWF(result.total_cost),
      'Principal':              formatRWF(result.principal),
      'TOTAL REPAYMENT':        formatRWF(result.total_repayment),
      'Effective Total Rate':   result.effective_total_rate,
    },
    schedule: result.schedule.map(s => ({
      month: `Month ${s.month}`,
      label: s.label,
      due_date: s.due_date,
      interest: formatRWF(s.interest),
      fees: s.fee_amount > 0 ? formatRWF(s.fee_amount) : '—',
      vat: s.vat_amount > 0 ? formatRWF(s.vat_amount) : '—',
      total_payment: formatRWF(s.total_payment),
    })),
    disclaimer: 'This calculation is an estimate based on the stated terms. Final amounts are confirmed upon loan approval. Late payments attract a 5% monthly penalty on overdue amounts. INEMA Financial Solutions Ltd is licensed by the National Bank of Rwanda (BNR) — Category III NDFSP.',
  }
}
