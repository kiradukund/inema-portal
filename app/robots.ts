import { MetadataRoute } from 'next'

// robots.txt disallow is a request, not a guarantee — a well-behaved
// crawler honors it, but it cannot force a page out of search results if
// something external ever links to it. The real, guaranteed protection
// for the security-sensitive paths below (/admin, /staff-login,
// /dashboard, /loans, /profile, /calculator, /documents) is the per-page
// `noindex` metadata set in their own layouts, which works even if a page
// gets crawled or linked from elsewhere. This file exists on top of that
// for crawl politeness and to keep low-value utility pages (login,
// register, password flows) out of search results too — those aren't
// sensitive, just not worth indexing.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/staff-login',
          '/dashboard',
          '/loans',
          '/profile',
          '/calculator',
          '/documents',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/api',
        ],
      },
    ],
    sitemap: 'https://inemafinancialsolutions.com/sitemap.xml',
  }
}
