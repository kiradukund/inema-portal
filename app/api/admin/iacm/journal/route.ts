import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/admin'
import { ok, serverError, err } from '@/lib/api'
import { accountByCode, postJournalEntry } from '@/lib/ledger'

interface JournalLineInput {
  account_code: string
  debit?: number
  credit?: number
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
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
    const { error } = await postJournalEntry(supabase, {
      entry_date, narration: description, reference: reference2, entry_type: 'manual',
      created_by: auth.profile.full_name,
      lines: (lines as JournalLineInput[]).map(l => ({
        account_code: l.account_code,
        account_name: accountByCode(l.account_code)!.name,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
      })),
    })
    if (error) return serverError(error)
    return ok({ reference: reference2 }, 201)
  } catch (e) { return serverError(e) }
}

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()
    // Embeds the actual debit/credit lines — the header row alone (the old
    // query) carries no account/amount detail at all now that the schema
    // mismatch is fixed; that detail lives in iacm_journal_lines.
    const { data, error } = await supabase
      .from('iacm_journal_entries')
      .select('*, iacm_journal_lines(*)')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return serverError(error)
    return ok(data)
  } catch (e) { return serverError(e) }
}
