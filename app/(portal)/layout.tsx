import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import PortalShell from './PortalShell'

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
