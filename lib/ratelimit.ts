import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Login: 5 attempts per 60 seconds per IP — stops brute-force password guessing
export const loginRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  analytics: true,
  prefix: 'ratelimit:login',
})

// Register: 3 accounts per hour per IP — stops fake account spam
export const registerRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '3600 s'),
  analytics: true,
  prefix: 'ratelimit:register',
})

// Loan applications: 5 per hour per IP — stops application spam
export const applicationRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '3600 s'),
  analytics: true,
  prefix: 'ratelimit:application',
})

// Contact form: 3 per hour per IP — stops message spam
export const contactRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '3600 s'),
  analytics: true,
  prefix: 'ratelimit:contact',
})

// Generic API: 30 requests per 10 seconds per IP — general abuse protection
export const generalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '10 s'),
  analytics: true,
  prefix: 'ratelimit:general',
})

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp
  return '127.0.0.1'
}
