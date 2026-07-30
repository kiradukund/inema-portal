'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ClientPortalAuth() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirect     = searchParams.get('redirect') ?? '/dashboard'
  const resetOk      = searchParams.get('reset') === 'success'
  const initialTab   = searchParams.get('tab') === 'register' ? 'register' : 'login'
  const staffOnlyNotice = searchParams.get('notice') === 'staff-only'

  const [tab, setTab] = useState<'login' | 'register'>(initialTab)

  function switchTab(next: 'login' | 'register') {
    setTab(next)
    setError(''); setAdminNotice(false)
    setRegError(''); setRegSuccess('')
  }

  // Sign in
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [adminNotice, setAdminNotice] = useState(false)

  // Register
  const [regForm, setRegForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState('')
  const [regLoading, setRegLoading] = useState(false)

  async function submitLogin() {
    if (!email || !password) { setError('Please enter your email and password'); return }
    setLoading(true); setError(''); setAdminNotice(false)
    try {
      const res  = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) })
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Login failed'); setLoading(false); return }

      if (data.data.user.role === 'admin') {
        // /login is a client-only boundary. The login call above already
        // authenticated this session server-side — sign it out immediately
        // rather than let an admin session exist here even briefly, and
        // point them at the right door instead of auto-redirecting them.
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
        setAdminNotice(true)
        setLoading(false)
        return
      }
      router.push(redirect); router.refresh()
    } catch { setError('Something went wrong. Try again.'); setLoading(false) }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError('')
    setRegLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm),
      })
      const data = await res.json()
      setRegLoading(false)
      if (!data.success) { setRegError(data.error ?? 'Registration failed'); return }
      setRegSuccess('Account created! Please check your email to verify, then sign in.')
      setTimeout(() => setTab('login'), 2500)
    } catch {
      setRegLoading(false)
      setRegError('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" title="Go to INEMA homepage" className="inline-block cursor-pointer hover:opacity-80 transition-opacity">
            <p className="text-slate-800 font-bold font-serif text-2xl">INEMA</p>
            <p className="text-amber-600 text-xs tracking-widest uppercase mt-1">Financial Solutions Ltd</p>
          </Link>
          <h1 className="text-lg font-bold text-slate-800 mt-4">Client Portal</h1>
          <p className="text-xs text-slate-400 mt-1">Apply for loans, track your application, manage repayments</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            <button onClick={() => switchTab('login')}
              className={`flex-1 py-3.5 text-sm font-bold transition-colors ${tab === 'login' ? 'text-amber-600 border-b-2 border-amber-500 -mb-px' : 'text-slate-400 hover:text-slate-600'}`}>
              Sign In
            </button>
            <button onClick={() => switchTab('register')}
              className={`flex-1 py-3.5 text-sm font-bold transition-colors ${tab === 'register' ? 'text-amber-600 border-b-2 border-amber-500 -mb-px' : 'text-slate-400 hover:text-slate-600'}`}>
              Register
            </button>
          </div>

          <div className="p-8">
            {tab === 'login' ? (
              <>
                {resetOk && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">✓ Password updated. Please sign in.</div>}
                {(adminNotice || staffOnlyNotice) && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
                    This portal is for clients only. Please use <Link href="/staff-login" className="font-semibold underline">Staff Login →</Link>
                  </div>
                )}
                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
                <label className="label">Email Address</label>
                <input type="email" className="input mb-4" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Password</label>
                </div>
                <input type="password" className="input mb-1" placeholder="Your password" value={password}
                  onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitLogin()} />
                <div className="text-right mb-5">
                  <Link href="/forgot-password" className="text-xs text-amber-600 hover:underline">Forgot password?</Link>
                </div>
                <button className="btn-gold w-full" onClick={submitLogin} disabled={loading}>{loading ? 'Signing in...' : 'Sign In →'}</button>
              </>
            ) : (
              <form onSubmit={submitRegister} className="space-y-4">
                {regError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{regError}</div>}
                {regSuccess && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{regSuccess}</div>}
                <div>
                  <label className="label">Full Name</label>
                  <input type="text" className="input" placeholder="Your full name" required
                    value={regForm.full_name} onChange={e => setRegForm({ ...regForm, full_name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Email Address</label>
                  <input type="email" className="input" placeholder="your@email.com" required
                    value={regForm.email} onChange={e => setRegForm({ ...regForm, email: e.target.value })} />
                </div>
                <div>
                  <label className="label">Phone Number</label>
                  <input type="tel" className="input" placeholder="+250 7XX XXX XXX" required
                    value={regForm.phone} onChange={e => setRegForm({ ...regForm, phone: e.target.value })} />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input type="password" className="input" placeholder="At least 8 characters" required
                    value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })} />
                </div>
                <button type="submit" disabled={regLoading} className="btn-gold w-full disabled:opacity-60">
                  {regLoading ? 'Creating Account...' : 'Create Account'}
                </button>
              </form>
            )}

            <div className="text-center mt-5 pt-5 border-t border-slate-50">
              <p className="text-sm text-slate-500">Need help? <a href="https://wa.me/250788834132" className="text-amber-600 hover:underline">WhatsApp us</a></p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">Licensed by National Bank of Rwanda — Category III NDFSP</p>
        <p className="text-center text-xs text-slate-300 mt-3">
          Are you INEMA staff? <Link href="/staff-login" className="text-slate-400 hover:text-slate-600 hover:underline">Staff Login →</Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><ClientPortalAuth /></Suspense>
}
