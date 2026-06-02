'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const LOAN_TYPES = [
  { value: 'salary_advance', label: 'Salary Advance', min: 50000, max: 2000000, maxMonths: 6 },
  { value: 'quinzaine',      label: 'Quinzaine Loan', min: 50000, max: 1000000, maxMonths: 1 },
  { value: 'school_fees',    label: 'School Fees Loan', min: 100000, max: 5000000, maxMonths: 6 },
  { value: 'business',       label: 'Business Loan', min: 500000, max: 10000000, maxMonths: 6 },
]

export default function ApplyPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    loan_type: '', requested_amount: '', requested_term_months: '', purpose: '',
    has_application_letter: false, has_id_copy: false, has_marital_certificate: false,
    has_employment_letter: false, has_payslips: false, has_bank_statement: false,
    has_valuation_report: false, fee_consent: false, crb_consent: false,
  })

  const selectedType = LOAN_TYPES.find(t => t.value === form.loan_type)

  function set(key: string, value: unknown) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function submit() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          requested_amount: Number(form.requested_amount),
          requested_term_months: Number(form.requested_term_months),
        }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error); setLoading(false); return }
      router.push('/loans?applied=1')
    } catch { setError('Something went wrong. Please try again.'); setLoading(false) }
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/loans" className="text-sm text-slate-500 hover:text-amber-600 mb-6 inline-flex items-center gap-1">
        ← Back
      </Link>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Apply for a Loan</h1>
      <p className="text-slate-500 mb-8">Complete all steps to submit your application. Our team reviews within 24 hours.</p>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
              ${step >= s ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-400'}`}>{s}</div>
            {s < 3 && <div className={`h-0.5 w-12 transition-colors ${step > s ? 'bg-amber-500' : 'bg-slate-200'}`} />}
          </div>
        ))}
        <span className="text-xs text-slate-400 ml-2">
          {step === 1 ? 'Loan Details' : step === 2 ? 'Documents Checklist' : 'Review & Submit'}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* STEP 1: Loan Details */}
      {step === 1 && (
        <div className="card space-y-5">
          <h2 className="font-bold text-slate-800">Loan Details</h2>
          <div>
            <label className="label">Loan Type</label>
            <select className="input" value={form.loan_type} onChange={e => set('loan_type', e.target.value)} required>
              <option value="">Select loan type</option>
              {LOAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {selectedType && (
              <p className="text-xs text-slate-400 mt-1">
                RWF {selectedType.min.toLocaleString()} – {selectedType.max.toLocaleString()} · Max {selectedType.maxMonths} month(s)
              </p>
            )}
          </div>
          <div>
            <label className="label">Requested Amount (RWF)</label>
            <input type="number" className="input" placeholder="e.g. 500000"
              value={form.requested_amount} onChange={e => set('requested_amount', e.target.value)} />
          </div>
          <div>
            <label className="label">Repayment Term (Months)</label>
            <select className="input" value={form.requested_term_months} onChange={e => set('requested_term_months', e.target.value)}>
              <option value="">Select term</option>
              {[1,2,3,4,5,6].filter(m => !selectedType || m <= selectedType.maxMonths).map(m =>
                <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>
              )}
            </select>
          </div>
          <div>
            <label className="label">Loan Purpose</label>
            <textarea className="input min-h-[80px] resize-y" placeholder="Describe why you need this loan..."
              value={form.purpose} onChange={e => set('purpose', e.target.value)} />
          </div>
          <button className="btn-gold w-full"
            disabled={!form.loan_type || !form.requested_amount || !form.requested_term_months || !form.purpose}
            onClick={() => setStep(2)}>
            Continue →
          </button>
        </div>
      )}

      {/* STEP 2: Documents */}
      {step === 2 && (
        <div className="card space-y-4">
          <h2 className="font-bold text-slate-800">Documents Checklist</h2>
          <p className="text-sm text-slate-500">Confirm which documents you have ready to bring or submit.</p>
          {[
            { key: 'has_application_letter',  label: 'Application letter (signed)' },
            { key: 'has_id_copy',             label: 'Copy of National ID / Passport' },
            { key: 'has_marital_certificate', label: 'Marital status certificate' },
            { key: 'has_employment_letter',   label: 'Employment letter from employer' },
            { key: 'has_payslips',            label: 'Last 3 consecutive payslips' },
            { key: 'has_bank_statement',      label: 'Bank statement (last 6 months)' },
            { key: 'has_valuation_report',    label: 'Valuation report (for collateral, if applicable)' },
          ].map(doc => (
            <label key={doc.key} className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer"
                checked={form[doc.key as keyof typeof form] as boolean}
                onChange={e => set(doc.key, e.target.checked)} />
              <span className="text-sm text-slate-700 group-hover:text-slate-900">{doc.label}</span>
            </label>
          ))}
          <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-lg">
            You do not need all documents to apply. Our team will confirm exactly what is needed after reviewing your application.
          </p>
          <div className="flex gap-3">
            <button className="btn-outline flex-1" onClick={() => setStep(1)}>← Back</button>
            <button className="btn-gold flex-1" onClick={() => setStep(3)}>Continue →</button>
          </div>
        </div>
      )}

      {/* STEP 3: Review & Consent */}
      {step === 3 && (
        <div className="card space-y-5">
          <h2 className="font-bold text-slate-800">Review & Submit</h2>

          {/* Summary */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Loan Type</span><span className="font-semibold capitalize">{form.loan_type.replace('_', ' ')}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold">RWF {Number(form.requested_amount).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Term</span><span className="font-semibold">{form.requested_term_months} month(s)</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Purpose</span><span className="font-semibold text-right max-w-[60%]">{form.purpose}</span></div>
          </div>

          {/* Fee structure */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
            <p className="font-bold text-amber-800 mb-2">Fee Structure (Month 1)</p>
            <p className="text-amber-700">5% monthly interest + 4% upfront fees (1% application + 1.5% processing + 1.5% management) + 18% VAT on the 4% fees</p>
            <p className="text-amber-700 mt-1">Months 2+: 5% monthly interest only. Late repayment: 5% per month on overdue amount.</p>
          </div>

          {/* Consents */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-4 h-4 accent-amber-500"
              checked={form.fee_consent} onChange={e => set('fee_consent', e.target.checked)} />
            <span className="text-sm text-slate-700">
              I have read and agree to the fee structure above. I understand all costs before signing any loan agreement.
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-4 h-4 accent-amber-500"
              checked={form.crb_consent} onChange={e => set('crb_consent', e.target.checked)} />
            <span className="text-sm text-slate-700">
              I consent to INEMA Financial Solutions Ltd checking my Credit Reference Bureau (CRB) report as part of this application.
            </span>
          </label>

          <div className="flex gap-3">
            <button className="btn-outline flex-1" onClick={() => setStep(2)}>← Back</button>
            <button className="btn-gold flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!form.fee_consent || !form.crb_consent || loading}
              onClick={submit}>
              {loading ? 'Submitting...' : 'Submit Application ✓'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
