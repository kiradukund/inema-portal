import { createServerSupabaseClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
    return NextResponse.redirect('https://inema-portal-t9a3.vercel.app/login', { status: 302 })
  } catch (e) {
    return NextResponse.redirect('https://inema-portal-t9a3.vercel.app/login', { status: 302 })
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
  } catch {}
  return NextResponse.redirect('https://inema-portal-t9a3.vercel.app/login', { status: 302 })
}
