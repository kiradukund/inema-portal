import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'INEMA Financial Solutions Ltd',
  description: 'Fast. Fair. Flexible Lending. Licensed by the National Bank of Rwanda.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, Arial, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
