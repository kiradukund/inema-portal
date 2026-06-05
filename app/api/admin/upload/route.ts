import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase'
import { ok, err, unauthorized, serverError } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    // Auth check - admin only
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return unauthorized()

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return err('Admin access required', 403)

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return err('No file uploaded')

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls'].includes(ext ?? '')) return err('Please upload an Excel file (.xlsx or .xls)')

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Parse with xlsx
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    const admin = createAdminClient()

    // Skip non-client sheets
    const skipSheets = ['INEMA Income ', 'PAYROOL 1', 'TRAINNING', 'Sheet1', 'Sheet2']
    const clientSheets = workbook.SheetNames.filter(name => !skipSheets.includes(name))

    let clientsImported = 0
    let loansImported = 0
    let installmentsImported = 0
    const errors: string[] = []

    // Clear existing imported data
    await admin.from('installments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await admin.from('imported_loans').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await admin.from('imported_clients').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    for (const sheetName of clientSheets) {
      try {
        const ws = workbook.Sheets[sheetName]
        const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

        if (!rows || rows.length < 2) continue

        // Extract client info by scanning rows
        let phone: string | null = null
        let nid: string | null = null
        let email: string | null = null
        let employer: string | null = null
        const address: string | null = null
        let bank: string | null = null
        let collateral: string | null = null

        for (const row of rows.slice(0, 20)) {
          for (let ci = 0; ci < row.length; ci++) {
            const cell = row[ci]
            if (!cell) continue
            const s = String(cell).trim()

            if (!phone && (s.startsWith('+250') || s.startsWith('07') || s.startsWith('078') || s.startsWith('073') || s.startsWith('072'))) {
              if (s.replace(/\D/g, '').length >= 9) phone = s
            }
            if (!nid && /^\d{16}$/.test(s.replace(/\s/g, ''))) nid = s.replace(/\s/g, '')
            if (!email && s.includes('@') && s.includes('.') && !s.includes(' ')) email = s
            if (!employer && s.toLowerCase().includes('place of work:')) {
              const next = row[ci + 1]
              if (next) employer = String(next).trim()
            }
            if (!bank && (s.toLowerCase().startsWith('bk ') || s.toLowerCase().startsWith('bpr ') || 
                s.toLowerCase().startsWith('ncba ') || s.toLowerCase().startsWith('equity '))) bank = s
            if (!collateral && s.toLowerCase().includes('upi:')) collateral = s
            if (!collateral && s.toLowerCase().startsWith('car plate')) collateral = s
          }
        }

        // Insert client
        const { data: clientData, error: clientErr } = await admin
          .from('imported_clients')
          .insert({
            full_name: sheetName.trim(),
            phone: phone?.replace('Tel:', '').trim() ?? null,
            nid,
            email,
            employer,
            address,
            bank_account: bank,
            collateral,
          })
          .select('id')
          .single()

        if (clientErr || !clientData) {
          errors.push(`Failed to import client: ${sheetName}`)
          continue
        }
        clientsImported++

        // Now extract loans from the sheet
        // Look for rows with large numbers (principals) and dates
        const loans = extractLoansFromSheet(rows)

        for (const loan of loans) {
          const { data: loanData, error: loanErr } = await admin
            .from('imported_loans')
            .insert({
              client_id: clientData.id,
              client_name: sheetName.trim(),
              principal: loan.principal,
              term_months: loan.term_months,
              date_offered: loan.date_offered,
              repayment_date: loan.repayment_date,
              total_due: loan.total_due,
              amount_paid: loan.amount_paid,
              outstanding: Math.max(0, (loan.total_due ?? 0) - (loan.amount_paid ?? 0)),
              status: loan.status,
              collateral: loan.collateral ?? collateral,
              has_installments: loan.installments.length > 0,
              source: 'excel',
            })
            .select('id')
            .single()

          if (loanErr || !loanData) continue
          loansImported++

          // Insert installments
          for (const inst of loan.installments) {
            await admin.from('installments').insert({
              loan_id: loanData.id,
              client_name: sheetName.trim(),
              num: inst.num,
              amount: inst.amount,
              due_date: inst.due_date,
              status: inst.status,
              amount_paid: inst.amount_paid ?? 0,
            })
            installmentsImported++
          }
        }

      } catch (e) {
        errors.push(`Error processing sheet ${sheetName}: ${e instanceof Error ? e.message : 'Unknown'}`)
      }
    }

    // Log upload
    await admin.from('excel_uploads').insert({
      filename: file.name,
      records_count: clientsImported,
      status: errors.length > 0 ? 'partial' : 'success',
      notes: errors.length > 0 ? errors.slice(0, 3).join('; ') : null,
    })

    return ok({
      message: `Excel synced successfully! Dashboard updated.`,
      stats: {
        clients_imported: clientsImported,
        loans_imported: loansImported,
        installments_imported: installmentsImported,
        errors: errors.length,
      },
    })

  } catch (e) {
    return serverError(e)
  }
}

// ── Extract loan data from a client sheet ────────────────────────────────────
function extractLoansFromSheet(rows: (string | number | null)[][]) {
  const loans: {
    principal: number
    term_months: number
    date_offered: string | null
    repayment_date: string | null
    total_due: number
    amount_paid: number
    status: string
    collateral: string | null
    installments: { num: number; amount: number; due_date: string; status: string; amount_paid: number }[]
  }[] = []

  // Scan for loan blocks
  // A loan block typically has: principal, loan offered date, repayment date, total due, paid/not paid
  let i = 0
  while (i < rows.length) {
    const row = rows[i]
    if (!row) { i++; continue }

    // Look for principal amount (large RWF amount between 50k and 15M)
    for (let ci = 0; ci < row.length; ci++) {
      const cell = row[ci]
      if (!cell) continue
      const s = String(cell).trim().toLowerCase()

      // Look for "loan amount" or "principal" keyword
      if (s.includes('loan amount') || s.includes('principal') || s === 'amount') {
        // Find the amount in next column or same row
        const amtCell = row[ci + 1] ?? row[ci + 2]
        const amt = parseAmount(amtCell)
        if (amt && amt >= 50000 && amt <= 15000000) {
          const loan = buildLoan(rows, i, amt)
          if (loan) loans.push(loan)
        }
      }

      // Also look for raw large numbers that look like principals
      const amt = parseAmount(cell)
      if (amt && amt >= 50000 && amt <= 15000000) {
        // Check context - is this row about a loan?
        const rowText = row.map(c => String(c ?? '').toLowerCase()).join(' ')
        if (rowText.includes('loan') || rowText.includes('principal') || rowText.includes('amount')) {
          const loan = buildLoan(rows, i, amt)
          if (loan && !loans.find(l => l.principal === loan.principal && l.date_offered === loan.date_offered)) {
            loans.push(loan)
          }
        }
      }
    }
    i++
  }

  // If no loans found by keywords, try to extract from common patterns
  if (loans.length === 0) {
    const extracted = extractLoansSimple(rows)
    loans.push(...extracted)
  }

  return loans
}

function buildLoan(rows: (string | number | null)[][], startRow: number, principal: number) {
  let dateOffered: string | null = null
  let repaymentDate: string | null = null
  let totalDue: number = 0
  let amountPaid: number = 0
  let status = 'active'
  let collateral: string | null = null
  let termMonths = 1
  const installments: { num: number; amount: number; due_date: string; status: string; amount_paid: number }[] = []

  // Scan surrounding rows for loan details
  const scanRows = rows.slice(Math.max(0, startRow - 2), Math.min(rows.length, startRow + 30))

  for (const row of scanRows) {
    if (!row) continue
    const rowText = row.map(c => String(c ?? '').toLowerCase()).join(' ')

    // Dates
    for (const cell of row) {
      if (cell && typeof cell === 'object' && 'toISOString' in (cell as object)) {
        const ds = formatDate(cell as unknown as Date)
        if (!dateOffered) dateOffered = ds
        else if (!repaymentDate) repaymentDate = ds
      } else if (cell && typeof cell === 'string' && /\d{4}-\d{2}-\d{2}/.test(cell)) {
        if (!dateOffered) dateOffered = cell
        else if (!repaymentDate) repaymentDate = cell
      }
    }

    // Total due
    if (rowText.includes('total') || rowText.includes('payable')) {
      for (const cell of row) {
        const amt = parseAmount(cell)
        if (amt && amt > principal && amt < principal * 3) {
          totalDue = amt
        }
      }
    }

    // Amount paid
    if (rowText.includes('paid') || rowText.includes('received')) {
      for (const cell of row) {
        const amt = parseAmount(cell)
        if (amt && amt > 0 && amt <= (totalDue || principal * 2)) {
          amountPaid = Math.max(amountPaid, amt)
        }
      }
    }

    // Status
    if (rowText.includes('not paid')) status = 'not paid'
    else if (rowText.includes('paid') && !rowText.includes('not paid')) status = 'paid'
    else if (rowText.includes('overdue')) status = 'overdue'

    // Collateral
    if (rowText.includes('upi:') || rowText.includes('car plate')) {
      for (const cell of row) {
        if (cell && (String(cell).includes('UPI:') || String(cell).toLowerCase().includes('car plate'))) {
          collateral = String(cell)
        }
      }
    }

    // Installments
    if (rowText.match(/instalment\s*\d|payment\s*\d/)) {
      const numMatch = rowText.match(/(\d+)/)
      if (numMatch) {
        const num = parseInt(numMatch[1])
        let instAmt = 0
        let instDate: string | null = null
        let instStatus = 'not paid'

        for (const cell of row) {
          const amt = parseAmount(cell)
          if (amt && amt > 0 && amt < principal) instAmt = amt
          if (cell && typeof cell === 'object' && 'toISOString' in (cell as object)) instDate = formatDate(cell as unknown as Date)
          if (String(cell ?? '').toLowerCase().includes('paid') && !String(cell ?? '').toLowerCase().includes('not')) instStatus = 'paid'
        }

        if (instAmt && instDate && num <= 12) {
          installments.push({ num, amount: instAmt, due_date: instDate, status: instStatus, amount_paid: instStatus === 'paid' ? instAmt : 0 })
        }
      }
    }
  }

  if (!totalDue && principal) {
    // Estimate: principal + 9% (first month standard)
    totalDue = Math.round(principal * 1.0972)
  }

  // Determine term from dates
  if (dateOffered && repaymentDate) {
    const d1 = new Date(dateOffered)
    const d2 = new Date(repaymentDate)
    const diffMonths = Math.round((d2.getTime() - d1.getTime()) / (30 * 86400000))
    if (diffMonths > 0 && diffMonths <= 12) termMonths = diffMonths
  }

  // Final status
  if (amountPaid >= totalDue * 0.99) status = 'paid'
  else if (amountPaid > 0) status = 'partial'
  else if (repaymentDate && new Date(repaymentDate) < new Date()) status = 'overdue'
  else status = 'active'

  return {
    principal,
    term_months: termMonths,
    date_offered: dateOffered,
    repayment_date: repaymentDate,
    total_due: totalDue || principal,
    amount_paid: amountPaid,
    status,
    collateral,
    installments: installments.sort((a, b) => a.num - b.num),
  }
}

function extractLoansSimple(rows: (string | number | null)[][]) {
  // Fallback: extract any row with a large amount and nearby date
  const loans: ReturnType<typeof buildLoan>[] = []
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    
    for (const cell of row) {
      const amt = parseAmount(cell)
      if (amt && amt >= 100000 && amt <= 12000000) {
        const loan = buildLoan(rows, i, amt)
        if (loan && !loans.find(l => l.principal === loan.principal)) {
          loans.push(loan)
          break
        }
      }
    }
  }
  
  return loans
}

function parseAmount(cell: string | number | null | undefined): number | null {
  if (!cell) return null
  if (typeof cell === 'number') return cell > 0 ? cell : null
  const s = String(cell).replace(/[,\s]/g, '').replace('RWF', '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}
