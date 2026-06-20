import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest, context: any) {
  const id = context.params.id
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await admin.from('loan_applications')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.redirect(new URL('/admin/applications', req.url))
  } catch (e) {
    console.error(e)
    return NextResponse.redirect(new URL('/admin/applications', req.url))
  }
}
