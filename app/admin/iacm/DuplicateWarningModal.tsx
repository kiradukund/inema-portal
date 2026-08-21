'use client'

export interface DuplicateExisting { label: string; amount: number; date: string }

// Shared across New Loan / Record Payment / Record Expense: the server
// (not this component) decides what counts as a duplicate -- same key
// fields, same day -- and returns { possible_duplicate: true, existing }
// instead of inserting. This just presents that warning and lets the
// caller resubmit with confirmed_duplicate:true to proceed, or cancel.
// A soft warning, not a hard block -- a real second identical transaction
// (two equal bank charges in a month, two equal installments same day)
// must still go through with one extra click.
export default function DuplicateWarningModal({ existing, loading, onConfirm, onCancel }: {
  existing: DuplicateExisting; loading: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !loading && onCancel()}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">⚠ This Looks Like a Duplicate</h3>
          <button onClick={onCancel} disabled={loading} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          This looks like it may already be recorded: <strong>{existing.label}</strong>, RWF {Number(existing.amount).toLocaleString()}, {new Date(existing.date).toLocaleDateString('en-RW')}. Is this a different, genuine transaction?
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-50 disabled:opacity-60">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 bg-amber-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-700 disabled:opacity-60">
            {loading ? 'Recording...' : 'Yes, record it anyway'}
          </button>
        </div>
      </div>
    </div>
  )
}
