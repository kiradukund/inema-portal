import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { generateCrbReport } from '@/lib/crb-report'

// POST, not GET: unlike the BNR generator (pure read, never writes),
// generating a CRB report can persist new account_number values onto
// iacm_clients (the first time a client is included in any CRB export) —
// a real side effect, so this isn't safe/idempotent enough to be a GET.
export async function POST() {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const result = await generateCrbReport()
    return new NextResponse(Buffer.from(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.ms-excel',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Loan-Count': String(result.loanCount),
        'X-Added-Count': String(result.addedCount),
        'X-Updated-Count': String(result.updatedCount),
        'X-Removed-Count': String(result.removedCount),
      },
    })
  } catch (e: any) {
    console.error('CRB report error:', e)
    return NextResponse.json({ success: false, error: e?.message ?? 'Failed' }, { status: 500 })
  }
}
