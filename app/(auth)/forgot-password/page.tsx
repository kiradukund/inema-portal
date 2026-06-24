'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function submit() {
    if (!email) { setError('Please enter your email address'); return }
    setLoading(true); setError('')
    const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (e) { setError(e.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-slate-800 font-bold font-serif text-2xl">INEMA</p>
          <p className="text-amber-600 text-xs tracking-widest uppercase mt-1">Reset Password</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          {sent ? (
            <div className="text-center">
              <p className="text-4xl mb-4">📧</p>
              <h2 className="font-bold text-slate-800 mb-2">Check your email</h2>
              <p className="text-slate-500 text-sm">We sent a password reset link to <strong>{email}</strong>. Check your inbox and spam folder.</p>
              <Link href="/login" className="mt-6 inline-block text-amber-600 hover:underline text-sm">Back to login</Link>
            </div>
          ) : (
            <>
              <h2 className="font-bold text-slate-800 mb-1">Forgot your password?</h2>
              <p className="text-slate-500 text-sm mb-6">Enter your email and we'll send you a reset link.</p>
              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
              <label className="label">Email Address</label>
              <input type="email" className="input mb-4" placeholder="you@email.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()} />
              <button className="btn-gold w-full" onClick={submit} disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <div className="text-center mt-4">
                <Link href="/login" className="text-sm text-slate-500 hover:text-amber-600">← Back to login</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
