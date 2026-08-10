'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function VerifyForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/admin'

  // Calls createBrowserClient directly rather than importing lib/supabase.ts's
  // createClient() — that shared file also exports a next/headers-based
  // server function, and any Client Component importing from it pulls the
  // whole module graph into the client bundle, which breaks the production
  // build (hit this exact issue with the MFA settings page).
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ))

  const [checking, setChecking] = useState(true)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // If this session doesn't actually need a step-up (no factor enrolled,
    // or already completed this session), don't show the challenge at all
    // — just continue on to the destination.
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (!aal || aal.currentLevel === aal.nextLevel) {
        router.replace(redirectTo)
        return
      }
      setChecking(false)
    })()
  }, [])

  async function verify() {
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return }
    setLoading(true); setError('')

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
    if (factorsError || !factors) { setLoading(false); setError(factorsError?.message ?? 'Could not load your authenticator'); return }
    const factor = factors.totp.find(f => f.status === 'verified')
    if (!factor) { setLoading(false); setError('No verified authenticator found on this account'); return }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (challengeError) { setLoading(false); setError(challengeError.message); return }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id, challengeId: challenge.id, code,
    })
    setLoading(false)
    if (verifyError) { setError(verifyError.message); return }

    router.push(redirectTo)
    router.refresh()
  }

  if (checking) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-white font-bold font-serif text-2xl">INEMA</p>
          <p className="text-slate-400 text-xs tracking-widest uppercase mt-1">Financial Solutions Ltd</p>
          <h1 className="text-lg font-bold text-slate-100 mt-4">Two-Factor Verification</h1>
          <p className="text-xs text-slate-500 mt-1">Enter the 6-digit code from your authenticator app</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm p-8">
          {error && <div className="mb-4 p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-red-300 text-sm">{error}</div>}
          <input
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm mb-4 text-center tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-slate-500"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && verify()}
            placeholder="000000"
            autoFocus
          />
          <button onClick={verify} disabled={loading}
            className="w-full bg-slate-100 text-slate-900 font-bold py-2.5 rounded-lg hover:bg-white transition-colors disabled:opacity-60">
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return <Suspense><VerifyForm /></Suspense>
}
