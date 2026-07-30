'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function StaffLoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function submit() {
    if (!email || !password) { setError('Please enter your email and password'); return }
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Login failed'); setLoading(false); return }

      if (data.data.user.role !== 'admin') {
        // A valid session was created by the login call above even though
        // this account isn't staff — clear it rather than leave a client
        // signed in via the wrong door.
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
        setError('Access denied. This portal is for staff only. Please use the Client Portal.')
        setLoading(false)
        return
      }
      router.push('/admin'); router.refresh()
    } catch { setError('Something went wrong. Try again.'); setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-white font-bold font-serif text-2xl">INEMA</p>
          <p className="text-slate-400 text-xs tracking-widest uppercase mt-1">Financial Solutions Ltd</p>
          <h1 className="text-lg font-bold text-slate-100 mt-4">Staff &amp; Administrator Login</h1>
          <p className="text-xs text-slate-500 mt-1 tracking-wide uppercase">Authorized Personnel Only</p>
        </div>

        <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-3 mb-5 text-center">
          <p className="text-xs text-amber-300 leading-relaxed">
            This portal is restricted to authorized INEMA Financial Solutions staff only.
            Unauthorized access is prohibited and may be monitored.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm p-8">
          {error && <div className="mb-4 p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-red-300 text-sm">{error}</div>}
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email Address</label>
          <input type="email" placeholder="you@inema.rw" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-slate-500" />
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
          <input type="password" placeholder="Your password" value={password}
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-slate-500" />
          <button onClick={submit} disabled={loading}
            className="w-full bg-slate-100 text-slate-900 font-bold py-2.5 rounded-lg hover:bg-white transition-colors disabled:opacity-60">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">Licensed by National Bank of Rwanda — Category III NDFSP</p>
        <p className="text-center text-xs text-slate-600 mt-3">
          <Link href="/login" className="text-slate-500 hover:text-slate-300 hover:underline">Return to Client Portal →</Link>
        </p>
      </div>
    </div>
  )
}
