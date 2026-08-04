import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase'
import AdminShell from './AdminShell'

// Was previously relying on nothing being linked to these pages — real
// protection, not obscurity: guaranteed to hold even if an admin URL ever
// gets shared, bookmarked-and-leaked, or linked from somewhere external.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  const adminSupabase = createAdminClient()
  const { count: unreadInquiries } = await adminSupabase
    .from('contact_messages').select('*', { count: 'exact', head: true }).eq('is_read', false)

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
  ]

  const iacmItems = [
    { href: '/admin/iacm',              icon: '🏦', label: 'IACM Home' },
    { href: '/admin/iacm/loans',        icon: '📋', label: 'Loan Portfolio' },
    { href: '/admin/iacm/loans/new',    icon: '➕', label: 'New Loan' },
    { href: '/admin/iacm/payments/new', icon: '💵', label: 'Record Payment' },
    { href: '/admin/iacm/expenses/new', icon: '🧾', label: 'Record Expense' },
    { href: '/admin/iacm/journal',      icon: '📒', label: 'Journal' },
    { href: '/admin/iacm/reports/bnr',  icon: '📑', label: 'BNR Report' },
  ]

  return (
    <AdminShell navItems={navItems} iacmItems={iacmItems} unreadInquiries={unreadInquiries ?? 0}>
      {children}
    </AdminShell>
  )
}
