'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ApplyPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File>>({})
  const [form, setForm] = useState({
    loan_type: '', requested_amount: '', requested_term_months: '',
    purpose: '', employer: '',
    has_id_copy: false, has_payslips: false, has_bank_statement: false,
    has_employment_letter: false, has_marital_certificate: false,
    fee_consent: false, crb_consent: false,
  })

  function rwf(n: number) { return 'RWF ' + Math.round(n).toLocaleString() }

  const limits: Record<string, {min:number;max:number;maxM:number}> = {
    salary_advance: {min:50000,max:2000000,maxM:6},
    quinzaine: {min:50000,max:1000000,maxM:1},
    school_fees: {min:100000,max:5000000,maxM:6},
    business: {min:500000,max:10000000,maxM:6},
  }

  const p = parseFloat(form.requested_amount) || 0
  const m = parseInt(form.requested_term_months) || 1
  const interest = Math.round(p * 0.05)
  const fee = Math.round(p * 0.04)
  const vat = Math.round(fee * 0.18)
  const m1 = interest + fee + vat
  const total = p + m1 + (interest * (m - 1))

  function handleFile(key: string, file: File | null) {
    if (!file) return
    setUploadedFiles(prev => ({...prev, [key]: file}))
    // Auto-check the checkbox when file is uploaded
    const checkMap: Record<string,string> = {
      id_file: 'has_id_copy', payslip_file: 'has_payslips',
      bank_file: 'has_bank_statement', employment_file: 'has_employment_letter',
      marital_file: 'has_marital_certificate',
    }
    if (checkMap[key]) setForm(prev => ({...prev, [checkMap[key]]: true}))
  }

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
      if (!data.success) { setError(data.error || 'Submission failed'); setLoading(false); return }

      // Upload any attached documents against the just-created application.
      // Best-effort: a client can still submit via the "Have it?" checkbox
      // fallback without a file, so an upload failure here shouldn't block
      // an otherwise-successful application.
      if (Object.keys(uploadedFiles).length > 0) {
        try {
          const fd = new FormData()
          Object.entries(uploadedFiles).forEach(([key, file]) => fd.append(key, file))
          await fetch(`/api/applications/${data.data.application.id}/documents`, { method: 'POST', body: fd })
        } catch {
          console.error('Document upload failed (non-fatal)')
        }
      }

      router.push('/dashboard?applied=1')
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const inp = "w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const sel = inp + " bg-white"

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Apply for a Loan</h1>
        <p className="text-slate-500 text-sm mt-1">Complete all steps to submit your application</p>
      </div>

      {/* Progress */}
      <div className="flex items-center mb-8">
        {['Loan Details','Documents','Review'].map((label,i) => (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step > i+1 ? 'bg-green-500 text-white' : step === i+1 ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {step > i+1 ? '✓' : i+1}
              </div>
              <span className={`text-xs mt-1 whitespace-nowrap ${step === i+1 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>{label}</span>
            </div>
            {i < 2 && <div className={`h-0.5 w-20 mx-2 mb-4 ${step > i+1 ? 'bg-green-500' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* STEP 1 */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-slate-700">Loan Details</h2>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Loan Type *</label>
            <select className={sel} value={form.loan_type}
              onChange={e => setForm({...form, loan_type: e.target.value, requested_amount: '', requested_term_months: ''})}>
              <option value="">Select loan type</option>
              <option value="salary_advance">Salary Advance (up to RWF 2M, 1-6 months)</option>
              <option value="quinzaine">Quinzaine Loan (up to RWF 1M, 15 days)</option>
              <option value="school_fees">School Fees (up to RWF 5M, 1-6 months)</option>
              <option value="business">Business Loan (up to RWF 10M, 1-6 months)</option>
            </select>
          </div>

          {form.loan_type && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Loan Amount (RWF) *
                  <span className="text-slate-400 font-normal ml-2">{rwf(limits[form.loan_type].min)} – {rwf(limits[form.loan_type].max)}</span>
                </label>
                <input type="number" className={inp}
                  placeholder={`Min ${limits[form.loan_type].min}`}
                  min={limits[form.loan_type].min} max={limits[form.loan_type].max}
                  value={form.requested_amount}
                  onChange={e => setForm({...form, requested_amount: e.target.value})} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Repayment Term *</label>
                <select className={sel} value={form.requested_term_months}
                  onChange={e => setForm({...form, requested_term_months: e.target.value})}>
                  <option value="">Select term</option>
                  {Array.from({length: limits[form.loan_type].maxM}, (_,i) => i+1).map(n => (
                    <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Employer / Place of Work</label>
            <input type="text" className={inp} placeholder="e.g. BNR, Self-employed..."
              value={form.employer} onChange={e => setForm({...form, employer: e.target.value})} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Purpose of Loan *</label>
            <textarea className={inp + " min-h-[80px] resize-none"}
              placeholder="Briefly explain what you will use this loan for..."
              value={form.purpose} onChange={e => setForm({...form, purpose: e.target.value})} />
          </div>

          {p > 0 && m > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Repayment Preview</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-slate-500 text-xs">Month 1</p><p className="font-bold text-slate-800">{rwf(m1)}</p></div>
                {m > 1 && <div><p className="text-slate-500 text-xs">Month 2+</p><p className="font-bold text-slate-800">{rwf(interest)}</p></div>}
                <div><p className="text-slate-500 text-xs">Total Repayment</p><p className="font-bold text-amber-700">{rwf(total)}</p></div>
              </div>
            </div>
          )}

          <button onClick={() => {
            if (!form.loan_type) { setError('Please select a loan type'); return }
            if (!form.requested_amount || parseFloat(form.requested_amount) <= 0) { setError('Please enter a valid amount'); return }
            if (!form.requested_term_months) { setError('Please select a repayment term'); return }
            if (!form.purpose.trim()) { setError('Please describe the purpose of your loan'); return }
            setError(''); setStep(2)
          }} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3 rounded-lg transition-colors">
            Next: Documents →
          </button>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-700 mb-1">Documents</h2>
          <p className="text-slate-500 text-sm mb-1">
            Upload your documents or confirm you have them ready to bring to our office.
          </p>
          <a href="/documents" className="text-amber-600 text-sm font-medium hover:underline" target="_blank">
            📁 Download required forms first →
          </a>

          <div className="space-y-3 mt-5">
            {[
              { key: 'has_id_copy', fileKey: 'id_file', label: 'National ID or Passport', required: true, accept: '.pdf,.jpg,.jpeg,.png' },
              { key: 'has_payslips', fileKey: 'payslip_file', label: 'Last 3 months payslips', required: true, accept: '.pdf,.jpg,.jpeg,.png' },
              { key: 'has_bank_statement', fileKey: 'bank_file', label: 'Last 3 months bank statement', required: true, accept: '.pdf,.jpg,.jpeg,.png' },
              { key: 'has_employment_letter', fileKey: 'employment_file', label: 'Employment letter (optional)', required: false, accept: '.pdf,.jpg,.jpeg,.png,.docx' },
              { key: 'has_marital_certificate', fileKey: 'marital_file', label: 'Marital certificate (if married)', required: false, accept: '.pdf,.jpg,.jpeg,.png' },
            ].map(doc => (
              <div key={doc.key} className={`p-4 rounded-xl border-2 transition-colors ${(form as any)[doc.key] ? 'border-green-400 bg-green-50' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${(form as any)[doc.key] ? 'text-green-700' : 'text-slate-700'}`}>
                      {(form as any)[doc.key] ? '✅' : '⬜'} {doc.label}
                    </span>
                    {doc.required && <span className="text-xs text-red-500 font-medium">Required</span>}
                  </div>
                  {uploadedFiles[doc.fileKey] && (
                    <span className="text-xs text-green-600 font-medium">📎 {uploadedFiles[doc.fileKey].name}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer">
                    <div className={`text-center py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${uploadedFiles[doc.fileKey] ? 'bg-green-100 border-green-300 text-green-700' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}`}>
                      {uploadedFiles[doc.fileKey] ? '✓ Uploaded — Click to replace' : '⬆ Upload file'}
                    </div>
                    <input type="file" className="hidden" accept={doc.accept}
                      onChange={e => handleFile(doc.fileKey, e.target.files?.[0] ?? null)} />
                  </label>
                  <button type="button"
                    onClick={() => setForm(prev => ({...prev, [doc.key]: !(prev as any)[doc.key]}))}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${(form as any)[doc.key] ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-slate-200 text-slate-500 hover:border-amber-400'}`}>
                    {(form as any)[doc.key] ? 'Have it ✓' : 'Have it?'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${form.crb_consent ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
              <input type="checkbox" className="mt-0.5 accent-amber-600" checked={form.crb_consent}
                onChange={e => setForm({...form, crb_consent: e.target.checked})} />
              <span className="text-sm text-slate-600">I consent to INEMA checking my CRB report *</span>
            </label>
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${form.fee_consent ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
              <input type="checkbox" className="mt-0.5 accent-amber-600" checked={form.fee_consent}
                onChange={e => setForm({...form, fee_consent: e.target.checked})} />
              <span className="text-sm text-slate-600">I agree to the fee structure: 5% monthly interest + 4% upfront fees + 18% VAT *</span>
            </label>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={() => { setError(''); setStep(1) }}
              className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-lg hover:bg-slate-50">
              ← Back
            </button>
            <button onClick={() => {
              if (!form.has_id_copy || !form.has_payslips || !form.has_bank_statement) {
                setError('Please confirm or upload the 3 required documents (ID, payslips, bank statement)'); return
              }
              if (!form.crb_consent || !form.fee_consent) {
                setError('Please agree to both consent checkboxes'); return
              }
              setError(''); setStep(3)
            }} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3 rounded-lg">
              Next: Review →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-700 mb-6">Review & Submit</h2>

          <div className="space-y-4 mb-6">
            <div className="bg-slate-50 rounded-xl p-4 text-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Loan Details</p>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">Type: </span><span className="font-semibold capitalize">{form.loan_type.replace(/_/g,' ')}</span></div>
                <div><span className="text-slate-500">Amount: </span><span className="font-semibold">{rwf(p)}</span></div>
                <div><span className="text-slate-500">Term: </span><span className="font-semibold">{form.requested_term_months} months</span></div>
                <div><span className="text-slate-500">Employer: </span><span className="font-semibold">{form.employer || '—'}</span></div>
              </div>
              <p className="mt-2"><span className="text-slate-500">Purpose: </span>{form.purpose}</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase mb-3">Repayment Summary</p>
              <div className="grid grid-cols-3 gap-3 text-sm text-center">
                <div><p className="text-slate-500 text-xs">Month 1</p><p className="font-bold">{rwf(m1)}</p></div>
                {m > 1 && <div><p className="text-slate-500 text-xs">Month 2+</p><p className="font-bold">{rwf(interest)}</p></div>}
                <div><p className="text-slate-500 text-xs">Total</p><p className="font-bold text-amber-700">{rwf(total)}</p></div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Documents</p>
              <div className="flex flex-wrap gap-2">
                {form.has_id_copy && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">✓ ID Copy</span>}
                {form.has_payslips && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">✓ Payslips</span>}
                {form.has_bank_statement && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">✓ Bank Statement</span>}
                {form.has_employment_letter && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">✓ Employment Letter</span>}
                {form.has_marital_certificate && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">✓ Marital Certificate</span>}
              </div>
              {Object.keys(uploadedFiles).length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-slate-400 mb-1">Uploaded files:</p>
                  {Object.entries(uploadedFiles).map(([k, f]) => (
                    <p key={k} className="text-xs text-slate-600">📎 {f.name}</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
            <strong>What happens next:</strong> Our team reviews your application within 24 hours and contacts you via phone or WhatsApp. Please have your original documents ready.
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setError(''); setStep(2) }}
              className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-lg hover:bg-slate-50">
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
