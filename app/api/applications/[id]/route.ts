import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { ok, err, unauthorized, forbidden, serverError } from '@/lib/api'

// GET /api/applications/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { data: application, error } = await supabase
      .from('loan_applications')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !application) return err('Application not found', 404)

    // Clients can only see their own applications
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'client' && application.client_id !== user.id) {
      return forbidden()
    }

    return ok(application)
  } catch (e) {
    return serverError(e)
  }
}
