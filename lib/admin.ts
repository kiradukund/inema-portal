import { createServerSupabaseClient } from './supabase'
import { redirect } from 'next/navigation'
import { unauthorized, forbidden, mfaRequired } from './api'

// For Server Components / pages only — redirect() is the right behavior
// there. Never use this inside an API Route Handler: redirect() throws a
// special NEXT_REDIRECT signal that a route's own try/catch will swallow
// and turn into a JSON 500 instead of an actual redirect, and — worse —
// it means none of the route's real logic runs at all, silently, since
// the throw happens before any of it. Use requireAdminApi() there instead.
export async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirect=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard?error=unauthorized')
  }

  // Step-up MFA: currentLevel and nextLevel only diverge when this account
  // has a verified TOTP factor AND this session hasn't completed that
  // challenge yet. Accounts with no enrolled factor always have
  // currentLevel === nextLevel, so this is a no-op for them — unenrolled
  // admins see no behavior change at all.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal && aal.currentLevel !== aal.nextLevel) {
    redirect('/staff-login/verify?redirect=/admin')
  }

  return { user, profile }
}

// The API Route Handler equivalent of requireAdmin() — returns a real
// 401/403 JSON response instead of throwing a redirect signal, so a
// route's try/catch can't mangle it into a generic server error.
export async function requireAdminApi() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, response: unauthorized() }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') return { ok: false as const, response: forbidden() }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal && aal.currentLevel !== aal.nextLevel) {
    return { ok: false as const, response: mfaRequired() }
  }

  return { ok: true as const, user, profile }
}

export function formatRWF(n: number): string {
  return 'RWF ' + Math.round(n).toLocaleString('en-RW')
}

export function daysUntil(dateStr: string): number {
  const today = new Date()
  const target = new Date(dateStr)
  const diff = target.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    paid: 'text-green-700 bg-green-50 border-green-200',
    active: 'text-blue-700 bg-blue-50 border-blue-200',
    overdue: 'text-red-700 bg-red-50 border-red-200',
    partial: 'text-amber-700 bg-amber-50 border-amber-200',
    'not paid': 'text-red-700 bg-red-50 border-red-200',
  }
  return map[status.toLowerCase()] ?? 'text-slate-700 bg-slate-50 border-slate-200'
}
