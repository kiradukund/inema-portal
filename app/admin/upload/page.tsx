"use client";
import { useState, useRef } from "react";

interface UploadSummary {
  clients_imported: number;
  loans_imported: number;
  installments_imported: number;
  bank_rows_processed: number;
  bank_payments_reconciled: number;
  bank_expenses_categorised: number;
}

export default function UploadPage() {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [bankFiles, setBankFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const excelRef = useRef<HTMLInputElement>(null);
  const bankRef = useRef<HTMLInputElement>(null);

  function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { setExcelFile(f); setSummary(null); setError(null); }
  }

  function handleBank(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) { setBankFiles(prev => [...prev, ...files]); setSummary(null); setError(null); }
  }

  function removeBank(idx: number) {
    setBankFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleUpload() {
    setLoading(true); setError(null); setSummary(null);
    const fd = new FormData();
    if (excelFile) fd.append("excel", excelFile);
    bankFiles.forEach(f => fd.append("bank", f));
    try {
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setSummary(data.summary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sync Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload your Excel and BK bank statement PDFs for the most accurate data.
          Or just click sync to reload from existing data.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">How it works:</p>
        <p>📋 <strong>Excel</strong> — client info, loan terms, collateral</p>
        <p>🏦 <strong>BK Statement PDFs</strong> — real payment amounts from the bank</p>
        <p>✅ <strong>No files?</strong> Click sync anyway — uses confirmed data already loaded</p>
      </div>

      <div className="border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">1</span>
          <h2 className="font-semibold text-gray-800">Excel Loan File <span className="text-gray-400 font-normal text-sm">(optional)</span></h2>
        </div>
        {excelFile ? (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <div>
                <p className="text-sm font-medium text-gray-800">{excelFile.name}</p>
                <p className="text-xs text-gray-500">{(excelFile.size/1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button onClick={() => { setExcelFile(null); if (excelRef.current) excelRef.current.value = ""; }} className="text-xs text-red-500 hover:underline">Remove</button>
          </div>
        ) : (
          <button onClick={() => excelRef.current?.click()} className="w-full border-2 border-dashed border-gray-300 rounded-lg py-6 text-gray-400 hover:border-orange-400 hover:text-orange-500 transition text-sm">
            📂 Click to select Excel file (.xlsx)
          </button>
        )}
        <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcel} />
      </div>

      <div className="border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">2</span>
          <h2 className="font-semibold text-gray-800">BK Bank Statement PDFs <span className="text-gray-400 font-normal text-sm">(optional)</span></h2>
        </div>
        <p className="text-xs text-gray-500">Download from BK internet banking — Accounts — Statement — Download PDF. Add all months.</p>
        <div className="space-y-2">
          {bankFiles.map((f, i) => (
            <div key={i} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏦</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{f.name}</p>
                  <p className="text-xs text-gray-500">{(f.size/1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button onClick={() => removeBank(i)} className="text-xs text-red-500 hover:underline">Remove</button>
            </div>
          ))}
          <button onClick={() => bankRef.current?.click()} className="w-full border-2 border-dashed border-blue-200 rounded-lg py-5 text-blue-400 hover:border-blue-400 hover:text-blue-600 transition text-sm">
            + Add bank statement PDF
          </button>
        </div>
        <input ref={bankRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleBank} />
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">⚠ {error}</div>}

      <button onClick={handleUpload} disabled={loading} className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl text-base transition flex items-center justify-center gap-2">
        {loading ? "Syncing..." : "🔄 Upload & Sync Dashboard"}
      </button>

      {summary && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-4">
          <p className="font-semibold text-green-800">✅ Dashboard synced successfully!</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Clients Imported", value: summary.clients_imported },
              { label: "Loans Imported", value: summary.loans_imported },
              { label: "Bank Rows Processed", value: summary.bank_rows_processed },
              { label: "Payments Reconciled", value: summary.bank_payments_reconciled },
              { label: "Expenses Categorised", value: summary.bank_expenses_categorised },
              { label: "Instalments", value: summary.installments_imported },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-2xl font-bold text-gray-800">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <a href="/admin" className="block text-center text-orange-600 font-semibold hover:underline">Go to Dashboard →</a>
        </div>
      )}
    </div>
  );
}