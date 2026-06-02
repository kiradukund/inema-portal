// ─── ENUMS ────────────────────────────────────────────────────────────────────

export type LoanType = 'salary_advance' | 'quinzaine' | 'school_fees' | 'business'
export type LoanStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'disbursed' | 'active' | 'completed' | 'defaulted'
export type RepaymentStatus = 'upcoming' | 'due' | 'paid' | 'overdue'
export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected'
export type UserRole = 'client' | 'admin' | 'loan_officer'

// ─── DATABASE TABLES ──────────────────────────────────────────────────────────

export interface Profile {
  id: string                      // matches auth.users.id
  full_name: string
  phone: string
  email: string
  national_id: string | null
  date_of_birth: string | null
  gender: 'male' | 'female' | null
  marital_status: 'single' | 'married' | 'divorced' | 'widowed' | null
  residence_address: string | null
  district: string | null
  sector: string | null
  employment_status: 'employed' | 'self_employed' | 'unemployed' | null
  employer_name: string | null
  monthly_income: number | null
  bank_name: string | null
  bank_account_number: string | null
  momo_number: string | null
  role: UserRole
  crb_consent: boolean
  created_at: string
  updated_at: string
}

export interface LoanProduct {
  id: string
  type: LoanType
  name: string
  description: string
  min_amount: number
  max_amount: number
  min_term_months: number
  max_term_months: number
  monthly_interest_rate: number    // 0.05 = 5%
  upfront_fee_rate: number         // 0.04 = 4% (1% application + 1.5% processing + 1.5% management)
  vat_rate: number                 // 0.18 = 18% applied on upfront fee
  late_payment_rate: number        // 0.05 = 5% per month on overdue
  is_active: boolean
  created_at: string
}

export interface LoanApplication {
  id: string
  application_number: string       // e.g. INEMA-2025-001
  client_id: string
  loan_type: LoanType
  requested_amount: number
  requested_term_months: number
  purpose: string
  status: ApplicationStatus
  // Documents checklist
  has_application_letter: boolean
  has_id_copy: boolean
  has_marital_certificate: boolean
  has_employment_letter: boolean
  has_payslips: boolean            // 3 consecutive months
  has_bank_statement: boolean      // 6 months
  has_valuation_report: boolean
  // Fee consent
  fee_consent: boolean
  crb_consent: boolean
  // Admin fields
  reviewed_by: string | null
  review_notes: string | null
  reviewed_at: string | null
  // Calculated at approval
  approved_amount: number | null
  approved_term_months: number | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export interface Loan {
  id: string
  loan_number: string              // e.g. LN-2025-001
  application_id: string
  client_id: string
  loan_type: LoanType
  principal: number
  term_months: number
  monthly_interest_rate: number    // 0.05
  upfront_fee_rate: number         // 0.04
  vat_rate: number                 // 0.18
  late_payment_rate: number        // 0.05
  // Calculated totals
  upfront_fee_amount: number       // principal * 0.04
  vat_amount: number               // upfront_fee * 0.18
  total_interest: number           // principal * 0.05 * term_months
  total_repayment: number          // principal + total_interest
  // Totals including first month extras
  month1_payment: number           // principal*0.05 + upfront_fee + vat
  monthly_payment: number          // principal * 0.05 (months 2+)
  status: LoanStatus
  disbursed_at: string | null
  due_date: string | null          // final repayment date
  created_at: string
  updated_at: string
}

export interface RepaymentSchedule {
  id: string
  loan_id: string
  client_id: string
  month_number: number             // 1, 2, 3...
  due_date: string
  principal_component: number      // 0 for this model (interest-only monthly)
  interest_amount: number          // principal * 5%
  fee_amount: number               // only month 1: upfront_fee + vat
  total_due: number                // interest + fee_amount
  amount_paid: number
  paid_at: string | null
  status: RepaymentStatus
  late_fee: number                 // calculated if overdue
  notes: string | null
  created_at: string
}

export interface ContactMessage {
  id: string
  full_name: string
  phone: string
  email: string | null
  loan_type: LoanType | 'general' | null
  message: string
  is_read: boolean
  replied_at: string | null
  created_at: string
}

export interface Document {
  id: string
  application_id: string
  client_id: string
  document_type: string
  file_name: string
  file_url: string
  file_size: number
  uploaded_at: string
}

// ─── API RESPONSE ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  error: string
}

// ─── CALCULATOR TYPES ─────────────────────────────────────────────────────────

export interface CalculatorInput {
  principal: number
  term_months: number
  loan_type: LoanType
}

export interface MonthlyBreakdown {
  month: number
  due_date: string
  interest: number
  fee_amount: number               // only month 1
  vat_amount: number               // only month 1
  total_payment: number
  running_balance: number
  label: string                    // "Month 1 (includes fees)" etc.
}

export interface CalculatorResult {
  principal: number
  term_months: number
  loan_type: LoanType
  monthly_interest_rate: number
  upfront_fee_rate: number
  vat_rate: number
  // Month 1 breakdown
  month1_interest: number          // principal * 5%
  month1_fee: number               // principal * 4%
  month1_vat: number               // month1_fee * 18%
  month1_total: number             // month1_interest + month1_fee + month1_vat
  // Months 2+ breakdown
  subsequent_monthly: number       // principal * 5%
  // Totals
  total_interest: number
  total_fees_and_vat: number
  total_cost: number               // total_interest + total_fees_and_vat
  total_repayment: number          // principal + total_cost
  effective_total_rate: string     // percentage string
  schedule: MonthlyBreakdown[]
}
