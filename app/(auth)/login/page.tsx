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

    if (!data.success) { setError(data.error); return }

    // Redirect admin to admin dashboard, clients to portal
    if (data.data?.user?.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white" style={{fontFamily:'Georgia,serif'}}>INEMA</h1>
          <p className="text-amber-500 text-sm tracking-widest uppercase mt-1">Financial Solutions Ltd</p>
          <p className="text-slate-400 text-sm mt-3">Sign in to your account</p>
        </div>

        {/* Two portal options */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
            <p className="text-2xl mb-2">👤</p>
            <p className="text-white font-semibold text-sm">Client Portal</p>
            <p className="text-slate-400 text-xs mt-1">View loans & apply</p>
          </div>
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 text-center">
            <p className="text-2xl mb-2">⚙️</p>
            <p className="text-amber-400 font-semibold text-sm">Admin Dashboard</p>
            <p className="text-slate-400 text-xs mt-1">Manage business</p>
          </div>
        </div>
        <p className="text-slate-500 text-xs text-center mb-6">One login — you will be redirected automatically based on your access level</p>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Sign In</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
              <input type="email" placeholder="your@email.com"
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <input type="password" placeholder="••••••••"
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors mt-2">
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-slate-500">
              No account?{' '}
              <Link href="/register" className="text-amber-600 font-semibold hover:underline">Register here</Link>
            </p>
            <p className="text-sm text-slate-400">
              Need help?{' '}
              <a href="https://wa.me/250788834132" target="_blank" className="text-amber-600 hover:underline">WhatsApp us</a>
            </p>
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Licensed by National Bank of Rwanda — Category III NDFSP
        </p>
      </div>
    </div>
  )
}
