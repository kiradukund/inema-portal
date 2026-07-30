'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface NavItem { href: string; icon: string; label: string }

export default function AdminShell({ navItems, iacmItems, unreadInquiries, children }: {
  navItems: NavItem[]
  iacmItems: NavItem[]
  unreadInquiries: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  // Lock background scroll while the mobile sidebar is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <div className="min-h-screen flex bg-slate-50">
      {open && (
        <div onClick={() => setOpen(false)} className="fixed inset-0 bg-black/50 z-40 md:hidden" />
      )}

      <aside className={`fixed md:static top-0 left-0 h-screen md:h-auto w-[280px] md:w-60 z-50
        bg-slate-900 flex flex-col flex-shrink-0 overflow-y-auto
        transition-transform duration-300 ease-in-out md:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 border-b border-slate-800">
          <Link href="/" title="Go to INEMA homepage" className="inline-block cursor-pointer hover:opacity-80 transition-opacity">
            <p className="text-white font-bold font-serif text-base">INEMA</p>
            <p className="text-amber-500 text-xs tracking-widest uppercase mt-0.5">Admin Portal</p>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 py-2 mt-1">Portal</p>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium">
              <span className="text-base">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.href === '/admin/inquiries' && !!unreadInquiries && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {unreadInquiries}
                </span>
              )}
            </Link>
          ))}
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 py-2 mt-3">IACM — Accounting</p>
          {iacmItems.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-amber-300 hover:bg-slate-800 hover:text-amber-200 transition-colors text-sm font-medium">
              <span className="text-base">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <Link href="/dashboard" onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors text-sm">
            <span>↩</span> Client Portal
          </Link>
          <form action="/api/auth/logout?to=/staff-login" method="POST">
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors text-sm">
              <span>🚪</span> Sign Out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen w-full">
        <div className="md:hidden sticky top-0 z-30 bg-slate-900 text-white flex items-center gap-3 px-4 py-3 flex-shrink-0">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-1 flex flex-col gap-1.5">
            <span className="block w-6 h-0.5 bg-white rounded-full" />
            <span className="block w-6 h-0.5 bg-white rounded-full" />
            <span className="block w-6 h-0.5 bg-white rounded-full" />
          </button>
          <p className="font-bold font-serif text-sm">INEMA Admin</p>
        </div>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
