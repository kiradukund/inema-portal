import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { serverError } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin'

// Months to advance deadline_date by when a recurring item is marked done.
// Confirmed against the real seed data (supabase.sql) — these are the only
// three recurrence values in use (6 monthly_15th, 3 quarterly, 2 annual).
const RECURRENCE_MONTHS: Record<string, number> = {
  monthly_15th: 1,
  quarterly: 3,
  annual: 12,
}

// Pure integer Y/M/D arithmetic — deliberately never goes through a local
// Date object's timezone-sensitive methods for the date math itself (the
// same class of bug already found and fixed in lib/ledger.ts's
// toLocalDateString: constructing/converting dates via local time silently
// shifts the calendar day on this server's UTC+2 timezone). Date.UTC is
// only used to ask "how many days are in month X", which is timezone-safe.
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const newY = Math.floor(total / 12)
  const newM = (total % 12) + 1
  const lastDayOfNewMonth = new Date(Date.UTC(newY, newM, 0)).getUTCDate()
  const newD = Math.min(d, lastDayOfNewMonth)
  return `${newY}-${String(newM).padStart(2, '0')}-${String(newD).padStart(2, '0')}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const { data: deadline, error: fetchErr } = await admin
      .from('compliance_deadlines')
      .select('*')
      .eq('id', params.id)
      .single()
    if (fetchErr || !deadline) return serverError(fetchErr ?? new Error('Deadline not found'))

    // Idempotent: a duplicate submit (double-click, retry) on an
    // already-done row redirects straight back instead of creating a
    // second next-occurrence row.
    if (!deadline.is_done) {
      const { error: updateErr } = await admin
        .from('compliance_deadlines')
        .update({ is_done: true, done_at: new Date().toISOString() })
        .eq('id', params.id)
      if (updateErr) return serverError(updateErr)

      // Recurring deadlines get a NEW row for the next occurrence instead
      // of this row being reused — matches how the quarterly BNR reports
      // were already being tracked by hand (BNR Q2 Report and BNR Q3
      // Report are two separate seeded rows, not one row whose date got
      // bumped), and keeps a real audit trail of past filings in the
      // Completed list instead of silently overwriting it. Confirmed
      // neither read query (dashboard, compliance page) assumes one row
      // per deadline type — both just filter/sort, so this is safe.
      const monthsToAdd = deadline.is_recurring ? RECURRENCE_MONTHS[deadline.recurrence ?? ''] : undefined
      if (monthsToAdd) {
        const { error: insertErr } = await admin.from('compliance_deadlines').insert({
          title: deadline.title,
          description: deadline.description,
          deadline_date: addMonths(deadline.deadline_date, monthsToAdd),
          category: deadline.category,
          is_recurring: true,
          recurrence: deadline.recurrence,
          is_done: false,
        })
        if (insertErr) return serverError(insertErr)
      }
    }

    // 303 See Other: the correct status for a POST handler to redirect to
    // a GET — this is the actual fix for the "dead page" bug. The route
    // previously returned bare JSON (ok({...})), and since the button is a
    // native HTML form (full browser navigation, not fetch), the browser
    // rendered that raw JSON as the page instead of returning the admin to
    // the compliance list.
    return NextResponse.redirect(new URL('/admin/compliance', req.url), { status: 303 })
  } catch (e) {
    return serverError(e)
  }
}
