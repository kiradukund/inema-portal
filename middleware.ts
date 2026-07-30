import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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
  const { pathname } = request.nextUrl

  if (pathname === '/') return response

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/loans') || pathname.startsWith('/profile') || pathname.startsWith('/calculator') || pathname.startsWith('/documents')) {
    if (!user) return NextResponse.redirect(new URL('/login?redirect=' + pathname, request.url))
  }

  if (pathname.startsWith('/admin')) {
    if (!user) return NextResponse.redirect(new URL('/staff-login', request.url))
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (pathname === '/login' && user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role === 'admin') {
      // /login is a client-only boundary — an admin session must never be
      // waved through to /admin from here, even if they were already
      // authenticated (e.g. from a prior /staff-login session) before
      // landing on this page. Sign them out and show why.
      await supabase.auth.signOut()
      const signedOutRedirect = NextResponse.redirect(new URL('/login?notice=staff-only', request.url))
      response.cookies.getAll().forEach(cookie => signedOutRedirect.cookies.set(cookie))
      return signedOutRedirect
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (pathname === '/staff-login' && user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role === 'admin') return NextResponse.redirect(new URL('/admin', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
