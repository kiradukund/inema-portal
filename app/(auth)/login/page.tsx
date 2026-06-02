'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)

    if (!data.success) {
      setError(data.error)
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white font-serif">INEMA</h1>
          <p className="text-amber-500 text-sm tracking-widest uppercase mt-1">Financial Solutions Ltd</p>
          <p className="text-slate-400 text-sm mt-3">Client Portal — Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Welcome back</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                className="input"
                placeholder="your@email.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-slate-500">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-amber-600 font-semibold hover:underline">
                Register
              </Link>
            </p>
            <p className="text-sm text-slate-400">
              Need help?{' '}
              <a href="https://wa.me/250788834132" target="_blank" className="text-amber-600 hover:underline">
                WhatsApp us
              </a>
            </p>
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          🏦 Licensed by National Bank of Rwanda — Category III NDFSP
        </p>
      </div>
    </div>
  )
}
