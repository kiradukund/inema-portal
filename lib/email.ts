import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
  pool: true,
  maxConnections: 5,
  rateDelta: 20000,
  rateLimit: 5,
})

// Fires once when this module first loads (cold start). Confirms the SMTP
// credentials/connection are actually good instead of only finding out on
// the first real send attempt.
transporter.verify()
  .then(() => console.log('SMTP connection verified — ready to send email'))
  .catch((error) => console.error('SMTP CONNECTION FAILED:', error?.message ?? error))

const FROM = '"INEMA Financial Solutions" <' + (process.env.GMAIL_USER ?? '') + '>'
const ADMIN_EMAIL = process.env.GMAIL_USER ?? ''
const SUPPORT_PHONE = '+250 788 834 132'
const PORTAL_URL = 'https://inema-portal-t9a3.vercel.app'

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 2000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatRWF(n: number) {
  return `RWF ${Number(n).toLocaleString('en-RW')}`
}

// Retries up to MAX_ATTEMPTS times, 2s apart. Never throws — the Gmail SMTP
// connection is intermittent, and a dropped notification email shouldn't
// fail the loan approval / registration / application it's attached to.
// Returns whether it actually got sent, so callers that care can check.
export async function sendRaw(to: string | string[], subject: string, html: string): Promise<boolean> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error('EMAIL SKIPPED: GMAIL_USER or GMAIL_APP_PASSWORD env var missing')
    return false
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log('SENDING EMAIL:', { to, subject, timestamp: new Date().toISOString() })
    try {
      const info = await transporter.sendMail({ from: FROM, to, subject, html })
      console.log('EMAIL SUCCESS:', { to, subject, messageId: info.messageId })
      return true
    } catch (e: any) {
      console.error('EMAIL FAILED:', { to, subject, error: e?.message ?? String(e), attempt })
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS)
    }
  }

  console.error('EMAIL GAVE UP AFTER', MAX_ATTEMPTS, 'ATTEMPTS:', { to, subject })
  return false
}

async function send(to: string, subject: string, html: string) {
  const recipients = Array.from(new Set([to, ADMIN_EMAIL].filter(Boolean)))
  await sendRaw(recipients, subject, html)
}

export async function sendApplicationConfirmation({ clientEmail, clientName, applicationNumber, loanType, amount, termMonths }: {
  clientEmail: string; clientName: string; applicationNumber: string
  loanType: string; amount: number; termMonths: number
}) {
  const loanLabel: Record<string,string> = { salary_advance:'Salary Advance', quinzaine:'Quinzaine Loan', school_fees:'School Fees Loan', business:'Business Loan' }
  await send(clientEmail, `Application Received — ${applicationNumber}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0a1628;padding:24px 32px;">
        <h1 style="color:#c9a84c;margin:0;">INEMA Financial Solutions Ltd</h1>
        <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Licensed by National Bank of Rwanda</p>
      </div>
      <div style="padding:32px;background:#fff;">
        <h2 style="color:#1e293b;">Dear ${clientName},</h2>
        <p style="color:#475569;">We received your loan application. Our team will review it within <strong>24 hours</strong>.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0;">
          <p style="margin:4px 0;"><strong>Reference:</strong> ${applicationNumber}</p>
          <p style="margin:4px 0;"><strong>Loan Type:</strong> ${loanLabel[loanType] ?? loanType}</p>
          <p style="margin:4px 0;"><strong>Amount:</strong> ${formatRWF(amount)}</p>
          <p style="margin:4px 0;"><strong>Term:</strong> ${termMonths} month(s)</p>
        </div>
        <a href="${PORTAL_URL}/loans" style="display:inline-block;background:#c9a84c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">View My Application</a>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
        <p style="color:#94a3b8;font-size:12px;">Questions? Call ${SUPPORT_PHONE} · INEMA Financial Solutions Ltd · Nyakabanda, Kigali</p>
      </div>
    </div>
  `)
}

export async function sendLoanApproval({ clientEmail, clientName, loanNumber, loanType, amount, termMonths, totalRepayment, month1Payment, monthlyPayment, schedule }: {
  clientEmail: string; clientName: string; loanNumber: string; loanType: string
  amount: number; termMonths: number; totalRepayment: number
  month1Payment: number; monthlyPayment: number
  schedule: Array<{ month: number; due_date: string; total_payment: number }>
}) {
  const loanLabel: Record<string,string> = { salary_advance:'Salary Advance', quinzaine:'Quinzaine Loan', school_fees:'School Fees Loan', business:'Business Loan' }
  const rows = schedule.map(s => `<tr><td style="padding:6px 12px;color:#64748b;">${s.month}</td><td style="padding:6px 12px;color:#64748b;">${new Date(s.due_date).toLocaleDateString('en-RW',{day:'2-digit',month:'short',year:'numeric'})}</td><td style="padding:6px 12px;font-weight:600;">${formatRWF(s.total_payment)}</td></tr>`).join('')
  await send(clientEmail, `Loan Approved — ${formatRWF(amount)} | ${loanNumber}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0a1628;padding:24px 32px;">
        <h1 style="color:#c9a84c;margin:0;">INEMA Financial Solutions Ltd</h1>
        <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Licensed by National Bank of Rwanda</p>
      </div>
      <div style="background:#16a34a;padding:12px 32px;">
        <p style="color:#fff;font-weight:700;margin:0;">Your loan has been approved!</p>
      </div>
      <div style="padding:32px;background:#fff;">
        <h2 style="color:#1e293b;">Congratulations, ${clientName}!</h2>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:24px 0;">
          <p style="margin:4px 0;"><strong>Loan Number:</strong> ${loanNumber}</p>
          <p style="margin:4px 0;"><strong>Type:</strong> ${loanLabel[loanType] ?? loanType}</p>
          <p style="margin:4px 0;"><strong>Principal:</strong> ${formatRWF(amount)}</p>
          <p style="margin:4px 0;"><strong>Term:</strong> ${termMonths} month(s)</p>
          <p style="margin:4px 0;"><strong>Month 1 Payment:</strong> ${formatRWF(month1Payment)}</p>
          <p style="margin:4px 0;"><strong>Monthly Payment (M2+):</strong> ${formatRWF(monthlyPayment)}</p>
          <p style="margin:4px 0;color:#dc2626;"><strong>Total Repayment: ${formatRWF(totalRepayment)}</strong></p>
        </div>
        <p style="font-weight:600;color:#1e293b;">Repayment Schedule</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
          <thead><tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;">Month</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;">Due Date</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;">Amount</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <a href="${PORTAL_URL}/loans" style="display:inline-block;background:#c9a84c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:20px;">View Loan Details</a>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
        <p style="color:#94a3b8;font-size:12px;">Questions? Call ${SUPPORT_PHONE} · INEMA Financial Solutions Ltd · Nyakabanda, Kigali</p>
      </div>
    </div>
  `)
}

export async function sendLoanRejection({ clientEmail, clientName, applicationNumber, loanType, amount, reviewNotes }: {
  clientEmail: string; clientName: string; applicationNumber: string
  loanType: string; amount: number; reviewNotes?: string
}) {
  const loanLabel: Record<string,string> = { salary_advance:'Salary Advance', quinzaine:'Quinzaine Loan', school_fees:'School Fees Loan', business:'Business Loan' }
  await send(clientEmail, `Update on Your Application — ${applicationNumber}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0a1628;padding:24px 32px;">
        <h1 style="color:#c9a84c;margin:0;">INEMA Financial Solutions Ltd</h1>
        <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Licensed by National Bank of Rwanda</p>
      </div>
      <div style="padding:32px;background:#fff;">
        <h2 style="color:#1e293b;">Dear ${clientName},</h2>
        <p style="color:#475569;">After careful review, we are unable to approve your loan application at this time.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0;">
          <p style="margin:4px 0;"><strong>Reference:</strong> ${applicationNumber}</p>
          <p style="margin:4px 0;"><strong>Type:</strong> ${loanLabel[loanType] ?? loanType}</p>
          <p style="margin:4px 0;"><strong>Amount:</strong> ${formatRWF(amount)}</p>
          ${reviewNotes ? `<p style="margin:12px 0 0;color:#475569;"><strong>Reason:</strong> ${reviewNotes}</p>` : ''}
        </div>
        <p style="color:#475569;">You may reapply after 30 days. Contact us for guidance.</p>
        <a href="https://wa.me/250788834132" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Contact Us on WhatsApp</a>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
        <p style="color:#94a3b8;font-size:12px;">${SUPPORT_PHONE} · INEMA Financial Solutions Ltd · Nyakabanda, Kigali</p>
      </div>
    </div>
  `)
}

export async function sendWelcomeEmail({ clientEmail, clientName }: { clientEmail: string; clientName: string }) {
  await send(clientEmail, 'Welcome to INEMA Financial Solutions', `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0a1628;padding:24px 32px;">
        <h1 style="color:#c9a84c;margin:0;">INEMA Financial Solutions Ltd</h1>
        <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Licensed by National Bank of Rwanda</p>
      </div>
      <div style="padding:32px;background:#fff;">
        <h2 style="color:#1e293b;">Welcome, ${clientName}!</h2>
        <p style="color:#475569;">Your account is ready. Apply for loans up to RWF 10,000,000 at 5% monthly interest.</p>
        <a href="${PORTAL_URL}/loans/apply" style="display:inline-block;background:#c9a84c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Apply Now</a>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
        <p style="color:#94a3b8;font-size:12px;">${SUPPORT_PHONE} · INEMA Financial Solutions Ltd · Nyakabanda, Kigali</p>
      </div>
    </div>
  `)
}
