import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const body = await req.json().catch(() => ({}))
    const review_notes = body.review_notes ?? 'Application not approved at this time.'

    const { data: app } = await supabase.from('loan_applications').select('status').eq('id', id).single()
    if (!app) return err('Application not found', 404)
    if (app.status !== 'submitted') return err('Application already processed')

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('loan_applications').update({
      status: 'rejected', reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_notes,
    }).eq('id', id)
    if (error) return serverError(error)
    return ok({ message: 'Application rejected.' })
  } catch (e) { return serverError(e) }
}
