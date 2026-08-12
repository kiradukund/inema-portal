import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { generateBnrReport } from '@/lib/bnr-report'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const quarter = req.nextUrl.searchParams.get('quarter') ?? 'Q3-2026'
    // "submission" produces the exact file that may go to BNR — no
    // internal notes sheet. Anything else ("internal", or the param
    // omitted) is for Kevin/Devotha's own review only and must never be
    // sent to the regulator; the filename itself says so, so the two
    // variants can't be confused once they're sitting in a Downloads
    // folder next to each other.
    const forSubmission = req.nextUrl.searchParams.get('variant') === 'submission'
    const buffer = await generateBnrReport(quarter, undefined, { forSubmission })
    const filename = forSubmission
      ? `INEMA_BNR_Report_${quarter}_FOR_SUBMISSION.xlsx`
      : `INEMA_BNR_Report_${quarter}_INTERNAL_REVIEW_DO_NOT_SEND.xlsx`
    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    console.error('BNR report error:', e)
    return NextResponse.json({ success: false, error: e?.message ?? 'Failed' }, { status: 500 })
  }
}
