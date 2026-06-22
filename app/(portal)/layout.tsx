import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'

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
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 bg-slate-900 flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <p className="text-white font-bold text-lg" style={{fontFamily:'Georgia,serif'}}>INEMA</p>
          <p className="text-amber-500 text-xs tracking-widest uppercase">Financial Solutions</p>
        </div>
        <div className="px-6 py-4 border-b border-slate-700">
          <p className="text-white font-semibold text-sm truncate">{profile?.full_name}</p>
          <p className="text-slate-400 text-xs mt-0.5 capitalize">{profile?.role ?? 'Client'}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {[
            { href: '/dashboard',     label: 'Dashboard',      icon: '📊' },
            { href: '/loans',         label: 'My Loans',       icon: '💳' },
            { href: '/loans/apply',   label: 'Apply for Loan', icon: '📝' },
            { href: '/documents',     label: 'Documents',      icon: '📁' },
            { href: '/calculator',    label: 'Calculator',     icon: '🧮' },
            { href: '/profile',       label: 'My Profile',     icon: '👤' },
          ].map(link => (
            <Link key={link.href} href={link.href}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium">
              <span>{link.icon}</span>{link.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin"
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-amber-400 hover:bg-amber-900/30 transition-colors text-sm font-medium mt-4 border border-amber-700/30">
              <span>⚙️</span>Admin Dashboard
            </Link>
          )}
        </nav>
        <div className="p-4 border-t border-slate-700">
          <form action="/api/auth/logout" method="POST">
            <button type="submit"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors text-sm">
              <span>🚪</span>Sign Out
            </button>
          </form>
          <p className="text-slate-600 text-xs mt-3 text-center">
            Need help?{' '}
            <a href="https://wa.me/250788834132" target="_blank" className="text-amber-600 hover:underline">WhatsApp us</a>
          </p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
