'use client'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { Factor } from '@supabase/supabase-js'

export default function SecuritySettingsPage() {
  // Calls createBrowserClient directly (same pattern as reset-password/
  // forgot-password) instead of importing lib/supabase.ts's createClient().
  // That shared file also exports createServerSupabaseClient(), which
  // imports next/headers at module scope -- any client component that
  // imports anything from that file pulls the whole module graph into the
  // client bundle, and next/headers can't be bundled client-side at all,
  // which broke the production build entirely.
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [factors, setFactors] = useState<Factor[]>([])
  const [loadingFactors, setLoadingFactors] = useState(true)

  const [enrolling, setEnrolling] = useState(false)
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  const [removingId, setRemovingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadFactors() {
    setLoadingFactors(true)
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (!error && data) setFactors(data.totp)
    setLoadingFactors(false)
  }

  useEffect(() => { loadFactors() }, [])

  async function startEnroll() {
    setError(''); setSuccess('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error) { setError(error.message); return }
    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setEnrolling(true)
  }

  async function cancelEnroll() {
    // Clean up the unverified factor rather than leaving a half-enrolled
    // one sitting on the account if the user backs out.
    if (factorId) await supabase.auth.mfa.unenroll({ factorId })
    setEnrolling(false); setFactorId(''); setQrCode(''); setSecret(''); setCode(''); setError('')
  }

  async function verifyCode() {
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return }
    setVerifying(true); setError('')

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError) { setVerifying(false); setError(challengeError.message); return }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId, challengeId: challenge.id, code,
    })
    setVerifying(false)
    if (verifyError) { setError(verifyError.message); return }

    setEnrolling(false); setFactorId(''); setQrCode(''); setSecret(''); setCode('')
    setSuccess('Two-factor authentication is now enabled on your account.')
    loadFactors()
  }

  async function removeFactor(id: string) {
    if (!confirm('Remove two-factor authentication from your account? You will only need your password to sign in afterward.')) return
    setRemovingId(id); setError(''); setSuccess('')
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
    setRemovingId('')
    if (error) { setError(error.message); return }
    setSuccess('Two-factor authentication removed.')
    loadFactors()
  }

  const verifiedFactors = factors.filter(f => f.status === 'verified')
  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-center tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Security</h1>
        <p className="text-slate-500 text-sm mt-1">Manage two-factor authentication for your account</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-bold text-slate-800 mb-1">Two-Factor Authentication (2FA)</h2>
        <p className="text-slate-500 text-sm mb-5">Require a 6-digit code from an authenticator app (Google Authenticator, Authy, etc.) in addition to your password.</p>

        {loadingFactors ? (
          <p className="text-slate-400 text-sm">Loading...</p>
        ) : enrolling ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-2">
              {qrCode && (
                <img
                  src={`data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`}
                  alt="Scan this QR code with your authenticator app"
                  className="w-48 h-48 border border-slate-200 rounded-lg"
                />
              )}
              <p className="text-xs text-slate-400">Can't scan it? Enter this code manually: <span className="font-mono text-slate-600">{secret}</span></p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Enter the 6-digit code from your app</label>
              <input className={inputCls} maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && verifyCode()}
                placeholder="000000" />
            </div>
            <div className="flex gap-3">
              <button onClick={verifyCode} disabled={verifying}
                className="flex-1 bg-amber-600 text-white py-2.5 rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-60 text-sm">
                {verifying ? 'Verifying...' : 'Verify & Enable'}
              </button>
              <button onClick={cancelEnroll}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm text-slate-600 hover:bg-slate-50 border border-slate-200">
                Cancel
              </button>
            </div>
          </div>
        ) : verifiedFactors.length > 0 ? (
          <div className="space-y-3">
            {verifiedFactors.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-green-800">✓ Enabled</p>
                  <p className="text-xs text-green-700">{f.friendly_name || 'Authenticator app'} · added {new Date(f.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => removeFactor(f.id)} disabled={removingId === f.id}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-60">
                  {removingId === f.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <button onClick={startEnroll}
            className="bg-amber-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-amber-700 text-sm">
            Enable Two-Factor Authentication
          </button>
        )}
      </div>
    </div>
  )
}
