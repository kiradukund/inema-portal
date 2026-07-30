import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { generateBnrReport } from '@/lib/bnr-report'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const quarter = req.nextUrl.searchParams.get('quarter') ?? 'Q3-2026'
    const buffer = await generateBnrReport(quarter)
    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="INEMA_BNR_Report_${quarter}.xlsx"`,
      },
    })
  } catch (e: any) {
    console.error('BNR report error:', e)
    return NextResponse.json({ success: false, error: e?.message ?? 'Failed' }, { status: 500 })
  }
}
