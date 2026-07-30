'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirect     = searchParams.get('redirect') ?? '/dashboard'
  const resetOk      = searchParams.get('reset') === 'success'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function submit() {
    if (!email || !password) { setError('Please enter your email and password'); return }
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) })
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Login failed'); setLoading(false); return }
      router.push(redirect); router.refresh()
    } catch { setError('Something went wrong. Try again.'); setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" title="Go to INEMA homepage" className="inline-block cursor-pointer hover:opacity-80 transition-opacity">
            <p className="text-slate-800 font-bold font-serif text-2xl">INEMA</p>
            <p className="text-amber-600 text-xs tracking-widest uppercase mt-1">Financial Solutions Ltd</p>
          </Link>
          <p className="text-xs text-slate-400 mt-3">One login — redirected based on your access level</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <h2 className="font-bold text-slate-800 mb-6 text-center">Sign In</h2>
          {resetOk && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">✓ Password updated. Please sign in.</div>}
          {error   && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <label className="label">Email Address</label>
          <input type="email" className="input mb-4" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Password</label>
            <Link href="/forgot-password" className="text-xs text-amber-600 hover:underline">Forgot password?</Link>
          </div>
          <input type="password" className="input mb-6" placeholder="Your password" value={password}
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==='Enter' && submit()} />
          <button className="btn-gold w-full" onClick={submit} disabled={loading}>{loading ? 'Signing in...' : 'Sign In →'}</button>
          <div className="text-center mt-4 space-y-2">
            <p className="text-sm text-slate-500">No account? <Link href="/register" className="text-amber-600 hover:underline">Register here</Link></p>
            <p className="text-sm text-slate-500">Need help? <a href="https://wa.me/250788834132" className="text-amber-600 hover:underline">WhatsApp us</a></p>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">Licensed by National Bank of Rwanda — Category III NDFSP</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>
}
