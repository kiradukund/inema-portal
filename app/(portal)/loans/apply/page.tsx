'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ApplyPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    loan_type: '', requested_amount: '', requested_term_months: '',
    purpose: '', employer: '',
    has_id_copy: false, has_payslips: false, has_bank_statement: false,
    has_employment_letter: false, has_marital_certificate: false,
    fee_consent: false, crb_consent: false,
  })

  function rwf(n: number) { return 'RWF ' + Math.round(n).toLocaleString() }

  const loanLimits: Record<string, { min: number; max: number; maxMonths: number }> = {
    salary_advance: { min: 50000, max: 2000000, maxMonths: 6 },
    quinzaine: { min: 50000, max: 1000000, maxMonths: 1 },
    school_fees: { min: 100000, max: 5000000, maxMonths: 6 },
    business: { min: 500000, max: 10000000, maxMonths: 6 },
  }

  const principal = parseFloat(form.requested_amount) || 0
  const months = parseInt(form.requested_term_months) || 1
  const interest = Math.round(principal * 0.05)
  const fee = Math.round(principal * 0.04)
  const vat = Math.round(fee * 0.18)
  const m1 = interest + fee + vat
  const total = principal + m1 + (interest * (months - 1))

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_type: form.loan_type,
          requested_amount: parseFloat(form.requested_amount),
          requested_term_months: parseInt(form.requested_term_months),
          purpose: form.purpose,
          employer: form.employer,
          has_id_copy: form.has_id_copy,
          has_payslips: form.has_payslips,
          has_bank_statement: form.has_bank_statement,
          has_employment_letter: form.has_employment_letter,
          has_marital_certificate: form.has_marital_certificate,
          fee_consent: form.fee_consent,
          crb_consent: form.crb_consent,
        }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error || 'Failed to submit'); setLoading(false); return }
      router.push('/dashboard?applied=1')
    } catch (e) {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const inp = "w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const sel = "w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Apply for a Loan</h1>
        <p className="text-slate-500 text-sm mt-1">Complete all steps to submit your application</p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 mb-8">
        {[1,2,3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= s ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{s}</div>
            {s < 3 && <div className={`h-0.5 w-16 transition-colors ${step > s ? 'bg-amber-600' : 'bg-slate-200'}`} />}
          </div>
        ))}
        <div className="flex gap-12 ml-2 text-xs text-slate-500">
          <span className={step >= 1 ? 'text-amber-600 font-medium' : ''}>Loan Details</span>
          <span className={step >= 2 ? 'text-amber-600 font-medium' : ''}>Documents</span>
          <span className={step >= 3 ? 'text-amber-600 font-medium' : ''}>Review</span>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Step 1 - Loan Details */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-slate-700 mb-4">Step 1: Loan Details</h2>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Loan Type *</label>
            <select className={sel} value={form.loan_type} onChange={e => setForm({...form, loan_type: e.target.value, requested_amount: '', requested_term_months: ''})}>
              <option value="">Select loan type</option>
              <option value="salary_advance">Salary Advance (up to RWF 2M)</option>
              <option value="quinzaine">Quinzaine Loan (up to RWF 1M, 15 days)</option>
              <option value="school_fees">School Fees (up to RWF 5M)</option>
              <option value="business">Business Loan (up to RWF 10M)</option>
            </select>
          </div>

          {form.loan_type && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Amount (RWF) * &nbsp;
                  <span className="text-slate-400 font-normal">
                    Min: {rwf(loanLimits[form.loan_type].min)} · Max: {rwf(loanLimits[form.loan_type].max)}
                  </span>
                </label>
                <input type="number" className={inp} placeholder="e.g. 500000"
                  min={loanLimits[form.loan_type].min} max={loanLimits[form.loan_type].max}
                  value={form.requested_amount} onChange={e => setForm({...form, requested_amount: e.target.value})} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Term (months) * &nbsp;
                  <span className="text-slate-400 font-normal">Max: {loanLimits[form.loan_type].maxMonths} months</span>
                </label>
                <select className={sel} value={form.requested_term_months} onChange={e => setForm({...form, requested_term_months: e.target.value})}>
                  <option value="">Select term</option>
                  {Array.from({length: loanLimits[form.loan_type].maxMonths}, (_,i) => i+1).map(m => (
                    <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Employer / Place of Work</label>
            <input type="text" className={inp} placeholder="e.g. BNR, Private business..."
              value={form.employer} onChange={e => setForm({...form, employer: e.target.value})} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Purpose of Loan *</label>
            <textarea className={inp + " min-h-[80px] resize-none"} placeholder="Briefly explain what you will use this loan for..."
              value={form.purpose} onChange={e => setForm({...form, purpose: e.target.value})} />
          </div>

          {/* Repayment preview */}
          {principal > 0 && months > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Repayment Preview</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Month 1 Payment:</span><br/><span className="font-bold text-slate-800">{rwf(m1)}</span></div>
                {months > 1 && <div><span className="text-slate-500">Monthly (month 2+):</span><br/><span className="font-bold text-slate-800">{rwf(interest)}</span></div>}
                <div><span className="text-slate-500">Total Repayment:</span><br/><span className="font-bold text-amber-700 text-lg">{rwf(total)}</span></div>
                <div><span className="text-slate-500">Total Interest + Fees:</span><br/><span className="font-bold text-slate-800">{rwf(total - principal)}</span></div>
              </div>
            </div>
          )}

          <button
            onClick={() => {
              if (!form.loan_type || !form.requested_amount || !form.requested_term_months || !form.purpose) {
                setError('Please fill all required fields'); return
              }
              setError(''); setStep(2)
            }}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3 rounded-lg transition-colors">
            Next: Documents →
          </button>
        </div>
      )}

      {/* Step 2 - Documents */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-700 mb-2">Step 2: Document Checklist</h2>
          <p className="text-slate-500 text-sm mb-6">
            Confirm which documents you have ready. Bring the originals when visiting our office.
            <a href="/documents" className="text-amber-600 font-medium ml-1">Download required forms →</a>
          </p>

          <div className="space-y-3">
            {[
              { key: 'has_id_copy', label: 'Valid National ID or Passport copy', required: true },
              { key: 'has_payslips', label: 'Last 3 months payslips or income proof', required: true },
              { key: 'has_bank_statement', label: 'Last 3 months bank statement', required: true },
              { key: 'has_employment_letter', label: 'Employment letter or business registration', required: false },
              { key: 'has_marital_certificate', label: 'Marital certificate (if married)', required: false },
            ].map(doc => (
              <label key={doc.key} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${(form as any)[doc.key] ? 'border-green-400 bg-green-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-amber-600"
                  checked={(form as any)[doc.key]}
                  onChange={e => setForm({...form, [doc.key]: e.target.checked})} />
                <div>
                  <span className="text-sm font-medium text-slate-700">{doc.label}</span>
                  {doc.required && <span className="ml-2 text-xs text-red-500 font-medium">Required</span>}
                </div>
              </label>
            ))}
          </div>

          <div className="mt-6 space-y-3 border-t border-slate-100 pt-6">
            <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${form.crb_consent ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
              <input type="checkbox" className="mt-0.5 w-4 h-4 accent-amber-600"
                checked={form.crb_consent} onChange={e => setForm({...form, crb_consent: e.target.checked})} />
              <span className="text-sm text-slate-600">I consent to INEMA checking my CRB (Credit Reference Bureau) report *</span>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${form.fee_consent ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
              <input type="checkbox" className="mt-0.5 w-4 h-4 accent-amber-600"
                checked={form.fee_consent} onChange={e => setForm({...form, fee_consent: e.target.checked})} />
              <span className="text-sm text-slate-600">I understand and agree to the fee structure: 5% monthly interest + 4% upfront fees + 18% VAT on fees (month 1 only) *</span>
            </label>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(1)} className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-lg hover:bg-slate-50 transition-colors">
              ← Back
            </button>
            <button
              onClick={() => {
                if (!form.has_id_copy || !form.has_payslips || !form.has_bank_statement) {
                  setError('Please confirm you have the required documents (ID, payslips, bank statement)'); return
                }
                if (!form.crb_consent || !form.fee_consent) {
                  setError('Please agree to both consent checkboxes to proceed'); return
                }
                setError(''); setStep(3)
              }}
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3 rounded-lg transition-colors">
              Next: Review →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 - Review & Submit */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-700 mb-6">Step 3: Review & Submit</h2>

          <div className="space-y-4 mb-6">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Loan Details</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Type:</span> <span className="font-semibold capitalize">{form.loan_type.replace(/_/g, ' ')}</span></div>
                <div><span className="text-slate-500">Amount:</span> <span className="font-semibold">{rwf(principal)}</span></div>
                <div><span className="text-slate-500">Term:</span> <span className="font-semibold">{form.requested_term_months} months</span></div>
                <div><span className="text-slate-500">Employer:</span> <span className="font-semibold">{form.employer || '—'}</span></div>
              </div>
              {form.purpose && <p className="mt-2 text-sm text-slate-600"><span className="text-slate-400">Purpose:</span> {form.purpose}</p>}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Repayment Summary</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="text-center"><p className="text-slate-500 text-xs">Month 1</p><p className="font-bold text-slate-800">{rwf(m1)}</p></div>
                {months > 1 && <div className="text-center"><p className="text-slate-500 text-xs">Month 2+</p><p className="font-bold text-slate-800">{rwf(interest)}</p></div>}
                <div className="text-center"><p className="text-slate-500 text-xs">Total</p><p className="font-bold text-amber-700">{rwf(total)}</p></div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Documents Confirmed</p>
              <div className="flex flex-wrap gap-2">
                {form.has_id_copy && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">✓ ID Copy</span>}
                {form.has_payslips && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">✓ Payslips</span>}
                {form.has_bank_statement && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">✓ Bank Statement</span>}
                {form.has_employment_letter && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">✓ Employment Letter</span>}
                {form.has_marital_certificate && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">✓ Marital Certificate</span>}
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
            <strong>What happens next:</strong> Our team will review your application within 24 hours and contact you via phone or WhatsApp. Please have your original documents ready.
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-lg hover:bg-slate-50">
              ← Back
            </button>
            <button onClick={handleSubmit} disabled={loading}
              className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold py-3 rounded-lg transition-colors">
              {loading ? 'Submitting...' : '✓ Submit Application'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
