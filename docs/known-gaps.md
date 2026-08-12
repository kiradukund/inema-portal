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

## Loan classification: real filings never use anything but "Normal" — not a first-time-client grace period

**Found:** 2026-08-11. **Revised:** 2026-08-12, after Kevin's hypothesis
(first-time clients get grace treatment, repeat clients follow strict
day-count) was checked against real evidence across all 4 filings, not
just the one Habineza example.

**What the real evidence actually shows** — every loan found past its own
recorded maturity date, in any of the four real filings, classified Normal
regardless of days overdue or client history:

| Filing | Client | Days overdue | Bucket | Previous-loans-paid field |
|---|---|---|---|---|
| Dec-2025 | HABIMANA Emmanuel | 92 | Normal | not applicable (first loan) |
| Dec-2025 | NDAYAMBAJE Edouard | 120 | Normal | not applicable (first loan) |
| Dec-2025 | HABINEZA Jean Marie | 74 | Normal | not applicable (first loan) |
| Dec-2025 | BIZIMANA Andre | 74 | Normal | not applicable (first loan) |
| Dec-2025 | BIGIRIMANA Desire | 273 | Normal | not applicable (first loan) |
| Dec-2025 | **Desire DEMINO** | 6 | Normal | **"Yes" — a repeat client** |
| Mar-2026 | HABIMANA Emmanuel | 96 | Normal | not applicable (first loan) |
| Mar-2026 | NDAYAMBAJE Edouard | 210 | Normal | not applicable (first loan) |
| Mar-2026 | HABINEZA Jean Marie | 164 | Normal | not applicable (first loan) |
| Jun-2026 | HABINEZA Jean Marie | 6 | Normal | not applicable (first loan) |
| Jun-2026 | **BIZIMANA Andre** | **325** | Normal | not applicable (first loan) |
| Jun-2026 | ABAYISENGA jean claude | 8 | Normal | not applicable (first loan) |

**The first-time-client hypothesis is ruled out by real evidence, not
confirmed.** Desire Demino is explicitly marked as a *repeat* client
("previous loans paid" = "Yes") and still stays Normal at 6 days overdue —
if grace treatment were tied to first-loan status, a repeat client should
have been reclassified. It wasn't.

**The real pattern is much bigger than a grace period**: across all four
real filings, no loan has ever appeared in the Watch, Substandard,
Doubtful, or Loss sheets — not even BIZIMANA Andre at 325 days overdue,
which by the documented day-count rule (180-359 days = Doubtful, 50%
provision) should very much not be in the 0%-provision Normal bucket.
Every real loan, first-time or repeat, mildly or severely overdue, has
stayed Normal in every real filing submitted to date.

**Checked the real Explanatory Notes sheet for a documented rationale**
(2026-08-12, same investigation) — none exists. No mention of a grace
period, first-loan treatment, or any exception to day-count anywhere in
its 146 rows. If anything, the notes argue against the observed practice:
the pre-submission checklist explicitly says "❸ Check if Loans are
categorized as per regulation," and the notes' own explanatory text for
rows 79-83 (Watch/Substandard/Doubtful/Loss/Restructured) all say
"*classified under Normal*" verbatim — a copy-paste artifact that itself
suggests classification was never carefully differentiated in practice,
not a documented alternate policy. This is real evidence the gap is
between BNR's stated expectation and actual filed practice — it doesn't
resolve *why*, and still needs Devotha.

**Interim policy implemented (Kevin, 2026-08-12)**: given 12/12 real
examples across all 4 filings classify every loan Normal regardless of
days overdue (up to 325 days), `lib/bnr-report.ts` now defaults every
loan to the Normal classification for both the FS sheet's rows 87-93 and
the per-loan classification sheets — Watch/Substandard/Doubtful/Loss
sheets are correctly left empty, matching real filed practice exactly
(confirmed: generated row 87 now matches the real Jun-26 filing exactly,
29,587,452 vs 29,587,452, up from 27,087,452 before this change).

**This is explicitly a deliberate simplification matching real filed
practice, not a permanent rule.** The real day-count logic
(`getDaysOverdue`/`dayBucket`) is preserved in the code, just unused —
if INEMA's real classification practice changes (a policy update, or
Devotha's answer reveals a real process that should be applied), this
needs to be revisited and the day-count buckets reinstated.

Closed from the investigation side for now; open if practice changes or
Devotha's input gives a different real rule to apply.

## Late payment interest — confirmed, no gap

**Found & closed:** 2026-08-11/12. Kevin's description (a late payment is
treated as one additional month of 5% interest, not a separate penalty
fee) checked against 8 real multi-month late-payment examples across the
real journal — every one uses only standard accounts (Bank, Accounts
Receivable, Loan Issued, Interest Income), never a separate penalty
account or narration, and 6 of 8 show an exact clean multiple of monthly
interest (2×, 2×, 2×, 2×, 4×, 2×). Matches `payments/route.ts`'s existing
`monthsElapsed × 5%` logic exactly. No gap, no change needed.

## FS row 17/18 split — Interest Receivable vs Other Assets

**Found:** 2026-08-12, during the final pre-production re-study's full
live-data generation test (base = real Mar-26 filing, generated column =
Jun-26, compared cell-by-cell against the real archived Jun-26 filing).

**What the evidence shows:** the live ledger's account 3030 (Accounts
Receivable — Interest and Fees) and accounts 3040/3050/3060 (Other
Receivables/Prepaid/Caution) sum to the exact same combined total as the
real filing's row 17 ("Interest receivable") + row 18 ("Other Assets")
combined — 2,154,833.4 both ways, exact match. But the SPLIT between the
two rows differs by 469,640 in opposite directions:

| Row | Real filed | Generated (live ledger) |
|---|---|---|
| 17. Interest receivable | 1,275,153.4 | 1,744,793.4 |
| 18. Other Assets | 879,680 | 410,040 |

This means some real transaction(s) totaling 469,640 are booked to account
3030 in the live ledger but were reported under "Other Assets" (not
"Interest receivable") in the real Jun-26 filing — a categorization
question, not a missing-data problem. Needs Devotha to say which real
transactions those are and whether the account code or the FS-row mapping
should change. Not implemented in code — no safe way to guess which
transactions to reclassify.

## FS rows 40/41 — Interest and Fee income YTD gap

**Found:** 2026-08-12, same test as above.

Real filed (Jun-26): Interest Income 6,487,353.4, Fees & Commissions
1,652,000. Generated (live ledger, YTD sum of accounts 7010/7020):
6,437,353.4 and 1,839,253 — off by -50,000 and +187,253 respectively (not
a matched swap like rows 17/18 above; two separate gaps). Given the
documented "Fee + VAT not captured at loan disbursement" gap above, VAT
being commingled into 7020 was checked as a hypothesis (187,253 / 1,652,000
≈ 11.3%, not the documented 18% VAT rate) — doesn't cleanly explain it.
Needs Devotha's bookkeeping review of what specific YTD transactions
account for the gap. Not implemented — no safe way to guess.

## FS rows 77/78 — Men/Women portfolio value split

**Found:** 2026-08-12, same test. Real filed: Men 20,458,732 / Women
9,128,720. Generated (live `iacm_clients.gender` on outstanding loans):
Men 20,610,026 / Women 8,977,426. Both totals sum to the identical
29,587,452 (matches row 87 exactly, confirming total portfolio value is
correct) — the discrepancy (151,294 both ways) is one or more loans
recorded with a different gender in the live system than what was filed in
Jun-26. Needs Devotha to confirm which client(s); not guessed in code.

## Two clients with swapped balance_outstanding values

**Found:** 2026-08-12, same test, via per-loan ID-matched comparison of the
Normal Loans classification sheet. INDERE Serge (ID 1198980053193010) and
UMURORE Brigitte (ID 1196370001014280) show balances that are exactly
swapped between the real Jun-26 filing and the live system:

| Client | Real filed balance | Live system balance |
|---|---|---|
| INDERE Serge | 348,706 | 500,000 |
| UMURORE Brigitte | 500,000 | 348,706 |

Every other field for both loans matches. This looks like a real data-entry
mix-up (two loan records' balances swapped) rather than a mapping bug —
worth Devotha confirming which figure is correct for each client before
correcting `iacm_loans`. Not corrected here since guessing which of the two
numbers is right for which client isn't safe.

## Classification-sheet cosmetic formatting noise — not a gap, no action needed

**Found:** 2026-08-12, same test. A meaningful fraction of the per-loan
field "mismatches" seen in the raw comparison are not data problems: the
real filed sheets are inconsistent in their OWN capitalization from row to
row (e.g. some loans show gender as "Male", others "male"; district as
"GASABO" in one row and "Gasabo" in another, within the same real filing).
The generator now capitalizes gender/marital status and upper-cases
district/sector/cell/village to match the more common real convention, but
since the real file itself isn't internally consistent, an exact 21-for-21
match isn't achievable without literally copying each human filer's
arbitrary per-row choice. Treated as expected noise, not pursued further.

## WE (Women Entrepreneurs) count rows — resolved

**Found & fixed:** 2026-08-11/12. Confirmed the WE count (FS rows
113/114/117) tracks women with a currently-*outstanding* balance, the
same set as row 74 — verified by reconstructing real per-loan gender and
balance data directly from the Mar-2026 and Jun-2026 classification
sheets (2 real women outstanding in Mar-26, 7 in Jun-26, matching row 74
exactly both times). The real Mar-26 filing's own WE figure (4) doesn't
match this independently-verified count of 2 — real evidence points to
that being an error in the Mar-26 filing itself, not a wrong mapping.
`lib/bnr-report.ts` now sets rows 113/114/117 to the same women-with-
outstanding-balance count as row 74/78.
