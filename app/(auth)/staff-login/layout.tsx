import type { Metadata } from 'next'

// staff-login/page.tsx is a client component and can't export metadata
// itself, and it shares the (auth) route group with pages that should
// stay indexed (terms, privacy) — so this gets its own layout rather than
// a group-wide one.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function StaffLoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
