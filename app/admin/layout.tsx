import { requireAdmin } from '@/lib/admin'
import Link from 'next/link'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  const navItems = [
    { href: '/admin',               icon: '📊', label: 'Dashboard' },
    { href: '/admin/applications',  icon: '📥', label: 'Applications' },
    { href: '/admin/clients',       icon: '👥', label: 'Clients' },
    { href: '/admin/loans',         icon: '💳', label: 'Loans' },
    { href: '/admin/income',        icon: '💰', label: 'Income & P&L' },
    { href: '/admin/reminders',     icon: '🔔', label: 'Reminders' },
    { href: '/admin/expenses',      icon: '📋', label: 'Expenses' },
    { href: '/admin/compliance',    icon: '⚖️',  label: 'Tax & BNR' },
    { href: '/admin/inquiries',     icon: '✉️',  label: 'Inquiries' },
    { href: '/admin/upload',        icon: '📁', label: 'Upload Excel' },
  ]

  const iacmItems = [
    { href: '/admin/iacm',              icon: '🏦', label: 'IACM Home' },
    { href: '/admin/iacm/boss',         icon: '👔', label: 'Boss Dashboard' },
    { href: '/admin/iacm/loans',        icon: '📋', label: 'Loan Portfolio' },
    { href: '/admin/iacm/loans/new',    icon: '➕', label: 'New Loan' },
    { href: '/admin/iacm/payments/new', icon: '💵', label: 'Record Payment' },
    { href: '/admin/iacm/expenses/new', icon: '🧾', label: 'Record Expense' },
    { href: '/admin/iacm/reports/bnr',  icon: '📑', label: 'BNR Report' },
  ]

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-60 bg-slate-900 flex flex-col flex-shrink-0 overflow-y-auto">
        <div className="p-5 border-b border-slate-800">
          <p className="text-white font-bold font-serif text-base">INEMA</p>
          <p className="text-amber-500 text-xs tracking-widest uppercase mt-0.5">Admin Portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 py-2 mt-1">Portal</p>
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium">
              <span className="text-base">{item.icon}</span>{item.label}
            </Link>
          ))}
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 py-2 mt-3">IACM — Accounting</p>
          {iacmItems.map(item => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-amber-300 hover:bg-slate-800 hover:text-amber-200 transition-colors text-sm font-medium">
              <span className="text-base">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors text-sm">
            <span>↩</span> Client Portal
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors text-sm">
              <span>🚪</span> Sign Out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto min-h-screen">{children}</main>
    </div>
  )
}
