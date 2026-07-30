import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { sendRaw } from '@/lib/email'
import { ok, err, serverError } from '@/lib/api'

// POST /api/admin/send-email — send an arbitrary email through the same
// retrying transporter used elsewhere. Meant to be called independently
// when a notification email (loan approval, rejection, etc.) failed and
// needs to be retried by hand rather than re-running the whole operation.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { to, subject, html } = await req.json().catch(() => ({}))
    if (!to || !subject || !html) return err('to, subject and html are required')

    const sent = await sendRaw(to, subject, html)
    if (!sent) return err('Email failed to send after 3 attempts — check server logs', 502)

    return ok({ message: 'Email sent' })
  } catch (e) { return serverError(e) }
}
