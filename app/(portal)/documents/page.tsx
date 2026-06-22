'use client'
import Link from 'next/link'

export default function DocumentsPage() {
  const docs = [
    {
      name: 'Loan Application Form',
      desc: 'Fill this form and submit it when applying for a loan',
      file: '/loan-application-form.docx',
      icon: '📝',
      color: 'border-blue-200 bg-blue-50',
      btnColor: 'bg-blue-600 hover:bg-blue-500',
    },
    {
      name: 'Document Checklist',
      desc: 'List of all documents required for your loan application',
      file: '/checklist.docx',
      icon: '✅',
      color: 'border-green-200 bg-green-50',
      btnColor: 'bg-green-600 hover:bg-green-500',
    },
    {
      name: 'Key Fact Statement',
      desc: 'Important information about your loan terms, fees and rights',
      file: '/key-fact-statement.docx',
      icon: '📋',
      color: 'border-amber-200 bg-amber-50',
      btnColor: 'bg-amber-600 hover:bg-amber-500',
    },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Documents & Forms</h1>
        <p className="text-slate-500 text-sm mt-1">
          Download the forms you need for your loan application
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {docs.map(doc => (
          <div key={doc.name} className={`rounded-xl border-2 ${doc.color} p-6 flex flex-col`}>
            <div className="text-4xl mb-4">{doc.icon}</div>
            <h2 className="font-bold text-slate-800 text-lg mb-2">{doc.name}</h2>
            <p className="text-slate-600 text-sm mb-6 flex-1">{doc.desc}</p>
            <a
              href={doc.file}
              download
              className={`${doc.btnColor} text-white text-sm font-semibold px-4 py-2.5 rounded-lg text-center transition-colors`}
            >
              ⬇️ Download
            </a>
          </div>
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h2 className="font-bold text-slate-700 mb-3">📌 How to Apply</h2>
        <ol className="space-y-2 text-sm text-slate-600">
          <li className="flex gap-3"><span className="font-bold text-amber-600 w-5">1.</span>Download and fill the <strong>Loan Application Form</strong></li>
          <li className="flex gap-3"><span className="font-bold text-amber-600 w-5">2.</span>Review the <strong>Document Checklist</strong> and gather all required documents</li>
          <li className="flex gap-3"><span className="font-bold text-amber-600 w-5">3.</span>Read the <strong>Key Fact Statement</strong> to understand your loan terms</li>
          <li className="flex gap-3"><span className="font-bold text-amber-600 w-5">4.</span>Apply online below or visit us at Nyakabanda, Nyarugenge, Kigali</li>
        </ol>
        <div className="mt-4">
          <Link href="/loans/apply" className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-6 py-2.5 rounded-lg text-sm inline-block transition-colors">
            Apply for a Loan →
          </Link>
        </div>
      </div>
    </div>
  )
}
