'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!data.success) { setError(data.error); return }
    setSuccess('Account created! Please check your email to verify, then sign in.')
    setTimeout(() => router.push('/login'), 3000)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white font-serif">INEMA</h1>
          <p className="text-amber-500 text-sm tracking-widest uppercase mt-1">Financial Solutions Ltd</p>
          <p className="text-slate-400 text-sm mt-3">Create your client portal account</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Create Account</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input type="text" className="input" placeholder="Your full name"
                value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Email Address</label>
              <input type="email" className="input" placeholder="your@email.com"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="label">Phone Number</label>
              <input type="tel" className="input" placeholder="+250 7XX XXX XXX"
                value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" placeholder="At least 8 characters"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input type="password" className="input" placeholder="Repeat password"
                value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} required />
            </div>
            <button type="submit" disabled={loading}
              className="btn-gold w-full mt-2 disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-amber-600 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
        <p className="text-center text-slate-500 text-xs mt-6">
          🏦 Licensed by National Bank of Rwanda — Category III NDFSP
        </p>
      </div>
    </div>
  )
}
