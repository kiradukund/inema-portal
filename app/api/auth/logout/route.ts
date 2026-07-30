import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

const ALLOWED_REDIRECTS = new Set(['/login', '/staff-login'])

function redirectTarget(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to')
  return ALLOWED_REDIRECTS.has(to ?? '') ? to! : '/login'
}

export async function POST(req: NextRequest) {
  const target = redirectTarget(req)
  try {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
  } catch {}
  return NextResponse.redirect(new URL(target, req.url), { status: 302 })
}

export async function GET(req: NextRequest) {
  const target = redirectTarget(req)
  try {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
  } catch {}
  return NextResponse.redirect(new URL(target, req.url), { status: 302 })
}
