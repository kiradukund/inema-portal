'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/dashboard',     label: 'Dashboard',      icon: '📊' },
  { href: '/loans',         label: 'My Loans',       icon: '💳' },
  { href: '/loans/apply',   label: 'Apply for Loan', icon: '📝' },
  { href: '/documents',     label: 'Documents',      icon: '📁' },
  { href: '/calculator',    label: 'Calculator',     icon: '🧮' },
  { href: '/profile',       label: 'My Profile',     icon: '👤' },
]

export default function PortalShell({ fullName, role, isAdmin, children }: {
  fullName: string | null | undefined
  role: string | null | undefined
  isAdmin: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Lock background scroll while the mobile sidebar is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  function goHome() {
    if (pathname?.includes('/loans/apply')) {
      if (!window.confirm('You have an unsaved loan application. Are you sure you want to leave?')) return
    }
    router.push('/')
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {open && (
        <div onClick={() => setOpen(false)} className="fixed inset-0 bg-black/50 z-40 md:hidden" />
      )}

      <aside className={`fixed md:static top-0 left-0 h-screen md:h-auto w-[280px] md:w-64 z-50
        bg-slate-900 flex flex-col
        transition-transform duration-300 ease-in-out md:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-slate-700">
          <button onClick={goHome} title="Go to INEMA homepage" className="text-left cursor-pointer hover:opacity-80 transition-opacity">
            <p className="text-white font-bold text-lg" style={{fontFamily:'Georgia,serif'}}>INEMA</p>
            <p className="text-amber-500 text-xs tracking-widest uppercase">Financial Solutions</p>
          </button>
        </div>
        <div className="px-6 py-4 border-b border-slate-700">
          <p className="text-white font-semibold text-sm truncate">{fullName}</p>
          <p className="text-slate-400 text-xs mt-0.5 capitalize">{role ?? 'Client'}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium">
              <span>{link.icon}</span>{link.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" onClick={() => setOpen(false)}
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

      <div className="flex-1 flex flex-col min-h-screen w-full">
        <div className="md:hidden sticky top-0 z-30 bg-slate-900 text-white flex items-center gap-3 px-4 py-3 flex-shrink-0">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-1 flex flex-col gap-1.5">
            <span className="block w-6 h-0.5 bg-white rounded-full" />
            <span className="block w-6 h-0.5 bg-white rounded-full" />
            <span className="block w-6 h-0.5 bg-white rounded-full" />
          </button>
          <p className="font-bold text-sm" style={{fontFamily:'Georgia,serif'}}>INEMA</p>
        </div>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
