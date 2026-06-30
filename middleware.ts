import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { loginRatelimit, registerRatelimit, applicationRatelimit, contactRatelimit, getClientIp } from '@/lib/ratelimit'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Rate limiting for sensitive endpoints ──────────────────────────────────
  if (request.method === 'POST') {
    const ip = getClientIp(request)
    let limiter = null
    let limitName = ''

    if (pathname === '/api/auth/login') { limiter = loginRatelimit; limitName = 'login' }
    else if (pathname === '/api/auth/register') { limiter = registerRatelimit; limitName = 'register' }
    else if (pathname === '/api/applications') { limiter = applicationRatelimit; limitName = 'application' }
    else if (pathname === '/api/contact') { limiter = contactRatelimit; limitName = 'contact' }

    if (limiter) {
      const { success, limit, remaining, reset } = await limiter.limit(ip)
      if (!success) {
        return NextResponse.json(
          {
            success: false,
            error: `Too many requests. Please try again in a moment.`,
            data: null,
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': remaining.toString(),
              'X-RateLimit-Reset': reset.toString(),
              'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
            },
          }
        )
      }
    }
  }

  // ── Existing auth/redirect logic ────────────────────────────────────────────
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (pathname === '/') return response

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/loans') || pathname.startsWith('/profile') || pathname.startsWith('/calculator') || pathname.startsWith('/documents')) {
    if (!user) return NextResponse.redirect(new URL('/login?redirect=' + pathname, request.url))
  }

  if (pathname.startsWith('/admin')) {
    if (!user) return NextResponse.redirect(new URL('/login?redirect=/admin', request.url))
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (pathname === '/login' && user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role === 'admin') return NextResponse.redirect(new URL('/admin', request.url))
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
