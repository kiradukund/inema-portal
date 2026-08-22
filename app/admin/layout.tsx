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

// Real incident, 2026-08-22: a genuine loan (INEMA-2026-0027) and its
// disbursement journal entry both existed correctly in the database, but
// the Journal page kept showing a stale render with no fresh-data path --
// survived a hard refresh AND an incognito window, ruling out browser
// caching entirely. Root cause: individual admin pages set
// `dynamic = 'force-dynamic'` alone, which disables static generation but
// does not reliably disable Next.js's own Data Cache for every fetch
// inside that route on every Next 14.2.x deploy target -- confirmed by a
// real, pre-existing inconsistency already in this codebase:
// app/(portal)/loans/page.tsx and app/admin/applications/page.tsx already
// paired `dynamic = 'force-dynamic'` with `revalidate = 0`, while every
// admin page under this layout (Journal, IACM Home, Loan Portfolio, the
// main Dashboard, Inquiries) did not -- see docs/known-gaps.md for the
// full audit.
//
// `revalidate` has real documented cascading semantics `dynamic` does not
// share: when multiple route segments in one render (a layout and its
// page) each set a value, Next.js uses the SHORTEST one across the whole
// route. Setting it to 0 HERE, once, on the layout every admin page
// renders inside, makes zero-caching the enforced floor for the entire
// /admin section -- no page under here, current or future, can end up
// silently stale no matter what it does or doesn't export itself. Kept
// alongside (not instead of) each individual page's own explicit
// `revalidate = 0` for pages that already had the gap, as defense in
// depth -- see docs/known-gaps.md for why both layers are intentional.
export const revalidate = 0

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
    { href: '/admin/settings/security', icon: '🔐', label: 'Security' },
  ]

  const iacmItems = [
    { href: '/admin/iacm',              icon: '🏦', label: 'IACM Home' },
    { href: '/admin/iacm/loans',        icon: '📋', label: 'Loan Portfolio' },
    { href: '/admin/iacm/loans/new',    icon: '➕', label: 'New Loan' },
    { href: '/admin/iacm/loans/restructure/new', icon: '🔄', label: 'Loan Restructuring' },
    { href: '/admin/iacm/payments/new', icon: '💵', label: 'Record Payment' },
    { href: '/admin/iacm/expenses/new', icon: '🧾', label: 'Record Expense' },
    { href: '/admin/iacm/split-expense/new', icon: '🧮', label: 'Split Expense (Prepaid)' },
    { href: '/admin/iacm/salary/new',   icon: '🧑‍💼', label: 'Record Salary' },
    { href: '/admin/iacm/cash-transfer/new', icon: '🏧', label: 'Cash Withdrawal / Transfer' },
    { href: '/admin/iacm/shareholder-loan/new', icon: '🏛️', label: 'Shareholder Loan' },
    { href: '/admin/iacm/journal',      icon: '📒', label: 'Journal' },
    { href: '/admin/iacm/reports/bnr',  icon: '📑', label: 'BNR Report' },
    { href: '/admin/iacm/reports/crb',  icon: '🗂️',  label: 'CRB Report' },
  ]

  return (
    <AdminShell navItems={navItems} iacmItems={iacmItems} unreadInquiries={unreadInquiries ?? 0}>
      {children}
    </AdminShell>
  )
}
