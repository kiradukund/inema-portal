import { MetadataRoute } from 'next'

// Only genuinely public marketing/legal pages. Never add authenticated
// routes here (/admin, /staff-login, /dashboard, /loans, /profile,
// /calculator, /documents) — see app/robots.ts for the matching disallow
// rules and each section's own noindex metadata.
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://inemafinancialsolutions.com'

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ]
}
