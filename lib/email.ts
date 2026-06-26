import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'INEMA Financial Solutions <onboarding@resend.dev>'
const SUPPORT_PHONE = '+250 788 834 132'
const PORTAL_URL = 'https://inema-portal-t9a3.vercel.app'

function formatRWF(n: number) {
  return `RWF ${Number(n).toLocaleString('en-RW')}`
}

// ── 1. Application submitted ──────────────────────────────────────────────────
export async function sendApplicationConfirmation({
  clientEmail, clientName, applicationNumber, loanType, amount, termMonths,
}: {
  clientEmail: string; clientName: string; applicationNumber: string
  loanType: string; amount: number; termMonths: number
}) {
  const loanLabel: Record<string, string> = {
    salary_advance: 'Salary Advance', quinzaine: 'Quinzaine Loan',
    school_fees: 'School Fees Loan', business: 'Business Loan',
  }
  await resend.emails.send({
    from: FROM,
    to: clientEmail,
    subject: `Application Received — ${applicationNumber}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:#0a1628;padding:24px 32px;">
          <h1 style="color:#c9a84c;font-size:22px;margin:0;">INEMA Financial Solutions Ltd</h1>
          <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Licensed by National Bank of Rwanda</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1e293b;font-size:18px;">Dear ${clientName},</h2>
          <p style="color:#475569;">We have received your loan application. Our team will review it and contact you within <strong>24 hours</strong>.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Application Details</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Reference</td><td style="padding:6px 0;color:#1e293b;font-weight:600;font-size:14px;">${applicationNumber}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Loan Type</td><td style="padding:6px 0;color:#1e293b;font-size:14px;">${loanLabel[loanType] ?? loanType}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Amount Requested</td><td style="padding:6px 0;color:#1e293b;font-size:14px;">${formatRWF(amount)}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Term</td><td style="padding:6px 0;color:#1e293b;font-size:14px;">${termMonths} month(s)</td></tr>
            </table>
          </div>
          <p style="color:#475569;font-size:14px;">You can track your application status by logging into your client portal:</p>
          <a href="${PORTAL_URL}/loans" style="display:inline-block;background:#c9a84c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View My Application</a>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
          <p style="color:#94a3b8;font-size:12px;">Questions? Call or WhatsApp us at ${SUPPORT_PHONE}<br>INEMA Financial Solutions Ltd · Nyakabanda, Nyarugenge, Kigali</p>
        </div>
      </div>
    `,
  })
}

// ── 2. Loan approved ─────────────────────────────────────────────────────────
export async function sendLoanApproval({
  clientEmail, clientName, loanNumber, loanType, amount, termMonths,
  totalRepayment, month1Payment, monthlyPayment, schedule,
}: {
  clientEmail: string; clientName: string; loanNumber: string
  loanType: string; amount: number; termMonths: number
  totalRepayment: number; month1Payment: number; monthlyPayment: number
  schedule: Array<{ month: number; due_date: string; total_payment: number }>
}) {
  const loanLabel: Record<string, string> = {
    salary_advance: 'Salary Advance', quinzaine: 'Quinzaine Loan',
    school_fees: 'School Fees Loan', business: 'Business Loan',
  }
  const scheduleRows = schedule.map(s => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:8px 12px;color:#64748b;font-size:13px;">Month ${s.month}</td>
      <td style="padding:8px 12px;color:#64748b;font-size:13px;">${new Date(s.due_date).toLocaleDateString('en-RW',{day:'2-digit',month:'short',year:'numeric'})}</td>
      <td style="padding:8px 12px;color:#1e293b;font-weight:600;font-size:13px;">${formatRWF(s.total_payment)}</td>
    </tr>
  `).join('')

  await resend.emails.send({
    from: FROM,
    to: clientEmail,
    subject: `🎉 Loan Approved — ${formatRWF(amount)} | ${loanNumber}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:#0a1628;padding:24px 32px;">
          <h1 style="color:#c9a84c;font-size:22px;margin:0;">INEMA Financial Solutions Ltd</h1>
          <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Licensed by National Bank of Rwanda</p>
        </div>
        <div style="background:#16a34a;padding:16px 32px;">
          <p style="color:#fff;font-size:16px;font-weight:700;margin:0;">✓ Your loan has been approved!</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1e293b;font-size:18px;">Congratulations, ${clientName}!</h2>
          <p style="color:#475569;">Your loan application has been approved. Please review the details and repayment schedule below.</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 8px;font-size:13px;color:#16a34a;font-weight:600;text-transform:uppercase;">Loan Details</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Loan Number</td><td style="padding:6px 0;color:#1e293b;font-weight:700;font-size:14px;">${loanNumber}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Loan Type</td><td style="padding:6px 0;color:#1e293b;font-size:14px;">${loanLabel[loanType] ?? loanType}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Principal Amount</td><td style="padding:6px 0;color:#1e293b;font-size:14px;">${formatRWF(amount)}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Term</td><td style="padding:6px 0;color:#1e293b;font-size:14px;">${termMonths} month(s)</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Month 1 Payment</td><td style="padding:6px 0;color:#1e293b;font-weight:700;font-size:14px;">${formatRWF(month1Payment)}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Monthly Payment (M2+)</td><td style="padding:6px 0;color:#1e293b;font-size:14px;">${formatRWF(monthlyPayment)}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Total Repayment</td><td style="padding:6px 0;color:#dc2626;font-weight:700;font-size:14px;">${formatRWF(totalRepayment)}</td></tr>
            </table>
          </div>
          <p style="color:#1e293b;font-weight:600;font-size:15px;margin:24px 0 12px;">Repayment Schedule</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <thead><tr style="background:#f8fafc;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;">Month</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;">Due Date</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;">Amount Due</th>
            </tr></thead>
            <tbody>${scheduleRows}</tbody>
          </table>
          <div style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:24px 0;">
            <p style="margin:0;color:#92400e;font-size:13px;"><strong>⚠️ Important:</strong> Late payments attract a 5% monthly penalty on the overdue amount. Please ensure payments are made on or before the due date.</p>
          </div>
          <a href="${PORTAL_URL}/loans" style="display:inline-block;background:#c9a84c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View My Loan Details</a>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
          <p style="color:#94a3b8;font-size:12px;">Questions? Call or WhatsApp us at ${SUPPORT_PHONE}<br>INEMA Financial Solutions Ltd · Nyakabanda, Nyarugenge, Kigali</p>
        </div>
      </div>
    `,
  })
}

// ── 3. Loan rejected ─────────────────────────────────────────────────────────
export async function sendLoanRejection({
  clientEmail, clientName, applicationNumber, loanType, amount, reviewNotes,
}: {
  clientEmail: string; clientName: string; applicationNumber: string
  loanType: string; amount: number; reviewNotes?: string
}) {
  const loanLabel: Record<string, string> = {
    salary_advance: 'Salary Advance', quinzaine: 'Quinzaine Loan',
    school_fees: 'School Fees Loan', business: 'Business Loan',
  }
  await resend.emails.send({
    from: FROM,
    to: clientEmail,
    subject: `Update on Your Loan Application — ${applicationNumber}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:#0a1628;padding:24px 32px;">
          <h1 style="color:#c9a84c;font-size:22px;margin:0;">INEMA Financial Solutions Ltd</h1>
          <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Licensed by National Bank of Rwanda</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1e293b;font-size:18px;">Dear ${clientName},</h2>
          <p style="color:#475569;">Thank you for your interest in INEMA Financial Solutions. After careful review of your application, we regret to inform you that we are unable to approve your loan request at this time.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;">Application Details</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Reference</td><td style="padding:6px 0;color:#1e293b;font-size:14px;">${applicationNumber}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Loan Type</td><td style="padding:6px 0;color:#1e293b;font-size:14px;">${loanLabel[loanType] ?? loanType}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Amount Requested</td><td style="padding:6px 0;color:#1e293b;font-size:14px;">${formatRWF(amount)}</td></tr>
            </table>
            ${reviewNotes ? `<p style="margin:12px 0 0;color:#475569;font-size:14px;"><strong>Reason:</strong> ${reviewNotes}</p>` : ''}
          </div>
          <p style="color:#475569;font-size:14px;">You are welcome to reapply after 30 days or contact us to discuss your eligibility. We encourage you to:</p>
          <ul style="color:#475569;font-size:14px;line-height:1.8;">
            <li>Ensure all required documents are complete and up to date</li>
            <li>Verify your CRB status is clear</li>
            <li>Contact us for guidance on improving your application</li>
          </ul>
          <a href="https://wa.me/250788834132" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Contact Us on WhatsApp</a>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
          <p style="color:#94a3b8;font-size:12px;">INEMA Financial Solutions Ltd · Nyakabanda, Nyarugenge, Kigali · ${SUPPORT_PHONE}</p>
        </div>
      </div>
    `,
  })
}

// ── 4. Welcome / account created ─────────────────────────────────────────────
export async function sendWelcomeEmail({
  clientEmail, clientName,
}: {
  clientEmail: string; clientName: string
}) {
  await resend.emails.send({
    from: FROM,
    to: clientEmail,
    subject: 'Welcome to INEMA Financial Solutions',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:#0a1628;padding:24px 32px;">
          <h1 style="color:#c9a84c;font-size:22px;margin:0;">INEMA Financial Solutions Ltd</h1>
          <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Licensed by National Bank of Rwanda</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1e293b;font-size:18px;">Welcome, ${clientName}!</h2>
          <p style="color:#475569;">Your account has been created. You now have access to Rwanda's most transparent lending platform.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 12px;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;">What you can do:</p>
            <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:2;">
              <li>Apply for loans up to RWF 10,000,000</li>
              <li>Track your application status in real time</li>
              <li>View your repayment schedule</li>
              <li>Download loan documents</li>
            </ul>
          </div>
          <div style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:0 0 24px;">
            <p style="margin:0;color:#92400e;font-size:13px;"><strong>Our Loans:</strong> Salary Advance (RWF 2M) · Quinzaine (RWF 1M) · School Fees (RWF 5M) · Business (RWF 10M) · 5% monthly interest</p>
          </div>
          <a href="${PORTAL_URL}/loans/apply" style="display:inline-block;background:#c9a84c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Apply for a Loan Now</a>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
          <p style="color:#94a3b8;font-size:12px;">Questions? Call or WhatsApp us at ${SUPPORT_PHONE}<br>INEMA Financial Solutions Ltd · Nyakabanda, Nyarugenge, Kigali</p>
        </div>
      </div>
    `,
  })
}
