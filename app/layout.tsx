import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'INEMA Financial Solutions Ltd',
  description: 'Fast. Fair. Flexible Lending. Licensed by the National Bank of Rwanda.',
  icons: {
    // app/favicon.ico is auto-detected by Next.js's file convention, no
    // entry needed here. These are in /public rather than app/, so they
    // need explicit wiring to actually get emitted as <link> tags.
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
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
