import Link from 'next/link'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <p className="font-bold font-serif text-2xl text-slate-800">INEMA Financial Solutions Ltd</p>
          <p className="text-amber-600 text-xs tracking-widest uppercase mt-1">Privacy Policy</p>
          <p className="text-slate-400 text-xs mt-2">Effective date: 1 July 2026 · Last updated: 24 June 2026</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-6 text-sm text-slate-700 leading-relaxed">
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">1. What Data We Collect</h2>
            <p>We collect: personal identification information (name, National ID, date of birth, gender, marital status); contact information (phone, email, address); employment and financial information (employer, monthly income, bank account details); and loan application data and repayment history.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">2. Why We Collect It</h2>
            <p>Your data is collected to: (a) assess your loan eligibility; (b) process and disburse approved loans; (c) comply with BNR reporting requirements; (d) report to the Rwanda Credit Reference Bureau as required by law; and (e) contact you regarding your application or repayment.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">3. How We Store It</h2>
            <p>Your data is stored securely on Supabase infrastructure with encryption at rest and in transit. Access is restricted to authorized INEMA staff only. We retain your data for a minimum of 7 years as required by Rwandan financial regulations.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">4. Who We Share It With</h2>
            <p>We do not sell your data. We share data only with: the Rwanda Credit Reference Bureau (CRB) as required by law; BNR as part of regulatory reporting; and service providers who assist in operating this platform, bound by confidentiality agreements.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">5. Your Rights</h2>
            <p>Under Rwanda's Data Protection Law, you have the right to access, correct, or request deletion of your personal data (subject to regulatory retention requirements). Contact us at inemafinancialsolutionsltd@gmail.com to exercise these rights.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">6. Cookies</h2>
            <p>This portal uses session cookies for authentication only. We do not use tracking or advertising cookies.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">7. Contact</h2>
            <p>Data Controller: INEMA Financial Solutions Ltd · 3rd Floor F3B-0A, Nyakabanda, Nyarugenge, Kigali · inemafinancialsolutionsltd@gmail.com · +250 788 834 132</p>
          </section>
        </div>
        <div className="text-center mt-6">
          <Link href="/" className="text-sm text-slate-500 hover:text-amber-600">← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
