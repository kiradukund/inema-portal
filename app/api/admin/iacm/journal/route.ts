import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { accountByCode } from '@/lib/ledger'

interface JournalLineInput {
  account_code: string
  debit?: number
  credit?: number
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAdmin()
    const { entry_date, description, reference, lines } = await req.json()

    if (!entry_date || !description) return err('Date and description are required')
    if (!Array.isArray(lines) || lines.length < 2) return err('At least two lines are required (one debit, one credit)')

    for (const line of lines as JournalLineInput[]) {
      if (!line.account_code || !accountByCode(line.account_code)) return err(`Unknown account code: ${line.account_code}`)
      if (Number(line.debit ?? 0) < 0 || Number(line.credit ?? 0) < 0) return err('Amounts must not be negative')
      if (Number(line.debit ?? 0) > 0 && Number(line.credit ?? 0) > 0) return err('A line cannot have both a debit and a credit')
    }

    const totalDebit = (lines as JournalLineInput[]).reduce((s, l) => s + Number(l.debit ?? 0), 0)
    const totalCredit = (lines as JournalLineInput[]).reduce((s, l) => s + Number(l.credit ?? 0), 0)
    if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.01) {
      return err(`Debits (${totalDebit.toLocaleString()}) must equal credits (${totalCredit.toLocaleString()})`)
    }

    const reference2 = reference || `JE-${Date.now()}`
    const supabase = createAdminClient()
    const { error } = await supabase.from('iacm_journal_entries').insert(
      (lines as JournalLineInput[]).map(l => ({
        entry_date,
        account_code: l.account_code,
        account_name: accountByCode(l.account_code)!.name,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
        description,
        reference: reference2,
        created_by: user.id,
      }))
    )
    if (error) return serverError(error)
    return ok({ reference: reference2 }, 201)
  } catch (e) { return serverError(e) }
}

export async function GET() {
  try {
    await requireAdmin()
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('iacm_journal_entries')
      .select('*')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return serverError(error)
    return ok(data)
  } catch (e) { return serverError(e) }
}
