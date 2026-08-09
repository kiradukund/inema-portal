// Upstash Redis-backed rate limiter. The previous implementation used an
// in-memory Map, which is broken on Vercel serverless: each function
// invocation can land on a different instance with its own empty store, so
// the limit never actually enforced across requests. Redis is a real shared
// store, so this now works correctly regardless of which instance handles
// a given request.
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

const redis = Redis.fromEnv()

// Fixed windows match the original in-memory implementation's exact reset
// behavior (a hard reset at the end of each window) -- same rules and
// thresholds as before, just enforced correctly now.
const loginLimiter = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(5, '60 s'), prefix: 'ratelimit:login' })
const registerLimiter = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(3, '1 h'), prefix: 'ratelimit:register' })
const applicationLimiter = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(5, '1 h'), prefix: 'ratelimit:application' })
const contactLimiter = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(3, '1 h'), prefix: 'ratelimit:contact' })

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

export async function checkLoginLimit(ip: string) {
  // 5 attempts per 60 seconds
  return loginLimiter.limit(ip)
}

export async function checkRegisterLimit(ip: string) {
  // 3 registrations per hour
  return registerLimiter.limit(ip)
}

export async function checkApplicationLimit(ip: string) {
  // 5 applications per hour
  return applicationLimiter.limit(ip)
}

export async function checkContactLimit(ip: string) {
  // 3 messages per hour
  return contactLimiter.limit(ip)
}

export function rateLimitResponse() {
  return Response.json(
    { success: false, error: 'Too many requests. Please try again later.', data: null },
    { status: 429, headers: { 'Retry-After': '60' } }
  )
}
