// Simple in-memory rate limiter for Vercel serverless functions
// Each function instance has its own store — this is sufficient for INEMA's scale
// For high traffic (10k+ req/min), upgrade to Upstash Redis

const store = new Map<string, { count: number; resetAt: number }>()

function rateLimit(key: string, limit: number, windowMs: number): { success: boolean; remaining: number } {
  const now = Date.now()
  const record = store.get(key)

  if (!record || now > record.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: limit - 1 }
  }

  if (record.count >= limit) {
    return { success: false, remaining: 0 }
  }

  record.count++
  return { success: true, remaining: limit - record.count }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

export function checkLoginLimit(ip: string) {
  // 5 attempts per 60 seconds
  return rateLimit(`login:${ip}`, 5, 60_000)
}

export function checkRegisterLimit(ip: string) {
  // 3 registrations per hour
  return rateLimit(`register:${ip}`, 3, 3_600_000)
}

export function checkApplicationLimit(ip: string) {
  // 5 applications per hour
  return rateLimit(`application:${ip}`, 5, 3_600_000)
}

export function checkContactLimit(ip: string) {
  // 3 messages per hour
  return rateLimit(`contact:${ip}`, 3, 3_600_000)
}

export function rateLimitResponse() {
  return Response.json(
    { success: false, error: 'Too many requests. Please try again later.', data: null },
    { status: 429, headers: { 'Retry-After': '60' } }
  )
}
