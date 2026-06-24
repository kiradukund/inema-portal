import Link from 'next/link'
export default function Terms() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <p className="font-bold font-serif text-2xl text-slate-800">INEMA Financial Solutions Ltd</p>
          <p className="text-amber-600 text-xs tracking-widest uppercase mt-1">Terms of Service</p>
          <p className="text-slate-400 text-xs mt-2">Effective: 1 July 2026</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-6 text-sm text-slate-700 leading-relaxed">
          {[
            ['1. About INEMA', 'INEMA Financial Solutions Ltd is a non-deposit-taking moneylender licensed by the National Bank of Rwanda (BNR) under Category III. Registered with RDB, located at 3rd Floor F3B-0A, Nyakabanda, Nyarugenge, Kigali, Rwanda.'],
            ['2. Eligibility', 'You must be a Rwandan citizen or resident aged 18+, hold a valid National ID, have a verifiable income source, and not be listed as a defaulter in the Credit Reference Bureau (CRB).'],
            ['3. Fees & Interest', 'All loans carry: 5% monthly nominal interest; 4% upfront fee (1% application + 1.5% processing + 1.5% management) on disbursement; 18% VAT on the 4% fee only; 5%/month late penalty on overdue amounts. Final terms are confirmed in a signed loan agreement before disbursement.'],
            ['4. Application', 'Submitting an application does not guarantee approval. All applications are subject to CRB checks, document verification, and approval at INEMA\'s sole discretion. You will be contacted within 24 hours.'],
            ['5. CRB Consent', 'By applying, you consent to INEMA querying your CRB credit history and reporting your loan performance to the CRB as required by BNR.'],
            ['6. Data & Privacy', 'Your data is handled per our Privacy Policy and the Rwanda Data Protection Law. We do not sell your data.'],
            ['7. Governing Law', 'These Terms are governed by the laws of the Republic of Rwanda. Disputes are resolved through competent Rwandan courts.'],
            ['8. Contact', 'INEMA Financial Solutions Ltd · 3rd Floor F3B-0A, Nyakabanda, Nyarugenge, Kigali · inemafinancialsolutionsltd@gmail.com · +250 788 834 132'],
          ].map(([title, body]) => (
            <section key={title}>
              <h2 className="font-bold text-slate-800 text-base mb-2">{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <div className="text-center mt-6 space-x-4">
          <Link href="/privacy" className="text-sm text-amber-600 hover:underline">Privacy Policy</Link>
          <Link href="/" className="text-sm text-slate-500 hover:text-amber-600">← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
