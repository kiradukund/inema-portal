import Link from 'next/link'

// Real incident, 2026-08-18: this page's data (imported_loans/imported_clients)
// is frozen from an 11-Jun-2026 bulk import and does not reflect any real
// payment or loan recorded since — HABINEZA Jean Marie showed "active,
// RWF 0 paid" here while his real iacm_loans record correctly showed fully
// repaid. Confirmed the same disconnect for every client on this page, not
// a one-off. See docs/known-gaps.md for the full incident.
export function StaleDataBanner({ currentHref, currentLabel }: { currentHref: string; currentLabel: string }) {
  return (
    <div className="mb-6 rounded-xl border-2 border-red-300 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div>
        <p className="font-bold text-red-800">⚠️ Historical / Imported Data — Not Current</p>
        <p className="text-sm text-red-700 mt-1">
          This page reflects a one-time bulk import and has not been updated with real loan or payment activity since. It does not show current balances or status.
        </p>
      </div>
      <Link href={currentHref}
        className="whitespace-nowrap bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-800 text-center">
        Go to {currentLabel} →
      </Link>
    </div>
  )
}
