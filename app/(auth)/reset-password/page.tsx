'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function ResetPassword() {
  const router    = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [ready, setReady]       = useState(false)

  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  useEffect(() => {
    // Real, confirmed fix (2026-09-14): this page is reached from TWO real
    // link types -- a password-reset link (type=recovery) and a staff
    // invite link (type=invite, via inviteUserByEmail()). Confirmed
    // directly against the installed @supabase/auth-js source
    // (GoTrueClient.js): only a `recovery`-type link's URL-based session
    // fires PASSWORD_RECOVERY -- every other type (invite included) fires
    // SIGNED_IN instead. Listening for PASSWORD_RECOVERY alone left an
    // invite link's real recipient stuck forever on "Verifying reset
    // link..." -- found and fixed before ever sending a real invite, not
    // after. Scoped safely: a normal, already-signed-in visit to this page
    // doesn't re-fire SIGNED_IN (no new session is being established), so
    // this only ever triggers for a genuine URL-token-based arrival.
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
  }, [])

  async function submit() {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    const { error: e } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (e) { setError(e.message); return }
    router.push('/login?reset=success')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-slate-800 font-bold font-serif text-2xl">INEMA</p>
          <p className="text-amber-600 text-xs tracking-widest uppercase mt-1">New Password</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          {!ready
            ? <p className="text-slate-500 text-sm text-center">Verifying reset link...</p>
            : <>
                <h2 className="font-bold text-slate-800 mb-1">Set new password</h2>
                <p className="text-slate-500 text-sm mb-6">Choose a strong password.</p>
                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
                <label className="label">New Password</label>
                <input type="password" className="input mb-3" placeholder="Minimum 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
                <label className="label">Confirm Password</label>
                <input type="password" className="input mb-5" placeholder="Repeat password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key==='Enter' && submit()} />
                <button className="btn-gold w-full" onClick={submit} disabled={loading}>{loading ? 'Updating...' : 'Update Password'}</button>
              </>
          }
        </div>
      </div>
    </div>
  )
}
