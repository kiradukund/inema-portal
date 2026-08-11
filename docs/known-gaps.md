# Known Gaps — Tracked, Not Yet Fixed

Real, confirmed gaps found during development that are deliberately not
fixed yet — logged here so they don't get lost, with enough context to
pick up in a future session without re-deriving the diagnosis.

## Fee + VAT not captured at loan disbursement

**Found:** 2026-08-10, while verifying the journal entry schema fix
against real historical practice.

**What's missing:** every real historical loan (confirmed from the actual
Jan-June journal, e.g. the STELLA disbursement) charges a 4% fee + 18%
VAT on that fee at disbursement time, booked immediately as revenue with
a matching Accounts Receivable line:
```
Debit  Accounts Receivable — Interest and Fees   (fee + VAT)
Debit  Loan issued                               (principal)
Credit Bank Accounts                             (principal)
Credit Fees & Commission Income                  (fee)
Credit VAT Control Account                       (VAT)
```
The current `/admin/iacm/loans/new` form and its `POST /api/admin/iacm/loans`
route have no fee field at all — `disbursed_amount` is the only money
field collected, so the auto-posted disbursement journal entry only ever
does the 2-line Loan-Issued/Cash entry, with no fee, VAT, or AR line.

**Why this matters, not cosmetic:** every real loan recorded through the
UI from July 1 onward under-records real fee revenue, silently, with no
error — the exact same "confidently wrong number" failure mode as the
journal schema mismatch fixed the same night. Interest income posts
correctly; fee income does not exist anywhere in the system for
UI-recorded loans.

**Scope for the fix:**
- Add a fee amount field (or auto-compute 4% of `disbursed_amount`,
  matching the documented terms) to the New Loan form and its API route.
- Compute VAT as 18% of that fee.
- Extend the disbursement `postJournalEntry()` call (`app/api/admin/iacm/loans/route.ts`)
  to add the AR / Fees & Commission Income / VAT Control lines, matching
  the real historical structure above.
- Confirm whether the corresponding AR-clearing line on repayment
  (`app/api/admin/iacm/payments/route.ts`) also needs to be added back —
  real repayments clear this same AR balance as fees get collected
  alongside interest.

Not started. Not part of the 2026-08-10 journal schema fix.

## Opening balances aligned to official BNR filings, not internal ledger reconciliation

**Decided:** 2026-08-11, by Kevin.

iacm_opening_balances (2030 Shareholders' Loan, 3020 Bank Accounts) was
deliberately set to match the four real BNR filings (Sep 2025 - Jun 2026)
exactly, rather than the internally-reconciled ledger figures. This means
the Shareholders' Loan (1,500,000) and its corresponding cash no longer
appear anywhere on the dashboard or balance sheet — not because the loan
isn't real, but because it was never disclosed in any of the four real
filings, and Kevin chose official-filing alignment over internal
completeness.

**Also fixed as part of this change**: 3010 Cash on Hand had a pre-existing
data-entry error (recorded as a credit instead of debit, showing -30,000)
— corrected to 0, matching both the real filing and basic correctness.

**Flag for Devotha**: if the shareholders' loan should be disclosed in a
future BNR filing, this decision will need to be revisited alongside her.

## HABINEZA loan (INEMA-2026-0002): real restructuring event, no system record

**Found:** 2026-08-11, cross-checking the two "incorrectly overdue" loans
from the BNR generator test against all four real archived filings
(`bnr-filed-reports`), not just the internal journal — the journal only
starts Jan 2026, but the filed reports go back to Sep 2025.

**What the four real filings actually show, side by side:**

| Filing | Disbursement | Maturity | Amount Disbursed | Classification |
|---|---|---|---|---|
| Sep-2025 | 19-Aug-2025 | 18-Oct-2025 | 3,000,000 | Normal (0%) |
| Dec-2025 | 19-Aug-2025 | 18-Oct-2025 | 2,000,000 | Normal (0%) |
| Mar-2026 | 19-Aug-2025 | 18-Oct-2025 | 2,000,000 | Normal (0%) |
| Jun-2026 | 24-Dec-2025 | 24-Jun-2026 | 2,000,000 | Normal (0%) |

Two real, independently-evidenced events, neither reflected anywhere in
`iacm_loans` or `iacm_payments` today:

1. **A real payment of ~1,000,000 between Sep-2025 and Dec-2025.** Same
   loan, same national ID, same dates — only the amount changes
   (3,000,000 → 2,000,000). `iacm_payments` has zero records for this
   loan.
2. **A real restructuring between Mar-2026 and Jun-2026.** The loan's own
   recorded disbursement/maturity dates change from the original
   Aug/Oct 2025 terms to 24-Dec-2025 / 24-Jun-2026 on a 180-day cycle —
   which is exactly what `iacm_loans` has today. Whoever originally set
   up the database used the June filing's restructured dates as the
   loan's basis, not its true origin. That's the root of the
   discrepancy, not a missing backfill.

**Do not attempt to reconstruct or guess at the missing payment amount,
date, or the real restructuring terms.** This needs Devotha's direct
knowledge of what actually happened with this specific loan — the real
filings prove *that* something happened, not the full detail of what.

**Not started.** No code or data change proposed. Closed from the
investigation side; open until Devotha weighs in.

## Loan classification grace period not modeled

**Found:** 2026-08-11, same investigation as above.

**What the real evidence shows:** the real Jun-2026 filing classifies
HABINEZA's loan as **Normal (0% provision)** even though its own recorded
maturity (24-Jun-2026) had already passed by 6 days at the report's own
30-Jun-2026 cutoff. The BNR generator's day-count classification logic
(`lib/bnr-report.ts`, same buckets as the dashboard's portfolio-risk
widget) would correctly flag this as 6 days overdue — "Watch, 1-89 days"
— per pure calendar math, and does. The real filing doesn't.

**Why this matters:** this is real, independent regulatory evidence that
Devotha's actual classification practice includes some grace period or
rollover convention before a loan gets reclassified past maturity — not
a data error in either the filing or the generator, a genuine gap between
the documented day-count rule and real practice.

**Do not guess at the grace period length or change the classification
logic based on this one example.** One data point (6 days, still Normal)
isn't enough to derive a real rule — needs Devotha's confirmation of what
the actual grace convention is (a fixed number of days? a case-by-case
judgment call? tied to the restructuring above rather than a general
rule?) before `lib/bnr-report.ts`'s bucket logic changes.

**Not started.** No code change proposed. Closed from the investigation
side; open until Devotha weighs in.
