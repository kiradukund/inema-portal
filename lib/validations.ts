import { z } from 'zod'

export const LoanTypeEnum = z.enum(['salary_advance', 'quinzaine', 'school_fees', 'business'])

export const RegisterSchema = z.object({
  full_name:  z.string().min(3, 'Full name required'),
  email:      z.string().email('Invalid email'),
  phone:      z.string().min(10, 'Valid phone number required'),
  password:   z.string().min(8, 'Password must be at least 8 characters'),
})

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export const UpdateProfileSchema = z.object({
  full_name:           z.string().min(3).optional(),
  phone:               z.string().min(10).optional(),
  national_id:         z.string().min(16).max(16).optional(),
  date_of_birth:       z.string().optional(),
  gender:              z.enum(['male', 'female']).optional(),
  marital_status:      z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
  residence_address:   z.string().optional(),
  district:            z.string().optional(),
  sector:              z.string().optional(),
  employment_status:   z.enum(['employed', 'self_employed', 'unemployed']).optional(),
  employer_name:       z.string().optional(),
  monthly_income:      z.number().positive().optional(),
  bank_name:           z.string().optional(),
  bank_account_number: z.string().optional(),
  momo_number:         z.string().optional(),
})

export const LoanApplicationSchema = z.object({
  loan_type:               LoanTypeEnum,
  requested_amount:        z.number().positive('Amount must be positive'),
  requested_term_months:   z.number().int().min(1).max(6),
  purpose:                 z.string().min(10, 'Please describe the purpose (at least 10 characters)'),
  employer:                z.string().optional(),
  has_application_letter:  z.boolean().optional().default(false),
  has_id_copy:             z.boolean().optional().default(false),
  has_marital_certificate: z.boolean().optional().default(false),
  has_employment_letter:   z.boolean().optional().default(false),
  has_payslips:            z.boolean().optional().default(false),
  has_bank_statement:      z.boolean().optional().default(false),
  has_valuation_report:    z.boolean().optional().default(false),
  fee_consent: z.boolean().refine(v => v === true, 'You must consent to the fee structure'),
  crb_consent: z.boolean().refine(v => v === true, 'You must consent to CRB checks'),
})

export const CalculatorSchema = z.object({
  principal:   z.number().positive(),
  term_months: z.number().int().min(1).max(6),
  loan_type:   LoanTypeEnum,
})

export const ContactSchema = z.object({
  full_name: z.string().min(2, 'Name required'),
  phone:     z.string().min(10, 'Valid phone required'),
  email:     z.string().email().optional().or(z.literal('')),
  loan_type: z.enum(['salary_advance', 'quinzaine', 'school_fees', 'business', 'general']).optional(),
  message:   z.string().min(10, 'Message must be at least 10 characters'),
})
