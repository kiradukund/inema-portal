'use client'
import { useState, useEffect } from 'react'

const districts = ['Gasabo', 'Kicukiro', 'Nyarugenge', 'Bugesera', 'Gatsibo', 'Kayonza', 'Kirehe', 'Ngoma', 'Nyagatare', 'Rwamagana', 'Burera', 'Gakenke', 'Gicumbi', 'Musanze', 'Rulindo', 'Gisagara', 'Huye', 'Kamonyi', 'Muhanga', 'Nyamagabe', 'Nyamasheke', 'Nyanza', 'Ruhango', 'Karongi', 'Ngororero', 'Nyabihu', 'Rubavu', 'Rusizi', 'Rutsiro', 'Bugesera']

type Profile = {
  full_name: string; email: string; phone: string; national_id: string;
  date_of_birth: string; gender: string; marital_status: string;
  residence_address: string; district: string; sector: string;
  employment_status: string; employer_name: string; monthly_income: string;
  bank_name: string; bank_account_number: string; momo_number: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Partial<Profile>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(d => { if (d.success) setProfile(d.data) })
      .finally(() => setLoading(false))
  }, [])

  function set(key: string, value: string) {
    setProfile(prev => ({ ...prev, [key]: value }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    const res = await fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...profile, monthly_income: profile.monthly_income ? Number(profile.monthly_income) : undefined }),
    })
    const data = await res.json()
    setSaving(false)
    if (!data.success) { setError(data.error); return }
    setSuccess('Profile updated successfully.')
  }

  if (loading) return <div className="p-8 text-slate-500">Loading profile...</div>

  const completeness = [
    profile.national_id, profile.date_of_birth, profile.gender,
    profile.residence_address, profile.district, profile.employment_status,
    profile.monthly_income, profile.momo_number,
  ].filter(Boolean).length

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">My Profile</h1>
      <p className="text-slate-500 mb-2">Keep your information up to date to speed up loan approval.</p>

      {/* Completeness bar */}
      <div className="card mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-slate-700">Profile Completeness</span>
          <span className="text-sm font-bold text-amber-600">{Math.round((completeness / 8) * 100)}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${Math.round((completeness / 8) * 100)}%` }} />
        </div>
        {completeness < 8 && <p className="text-xs text-slate-400 mt-2">Complete all fields to maximize your loan approval chances.</p>}
      </div>

      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <form onSubmit={save} className="space-y-6">
        {/* Personal */}
        <div className="card">
          <h2 className="font-bold text-slate-800 mb-4">Personal Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">Full Name</label>
              <input className="input" value={profile.full_name ?? ''} onChange={e => set('full_name', e.target.value)} /></div>
            <div><label className="label">Email</label>
              <input className="input bg-slate-50" value={profile.email ?? ''} readOnly /></div>
            <div><label className="label">Phone</label>
              <input className="input" type="tel" value={profile.phone ?? ''} onChange={e => set('phone', e.target.value)} /></div>
            <div><label className="label">National ID</label>
              <input className="input" maxLength={16} value={profile.national_id ?? ''} onChange={e => set('national_id', e.target.value)} placeholder="16-digit NID" /></div>
            <div><label className="label">Date of Birth</label>
              <input className="input" type="date" value={profile.date_of_birth ?? ''} onChange={e => set('date_of_birth', e.target.value)} /></div>
            <div><label className="label">Gender</label>
              <select className="input" value={profile.gender ?? ''} onChange={e => set('gender', e.target.value)}>
                <option value="">Select</option><option value="male">Male</option><option value="female">Female</option>
              </select></div>
            <div><label className="label">Marital Status</label>
              <select className="input" value={profile.marital_status ?? ''} onChange={e => set('marital_status', e.target.value)}>
                <option value="">Select</option>
                {['single','married','divorced','widowed'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select></div>
          </div>
        </div>

        {/* Address */}
        <div className="card">
          <h2 className="font-bold text-slate-800 mb-4">Address</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className="label">Residence Address</label>
              <input className="input" value={profile.residence_address ?? ''} onChange={e => set('residence_address', e.target.value)} placeholder="Street, Cell, Sector" /></div>
            <div><label className="label">District</label>
              <select className="input" value={profile.district ?? ''} onChange={e => set('district', e.target.value)}>
                <option value="">Select district</option>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select></div>
            <div><label className="label">Sector</label>
              <input className="input" value={profile.sector ?? ''} onChange={e => set('sector', e.target.value)} placeholder="Your sector" /></div>
          </div>
        </div>

        {/* Employment */}
        <div className="card">
          <h2 className="font-bold text-slate-800 mb-4">Employment & Income</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">Employment Status</label>
              <select className="input" value={profile.employment_status ?? ''} onChange={e => set('employment_status', e.target.value)}>
                <option value="">Select</option>
                <option value="employed">Employed (salaried)</option>
                <option value="self_employed">Self-employed / Business owner</option>
                <option value="unemployed">Unemployed</option>
              </select></div>
            <div><label className="label">Employer / Business Name</label>
              <input className="input" value={profile.employer_name ?? ''} onChange={e => set('employer_name', e.target.value)} /></div>
            <div><label className="label">Monthly Income (RWF)</label>
              <input className="input" type="number" value={profile.monthly_income ?? ''} onChange={e => set('monthly_income', e.target.value)} /></div>
          </div>
        </div>

        {/* Banking */}
        <div className="card">
          <h2 className="font-bold text-slate-800 mb-4">Banking & Mobile Money</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">Bank Name</label>
              <input className="input" value={profile.bank_name ?? ''} onChange={e => set('bank_name', e.target.value)} placeholder="e.g. Bank of Kigali" /></div>
            <div><label className="label">Bank Account Number</label>
              <input className="input" value={profile.bank_account_number ?? ''} onChange={e => set('bank_account_number', e.target.value)} /></div>
            <div><label className="label">MoMo Number (MTN / Airtel)</label>
              <input className="input" type="tel" value={profile.momo_number ?? ''} onChange={e => set('momo_number', e.target.value)} placeholder="+250 7XX XXX XXX" /></div>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-gold px-10 disabled:opacity-60">
          {saving ? 'Saving...' : 'Save Changes ✓'}
        </button>
      </form>
    </div>
  )
}
