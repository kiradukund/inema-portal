import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

const FROM = '"INEMA Financial Solutions" <' + (process.env.GMAIL_USER ?? '') + '>'
const ADMIN_EMAIL = process.env.GMAIL_USER ?? ''
const SUPPORT_PHONE = '+250 788 834 132'
const PORTAL_URL = 'https://inema-portal-t9a3.vercel.app'

function formatRWF(n: number) {
  return `RWF ${Number(n).toLocaleString('en-RW')}`
}

async function send(to: string, subject: string, html: string) {
  const recipients = [...new Set([to, ADMIN_EMAIL].filter(Boolean))]
  await transporter.sendMail({ from: FROM, to: recipients, subject, html })
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
          <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;">Application Details</p>
          <p style="margin:4px 0;color:#1e293b;"><strong>Reference:</strong> ${applicationNumber}</p>
          <p style="margin:4px 0;color:#1e293b;"><strong>Loan Type:</strong> ${loanLabel[loanType] ?? loanType}</p>
          <p style="margin:4px 0;color:#1e293b;"><strong>Amount:</strong> ${formatRWF(amount)}</p>
          <p style="margin:4px 0;color:#1e293b;"><strong>Term:</strong> ${termMonths} month(s)</p>
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
  await send(clientEmail, `✓ Loan Approved — ${formatRWF(amount)} | ${loanNumber}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0a1628;padding:24px 32px;">
        <h1 style="color:#c9a84c;margin:0;">INEMA Financial Solutions Ltd</h1>
        <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Licensed by National Bank of Rwanda</p>
      </div>
      <div style="background:#16a34a;padding:12px 32px;">
        <p style="color:#fff;font-weight:700;margin:0;">✓ Your loan has been approved!</p>
      </div>
      <div style="padding:32px;background:#fff;">
        <h2 style="color:#1e293b;">Congratulations, ${clientName}!</h2>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:24px 0;">
          <p style="margin:0 0 8px;color:#16a34a;font-size:13px;font-weight:600;">LOAN DETAILS</p>
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
        <div style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:16px 0;">
          <p style="margin:0;color:#92400e;font-size:13px;"><strong>⚠️ Late payments attract 5% monthly penalty on overdue amounts.</strong></p>
        </div>
        <a href="${PORTAL_URL}/loans" style="display:inline-block;background:#c9a84c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">View Loan Details</a>
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
        <ul style="color:#475569;line-height:2;">
          <li>Salary Advance — up to RWF 2M</li>
          <li>Quinzaine Loan — up to RWF 1M</li>
          <li>School Fees — up to RWF 5M</li>
          <li>Business Loan — up to RWF 10M</li>
        </ul>
        <a href="${PORTAL_URL}/loans/apply" style="display:inline-block;background:#c9a84c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Apply Now</a>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
        <p style="color:#94a3b8;font-size:12px;">${SUPPORT_PHONE} · INEMA Financial Solutions Ltd · Nyakabanda, Kigali</p>
      </div>
    </div>
  `)
}
