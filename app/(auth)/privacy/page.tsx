import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | INEMA Financial Solutions Ltd',
  description: 'Privacy Policy for INEMA Financial Solutions Ltd, a BNR-licensed microfinance lender in Kigali, Rwanda.',
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <p className="font-bold font-serif text-2xl text-slate-800">INEMA Financial Solutions Ltd</p>
          <p className="text-amber-600 text-xs tracking-widest uppercase mt-1">Privacy Policy</p>
          <p className="text-slate-400 text-xs mt-2">Effective: 1 July 2026</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-6 text-sm text-slate-700 leading-relaxed">
          {[
            ['1. What We Collect', 'Personal identification (name, National ID, date of birth, gender, marital status); contact info (phone, email, address); employment and financial info (employer, income, bank details); loan application data and repayment history.'],
            ['2. Why We Collect It', 'To assess eligibility; process and disburse loans; comply with BNR reporting; report to the Rwanda Credit Reference Bureau; and contact you about your application or repayment.'],
            ['3. How We Store It', 'Data is stored on Supabase infrastructure with encryption at rest and in transit. Access is restricted to authorized INEMA staff. We retain data for a minimum of 7 years per Rwandan financial regulations.'],
            ['4. Who We Share With', 'We do not sell your data. We share only with: Rwanda CRB (required by law); BNR (regulatory reporting); platform service providers bound by confidentiality agreements.'],
            ['5. Your Rights', 'Under Rwanda\'s Data Protection Law, you have the right to access, correct, or request deletion of your data (subject to retention requirements). Contact inemafinancialsolutionsltd@gmail.com.'],
            ['6. Cookies', 'This portal uses session cookies for authentication only. No tracking or advertising cookies are used.'],
            ['7. Contact', 'Data Controller: INEMA Financial Solutions Ltd · Town Center Building, Floor 3B, Downtown Kigali · inemafinancialsolutionsltd@gmail.com · +250 788 834 132'],
          ].map(([title, body]) => (
            <section key={title}>
              <h2 className="font-bold text-slate-800 text-base mb-2">{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <div className="text-center mt-6 space-x-4">
          <Link href="/terms" className="text-sm text-amber-600 hover:underline">Terms of Service</Link>
          <Link href="/" className="text-sm text-slate-500 hover:text-amber-600">← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
