'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DuplicateWarningModal, { type DuplicateExisting } from '../../DuplicateWarningModal'

const DISTRICTS = ['Bugesera','Burera','Gakenke','Gasabo','Gatsibo','Gicumbi','Gisagara',
'Huye','Kamonyi','Karongi','Kayonza','Kicukiro','Kirehe','Muhanga','Musanze',
'Ngoma','Ngororero','Nyabihu','Nyagatare','Nyamasheke','Nyanza','Nyarugenge',
'Nyaruguru','Rubavu','Ruhango','Rulindo','Rusizi','Rutsiro','Rwamagana']

const LOAN_TYPES = ['Salary Advance','Business Loan','School Fees Loan','Quinzaine Loan']
const COLLATERAL_TYPES = ['Other assets','Land & Building','Cash deposit','Guarantor','None']
const ECONOMIC_SECTORS = ['Agriculture','Commerce & Trade','Transport','Construction','Services','Education','Health','Other']
const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'Mobile Money (MoMo)' },
  { value: 'cash', label: 'Cash' },
]

// Fixed rate confirmed against every real disbursement in the actual
// historical journal (27 examples checked, zero variance) — 4% fee on
// the disbursed amount, 18% VAT on that fee. Not a manual-entry field:
// auto-calculated here for display, and independently recomputed
// server-side from disbursed_amount so a tampered client value can't
// change what actually posts to the ledger.
const FEE_RATE = 0.04
const VAT_RATE = 0.18

export default function NewLoanEntry() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState<DuplicateExisting | null>(null)

  const [client, setClient] = useState({
    full_name: '', national_id: '', phone: '', gender: 'male',
    age: '', marital_status: 'married', district: 'Gasabo',
    sector: '', cell: '', village: '', previous_loans_paid: 'not_applicable',
    nationality: 'Rwandan', date_of_birth: '', occupation: '',
  })

  const [loan, setLoan] = useState({
    loan_type: 'Salary Advance', disbursed_amount: '', disbursement_date: '',
    maturity_date: '', interest_method: 'flat', repayment_frequency_days: '30',
    grace_period_days: '0', first_payment_date: '', collateral_type: 'Other assets',
    collateral_amount: '0', purpose: '', economic_sector: 'Commerce & Trade',
    loan_officer: 'KUBWIMANA Devotha', disbursement_method: 'bank_transfer',
  })

  async function submit(confirmedDuplicate = false) {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/iacm/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, loan, confirmed_duplicate: confirmedDuplicate }),
      })
      const data = await res.json()
      if (data.success && data.data?.possible_duplicate) {
        setDuplicate(data.data.existing)
        setLoading(false)
      } else if (data.success) {
        router.push('/admin/iacm/loans')
        router.refresh()
      } else {
        setError(data.error ?? 'Failed to save loan')
        setLoading(false)
      }
    } catch (e) {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1"

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Record New Loan</h1>
        <p className="text-slate-500 text-sm mt-1">Enter client details and loan terms</p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-4 mb-8">
        {[{n:1,l:'Client Identity'},{n:2,l:'Loan Terms'},{n:3,l:'Review & Save'}].map(s => (
          <div key={s.n} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
              ${step === s.n ? 'bg-amber-600 text-white' : step > s.n ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {step > s.n ? '✓' : s.n}
            </div>
            <span className={`text-sm font-medium ${step === s.n ? 'text-amber-700' : 'text-slate-400'}`}>{s.l}</span>
            {s.n < 3 && <div className="w-12 h-px bg-slate-200 ml-2" />}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Step 1: Client Identity */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-4">Client Identity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Full Name *</label>
              <input className={inputCls} value={client.full_name} onChange={e => setClient({...client, full_name: e.target.value})} placeholder="e.g. HABIMANA Emmanuel" />
            </div>
            <div>
              <label className={labelCls}>National ID *</label>
              <input className={inputCls} value={client.national_id} onChange={e => setClient({...client, national_id: e.target.value})} placeholder="16-digit NID or passport" />
            </div>
            <div>
              <label className={labelCls}>Phone Number *</label>
              <input className={inputCls} value={client.phone} onChange={e => setClient({...client, phone: e.target.value})} placeholder="07XXXXXXXX" />
            </div>
            <div>
              <label className={labelCls}>Gender</label>
              <select className={inputCls} value={client.gender} onChange={e => setClient({...client, gender: e.target.value})}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Age</label>
              <input type="number" className={inputCls} value={client.age} onChange={e => setClient({...client, age: e.target.value})} placeholder="e.g. 35" />
            </div>
            <div>
              <label className={labelCls}>Marital Status</label>
              <select className={inputCls} value={client.marital_status} onChange={e => setClient({...client, marital_status: e.target.value})}>
                <option value="married">Married</option>
                <option value="single">Single</option>
                <option value="widowed">Widowed</option>
                <option value="divorced">Divorced</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" className={inputCls} value={client.date_of_birth} onChange={e => setClient({...client, date_of_birth: e.target.value})} />
            </div>
            <div>
              <label className={labelCls}>Occupation</label>
              <input className={inputCls} value={client.occupation} onChange={e => setClient({...client, occupation: e.target.value})} placeholder="e.g. Shopkeeper" />
            </div>
            <div>
              <label className={labelCls}>Nationality</label>
              <input className={inputCls} value={client.nationality} onChange={e => setClient({...client, nationality: e.target.value})} placeholder="e.g. Rwandan" />
            </div>
            <div>
              <label className={labelCls}>District</label>
              <select className={inputCls} value={client.district} onChange={e => setClient({...client, district: e.target.value})}>
                {DISTRICTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Sector</label>
              <input className={inputCls} value={client.sector} onChange={e => setClient({...client, sector: e.target.value})} placeholder="e.g. Kimironko" />
            </div>
            <div>
              <label className={labelCls}>Cell</label>
              <input className={inputCls} value={client.cell} onChange={e => setClient({...client, cell: e.target.value})} placeholder="e.g. Bibare" />
            </div>
            <div>
              <label className={labelCls}>Village</label>
              <input className={inputCls} value={client.village} onChange={e => setClient({...client, village: e.target.value})} placeholder="e.g. Ubwiza" />
            </div>
            <div>
              <label className={labelCls}>Previous Loans Paid On Time?</label>
              <select className={inputCls} value={client.previous_loans_paid} onChange={e => setClient({...client, previous_loans_paid: e.target.value})}>
                <option value="not_applicable">First loan (N/A)</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={() => {
              if (!client.full_name || !client.national_id || !client.phone) { setError('Name, NID and phone are required'); return }
              setError(''); setStep(2)
            }} className="bg-amber-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-amber-700">
              Next: Loan Terms →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Loan Terms */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-4">Loan Terms</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Loan Type *</label>
              <select className={inputCls} value={loan.loan_type} onChange={e => setLoan({...loan, loan_type: e.target.value})}>
                {LOAN_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Amount Disbursed (RWF) *</label>
              <input type="number" className={inputCls} value={loan.disbursed_amount} onChange={e => setLoan({...loan, disbursed_amount: e.target.value})} placeholder="e.g. 500000" />
            </div>
            <div className="col-span-2 bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Fee & VAT (auto-calculated, 4% + 18% on the fee)</p>
              <div className="flex justify-between text-slate-700">
                <span>Fee: RWF {(Number(loan.disbursed_amount || 0) * FEE_RATE).toLocaleString()}</span>
                <span>VAT: RWF {(Number(loan.disbursed_amount || 0) * FEE_RATE * VAT_RATE).toLocaleString()}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Charged to the client as a receivable, collected alongside future repayments — not deducted from the amount disbursed.</p>
            </div>
            <div>
              <label className={labelCls}>Disbursement Date *</label>
              <input type="date" className={inputCls} value={loan.disbursement_date} onChange={e => setLoan({...loan, disbursement_date: e.target.value})} />
            </div>
            <div>
              <label className={labelCls}>Disbursed From</label>
              <select className={inputCls} value={loan.disbursement_method} onChange={e => setLoan({...loan, disbursement_method: e.target.value})}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Maturity Date *</label>
              <input type="date" className={inputCls} value={loan.maturity_date} onChange={e => setLoan({...loan, maturity_date: e.target.value})} />
            </div>
            <div>
              <label className={labelCls}>First Payment Date</label>
              <input type="date" className={inputCls} value={loan.first_payment_date} onChange={e => setLoan({...loan, first_payment_date: e.target.value})} />
            </div>
            <div>
              <label className={labelCls}>
                Interest Calculation Method
                <span className="ml-1 text-slate-400 font-normal">(Flat = fixed on original amount · Declining = on reducing balance)</span>
              </label>
              <select className={inputCls} value={loan.interest_method} onChange={e => setLoan({...loan, interest_method: e.target.value})}>
                <option value="flat">Flat Rate</option>
                <option value="declining">Declining Balance</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Repayment Frequency (days)</label>
              <select className={inputCls} value={loan.repayment_frequency_days} onChange={e => setLoan({...loan, repayment_frequency_days: e.target.value})}>
                <option value="15">Every 15 days (Quinzaine)</option>
                <option value="30">Monthly (30 days)</option>
                <option value="90">Quarterly (90 days)</option>
                <option value="180">Every 6 months</option>
                <option value="365">Lump sum at maturity</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Grace Period (days) — 0 if none</label>
              <input type="number" className={inputCls} value={loan.grace_period_days} onChange={e => setLoan({...loan, grace_period_days: e.target.value})} />
            </div>
            <div>
              <label className={labelCls}>Collateral Type</label>
              <select className={inputCls} value={loan.collateral_type} onChange={e => setLoan({...loan, collateral_type: e.target.value})}>
                {COLLATERAL_TYPES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Collateral Value (RWF)</label>
              <input type="number" className={inputCls} value={loan.collateral_amount} onChange={e => setLoan({...loan, collateral_amount: e.target.value})} />
            </div>
            <div>
              <label className={labelCls}>Economic Sector of Borrower</label>
              <select className={inputCls} value={loan.economic_sector} onChange={e => setLoan({...loan, economic_sector: e.target.value})}>
                {ECONOMIC_SECTORS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Loan Officer</label>
              <input className={inputCls} value={loan.loan_officer} onChange={e => setLoan({...loan, loan_officer: e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Purpose of Loan *</label>
              <textarea className={inputCls + ' min-h-[80px] resize-none'} value={loan.purpose} onChange={e => setLoan({...loan, purpose: e.target.value})} placeholder="Describe what the client will use the loan for..." />
            </div>
          </div>
          <div className="mt-6 flex justify-between">
            <button onClick={() => setStep(1)} className="text-slate-500 hover:text-slate-700 text-sm font-semibold">← Back</button>
            <button onClick={() => {
              if (!loan.disbursed_amount || !loan.disbursement_date || !loan.maturity_date || !loan.purpose) { setError('Amount, dates and purpose are required'); return }
              setError(''); setStep(3)
            }} className="bg-amber-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-amber-700">
              Review →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-4">Review & Save</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Client Details</p>
              {[
                ['Name', client.full_name], ['National ID', client.national_id], ['Phone', client.phone],
                ['Gender', client.gender], ['Age', client.age], ['Marital Status', client.marital_status],
                ['Date of Birth', client.date_of_birth || '—'], ['Occupation', client.occupation || '—'],
                ['Nationality', client.nationality || '—'],
                ['Location', `${client.district}, ${client.sector}, ${client.cell}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-slate-50 text-sm">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-semibold text-slate-800">{v}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Loan Terms</p>
              {[
                ['Type', loan.loan_type],
                ['Amount', `RWF ${Number(loan.disbursed_amount).toLocaleString()}`],
                ['Fee (4%)', `RWF ${(Number(loan.disbursed_amount || 0) * FEE_RATE).toLocaleString()}`],
                ['VAT (18% of fee)', `RWF ${(Number(loan.disbursed_amount || 0) * FEE_RATE * VAT_RATE).toLocaleString()}`],
                ['Disbursement', loan.disbursement_date],
                ['Disbursed From', PAYMENT_METHODS.find(m => m.value === loan.disbursement_method)?.label ?? loan.disbursement_method],
                ['Maturity', loan.maturity_date],
                ['Interest Method', loan.interest_method === 'flat' ? 'Flat Rate (5%/month)' : 'Declining Balance (5%/month)'],
                ['Collateral', `${loan.collateral_type} — RWF ${Number(loan.collateral_amount).toLocaleString()}`],
                ['Purpose', loan.purpose],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-slate-50 text-sm">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-semibold text-slate-800 text-right max-w-[200px] truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 flex justify-between">
            <button onClick={() => setStep(2)} className="text-slate-500 hover:text-slate-700 text-sm font-semibold">← Edit</button>
            <button onClick={() => submit()} disabled={loading}
              className="bg-green-600 text-white px-8 py-2.5 rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-60">
              {loading ? 'Saving...' : '✓ Save Loan Record'}
            </button>
          </div>
        </div>
      )}

      {duplicate && (
        <DuplicateWarningModal
          existing={duplicate}
          loading={loading}
          onCancel={() => setDuplicate(null)}
          onConfirm={() => { setDuplicate(null); submit(true) }}
        />
      )}
    </div>
  )
}
