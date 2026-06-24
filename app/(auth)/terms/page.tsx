import Link from 'next/link'

export default function Terms() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <p className="font-bold font-serif text-2xl text-slate-800">INEMA Financial Solutions Ltd</p>
          <p className="text-amber-600 text-xs tracking-widest uppercase mt-1">Terms of Service</p>
          <p className="text-slate-400 text-xs mt-2">Effective date: 1 July 2026 · Last updated: 24 June 2026</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-6 text-sm text-slate-700 leading-relaxed">
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">1. About INEMA Financial Solutions Ltd</h2>
            <p>INEMA Financial Solutions Ltd ("INEMA", "we", "us") is a non-deposit-taking moneylender licensed by the National Bank of Rwanda (BNR) under Category III. We are registered with RDB (Registration No. [RDB-NUMBER]) and located at 3rd Floor F3B-0A, Nyakabanda, Nyarugenge, Kigali, Rwanda.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">2. Eligibility</h2>
            <p>To apply for a loan through this portal, you must: (a) be a Rwandan citizen or resident aged 18 or older; (b) have a valid National ID; (c) have a verifiable source of income; and (d) not be listed as a defaulter in the Credit Reference Bureau (CRB).</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">3. Loan Products and Fees</h2>
            <p>All loans are subject to: a 5% monthly nominal interest rate; a 4% upfront fee (1% application + 1.5% processing + 1.5% management fee) charged on disbursement; 18% VAT on the 4% upfront fee only; and a 5% per month late payment penalty on any overdue amounts. Final terms are confirmed in a written loan agreement signed by both parties prior to disbursement.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">4. Application Process</h2>
            <p>Submitting an application through this portal does not constitute a loan approval or commitment by INEMA. All applications are subject to review, CRB checks, document verification, and approval at INEMA's sole discretion. You will be contacted within 24 hours of submission with a decision or request for additional information.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">5. CRB Consent</h2>
            <p>By submitting a loan application, you expressly consent to INEMA Financial Solutions Ltd querying your credit history through the Rwanda Credit Reference Bureau (CRB) and reporting your loan performance to the CRB as required by BNR regulations.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">6. Data and Privacy</h2>
            <p>Your personal data is processed in accordance with our <Link href="/privacy" className="text-amber-600 hover:underline">Privacy Policy</Link> and the Rwanda Data Protection Law. We do not sell or share your data with third parties except as required by law or for loan processing purposes.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">7. Governing Law</h2>
            <p>These Terms are governed by the laws of the Republic of Rwanda. Any disputes shall be resolved through the competent courts of Rwanda.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-800 text-base mb-2">8. Contact</h2>
            <p>INEMA Financial Solutions Ltd · 3rd Floor F3B-0A, Nyakabanda, Nyarugenge, Kigali · inemafinancialsolutionsltd@gmail.com · +250 788 834 132</p>
          </section>
        </div>
        <div className="text-center mt-6">
          <Link href="/" className="text-sm text-slate-500 hover:text-amber-600">← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
