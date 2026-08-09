/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Force HTTPS
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Legacy reflected-XSS filter -- deprecated/no-op in modern
          // browsers, kept harmlessly for older ones. This is NOT a CSP
          // (the previous comment here claimed it was -- it isn't one).
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Report-only for now, not enforcing: the homepage renders an
          // inline <script> and <style> via dangerouslySetInnerHTML, and
          // this environment has no way to browser-test whether a strict
          // policy would silently break them before shipping. Report-Only
          // never blocks anything -- it only logs violations to the
          // browser console -- so this is the safe way to find out what a
          // real policy needs to allow before ever switching to enforcing.
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "connect-src 'self' https://*.supabase.co",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
