import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import PortalShell from './PortalShell'

// Covers /dashboard, /loans, /profile, /calculator, /documents — all
// authenticated client-portal pages showing real personal/financial data.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  return (
    <PortalShell fullName={profile?.full_name} role={profile?.role} isAdmin={isAdmin}>
      {children}
    </PortalShell>
  )
}
