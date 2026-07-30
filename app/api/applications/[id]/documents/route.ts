import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'
import { ok, err, unauthorized, forbidden, serverError } from '@/lib/api'

// Field name in the multipart form -> human label stored alongside the path.
const DOC_LABELS: Record<string, string> = {
  id_file: 'National ID',
  payslip_file: 'Payslip',
  bank_file: 'Bank Statement',
  employment_file: 'Employment Letter',
  marital_file: 'Marital Certificate',
}
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'])

// POST /api/applications/[id]/documents — client uploads their own loan
// application documents. Runs entirely through the service-role client:
// loan_applications has no client-self-update RLS policy (only
// applications_update_admin), and the storage bucket is private with no
// client-facing policies, so ownership is checked explicitly here instead of
// relying on RLS to enforce it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const adminSupabase = createAdminClient()
    const { data: application, error: appErr } = await adminSupabase
      .from('loan_applications').select('id, client_id, document_urls').eq('id', id).single()
    if (appErr || !application) return err('Application not found', 404)
    if (application.client_id !== user.id) return forbidden()

    const formData = await req.formData()
    const uploaded: { type: string; label: string; path: string; uploaded_at: string }[] = []

    for (const [fieldKey, label] of Object.entries(DOC_LABELS)) {
      const file = formData.get(fieldKey)
      if (!(file instanceof File)) continue
      if (file.size > MAX_FILE_BYTES) return err(`${label} is too large (max 10MB)`)
      if (!ALLOWED_TYPES.has(file.type)) return err(`${label} must be a PDF or image (JPG/PNG)`)

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${user.id}/${id}/${fieldKey}-${Date.now()}-${safeName}`
      const buffer = Buffer.from(await file.arrayBuffer())

      const { error: uploadErr } = await adminSupabase.storage
        .from('loan-documents')
        .upload(path, buffer, { contentType: file.type, upsert: true })
      if (uploadErr) return serverError(uploadErr)

      uploaded.push({ type: fieldKey, label, path, uploaded_at: new Date().toISOString() })
    }

    const existing = Array.isArray(application.document_urls) ? application.document_urls : []
    if (uploaded.length === 0) return ok({ document_urls: existing })

    // Replace any earlier upload of the same document type, keep the rest.
    const uploadedTypes = new Set(uploaded.map(u => u.type))
    const merged = [...existing.filter((d: any) => !uploadedTypes.has(d.type)), ...uploaded]

    const { error: updateErr } = await adminSupabase
      .from('loan_applications').update({ document_urls: merged }).eq('id', id)
    if (updateErr) return serverError(updateErr)

    return ok({ document_urls: merged })
  } catch (e) { return serverError(e) }
}
