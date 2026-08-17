# Known Gaps — Tracked, Not Yet Fixed

Real, confirmed gaps found during development that are deliberately not
fixed yet — logged here so they don't get lost, with enough context to
pick up in a future session without re-deriving the diagnosis.

## Real historical practice used periodic interest accrual — live system doesn't, and this is a policy question for Devotha

**Found:** 2026-08-13, studying "INEMA JOURNAL AND ACCOUNTS-Updated(1)
(1)(1)(1).xlsx" (found on Desktop, 3 identical copies by MD5) cell by
cell against the already-studied source file. Confirmed this is genuinely
different, older real data — it covers 2025-07-17 to 2025-12-02 (company
formation through the first ~4.5 months of operation), not a duplicate of
the Jan-2026-onward file already studied. Very plausibly the source the
Jan-1-2026 opening balance was rolled up from.

**The real distinction found:** the file shows INEMA originally recognized
interest via **periodic accrual**, independent of when clients actually
paid — month-end entries like "Accruing the interest earned up to
30/09/2025" debit AR and credit 7010 (Interest Income) on a schedule.
When a payment later arrives, it clears whatever's sitting in AR; 7010 only
gets credited fresh for interest accrued *since* the last accrual point.

Two concrete examples:
- Gilbert Kami's first payment (2025-11-24) clears AR for exactly 23,600
  — his original disbursement fee+VAT, nothing more — and credits 7010
  fresh for a full month's interest (25,000), since no accrual had
  happened yet for his loan.
- Laurance Muhayimpundu's payoff (2025-11-19) clears AR for 145,800 —
  his original 70,800 fee+VAT *plus* 75,000 already recognized in an
  earlier accrual cycle — and separately credits 7010 fresh for only
  75,000 more (the new month since that accrual), not re-recognizing
  what was already booked.

**This is not accurately described as "first payment vs. installment."**
The real trigger is whether a periodic accrual entry happened between
disbursement/last payment and this payment — correlated with payment
sequence in practice, but a different mechanism. `payments/route.ts`
today has no accrual concept at all: it computes interest fresh via
`monthsElapsed()` and credits 7010 directly every time, with no parallel
accrual process. This means it isn't currently double-counting anything
(there's nothing accrued to double-count against) — it just doesn't match
this older, more sophisticated bookkeeping pattern.

**Not implemented.** Whether INEMA should adopt month-end accrual as a
live, ongoing process is a real bookkeeping-policy decision — needs
Devotha's direct input, not a unilateral code change.

## Exhaustive transaction-by-transaction journal verification — complete

**Done:** 2026-08-12, following up on the interest/fee income fix, at
Kevin's request for a complete (not sample-based) check of every real
transaction in the source journal file against `iacm_journal_entries` /
`iacm_journal_lines`.

**Method:** every live entry falls into one of three groups, each verified
differently:
- 159 entries whose `reference` field cites its exact source file row
  (e.g. `journal-import-row88`) — verified by direct row lookup, no fuzzy
  matching needed. All 159 confirmed to match the file exactly (line-for-
  line account codes/amounts, and date). 13 initially looked like
  mismatches under a naive same-narration grouping, but every one turned
  out to be the file itself splitting one real transaction across rows
  with slightly different narration text (rent-recognition entries, a
  same-transaction line with a typo'd year, salary accrual vs. payment
  posted as separate real events) — the live data was already correct;
  the grouping tool wasn't smart enough to see it. Zero real errors in
  this group.
- 21 "backfill: disbursement method assumed bank transfer, not verified"
  entries (fee-estimate disbursements) — checked individually against the
  file by name. 1 (HABINEZA) is the already-documented restructuring case,
  out of scope. Of the remaining 20: 16 have real file confirmation (2
  needed correction — see the FS rows 40/41 entry above, now fixed; 8 are
  exact; 6 have the right amounts but a date 1-2 days off from the file —
  see below). 4 have no file record of the original disbursement at all
  (Bigirimana Desire, Kobisinge Marie, Muhorakeye Providence, Niyitegeka
  Francine) — already documented as unconfirmable, predates the tracked
  journal.
- 23 "[backfill]" repayment entries — checked individually against the
  file by name, date, and amount. 22 match the file exactly. 1 is new —
  see below.

**Final tally: 197 of 203 live entries are backed by a real, verified
match in the source file (195 already exact, 2 corrected this session).
6 have no real file backing** — the 4 already-documented disbursement
estimates above, HABINEZA (separately closed), and one newly-found
phantom entry (below). This matches Kevin's own estimate of 197 real
transactions exactly.

**This is now a complete verification, not a sample.** No further
transaction-level study is likely to find anything new in this journal —
what remains (the disbursement estimates, the date-drift entries, the
phantom entry below) is fully enumerated and understood, not a gap in
coverage.

## Minor: 6 disbursement entries dated 1-2 days off from the real file (no report impact)

**Found:** 2026-08-12, during the exhaustive verification above. Bahati
Eric, Nzungize Emmanuel, Tuyizere Felix, Ntabanganyimana Fabien, Nasabwe
Alice, and Tuyisenge Matutina Stella (her June 5 disbursement cycle
specifically — she took two real loans, and this is the second one) all
have every line amount exactly matching the real file, but the backfilled
`entry_date` is 1-2 days earlier than the file's real date. Consistent
enough across multiple entries (always earlier, never later) to suggest a
systematic date-shift in whatever process originally estimated these, not
six independent typos — though unlike the Demino/Habimana case, there's
no amount error alongside it, just the date.

**No BNR report impact:** all six dates stay within the same YTD window
(Jan-Jun 2026) and don't cross `LEDGER_CUTOFF_DATE`, so `getAccountMovementSum()`
sums them into the same quarter either way — the 1-2 day shift changes
nothing in any generated report. Low priority; correcting the six dates
to match the file exactly is a trivial, zero-risk cleanup whenever it's
convenient, not urgent.

## New: Muhorakeye Providence's 2026-06-30 repayment entry has no real file backing

**Found:** 2026-08-12, during the exhaustive verification above. A
"Loan repayment — MUHORAKEYE Providence [backfill]" entry exists dated
exactly 2026-06-30 (50,000: 3020 debit / 3110 credit — principal
reduction only, no interest or AR line). Searched the source file
thoroughly for any Providence-related transaction on or near that date —
her real activity in the tracked file goes 2026-05-27 (disbursement) then
skips straight to 2026-07-16 (beyond the current backfill's June 30
scope). There is no real transaction this entry could correspond to.

**Likely cause:** the same estimation process that produced her
disbursement fee guess (27,133, already documented as unconfirmed) may
have also plugged this 50,000 "closing" entry to reconcile her ending
`iacm_loans.balance_outstanding` against her confirmed real repayments,
without a real underlying transaction.

**No BNR report impact:** dated exactly at `LEDGER_CUTOFF_DATE`
('2026-06-30'), and `getAccountBalance()`'s filter is strictly-greater-
than the cutoff, so this entry has never been counted in any report
regardless of whether it's real.

**Proposed (not yet applied):** delete this entry and its 2 lines — it
has zero evidentiary basis, unlike the disbursement estimates which at
least represent an uncertain amount for a *real* event. If Providence
made a real payment around that date that Devotha remembers, it should be
re-added with the real figure instead. Awaiting confirmation before
touching it.

## Fee + VAT not captured at loan disbursement — resolved

**Found:** 2026-08-10, while verifying the journal entry schema fix
against real historical practice. **Resolved:** already fixed in
commits `7c1a769` ("Capture fee/VAT at disbursement, guard the ledger
cutoff, backfill real history") and `b5f980b` ("Fix expense account
codes, multi-month interest, and shared rate constants") — both on
`origin/master`, predating the 2026-08-12 morning investigation.
**Confirmed 2026-08-12** by direct code read: this entry had gone stale
(never updated when the fix landed), not a real remaining gap.

`app/api/admin/iacm/loans/route.ts` now posts the full 5-line
disbursement entry (AR for fee+VAT, Loan Issued, Bank/Cash, Fee Income,
VAT Control), computed server-side from `disbursed_amount` using
`UPFRONT_FEE_RATE`/`VAT_RATE` in `lib/calculator.ts` (0.04/0.18, matching
the documented real rates) so a tampered client value can't change what
posts to the ledger. The New Loan form displays the auto-calculated
fee/VAT for the same figures. `app/api/admin/iacm/payments/route.ts`
also already resolves the AR-clearing question below — it credits 3030
(not 7020 again) when a payoff includes the fee portion, with a comment
citing the real historical example (Nzungize's repayment) it matches.

Original finding preserved below for context.

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

**Scope for the fix (all items below now done, see resolution note above):**
- ~~Add a fee amount field (or auto-compute 4% of `disbursed_amount`,
  matching the documented terms) to the New Loan form and its API route.~~
- ~~Compute VAT as 18% of that fee.~~
- ~~Extend the disbursement `postJournalEntry()` call (`app/api/admin/iacm/loans/route.ts`)
  to add the AR / Fees & Commission Income / VAT Control lines, matching
  the real historical structure above.~~
- ~~Confirm whether the corresponding AR-clearing line on repayment
  (`app/api/admin/iacm/payments/route.ts`) also needs to be added back —
  real repayments clear this same AR balance as fees get collected
  alongside interest.~~

Closed.

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
live-data generation test. **Confirmed as a filing-convention question,
not a live-system bug: 2026-08-12**, by independently recomputing account
3030 and 3040/3050/3060 balances directly from the real historical journal
source file ("inema journal updated as per 2026 (1) until july (2).xlsx")
rather than the live database.

**What the evidence shows:** the live ledger's account 3030 (Accounts
Receivable — Interest and Fees) and accounts 3040/3050/3060 (Other
Receivables/Prepaid/Caution) sum to the exact same combined total as the
real filing's row 17 ("Interest receivable") + row 18 ("Other Assets")
combined — 2,154,833.4 both ways, exact match. But the SPLIT between the
two rows differs by 469,640 in opposite directions:

| Row | Real filed | Live system | Source journal file (recomputed independently) |
|---|---|---|---|
| 17. Interest receivable (3030) | 1,275,153.4 | 1,744,793.4 | 1,744,793.4 |
| 18. Other Assets (3040+3050+3060) | 879,680 | 410,040 | 410,040 |

**The source journal file agrees with the live system, not the real
filing.** This rules out a live-system backfill error — the live database
is a faithful, correct reflection of the real historical bookkeeping
journal. The real Jun-26 BNR filing itself categorized ~469,640 of
receivables differently than how INEMA's own day-to-day journal records
them, most likely a filing-time judgment call (e.g. moving a specific
overdue/doubtful receivable into a different bucket) that isn't reflected
in the underlying ledger. Needs Devotha to say whether that reclassification
was a deliberate filing decision worth repeating, or an error in the
archived Jun-26 filing. Not implemented in code — no safe way to guess
which receivables should move between the two categories.

## FS rows 40/41 — Interest and Fee income YTD gap

**Found:** 2026-08-12, same test as above. **Traced to specific
transactions and partially fixed: 2026-08-12**, by cross-checking every
real interest/fee transaction in the historical journal source file
("inema journal updated as per 2026 (1) until july (2).xlsx") against
`iacm_journal_entries` / `iacm_journal_lines` line by line, not just
comparing totals.

**The source file's own totals match the real Jun-26 BNR filing exactly**
(Interest 6,487,353.4, Fees 1,652,000, both to the rwf) — unlike the row
17/18 case above, this rules out a filing-convention question. The gap was
entirely between the live database and its own real source file, i.e. a
genuine backfill gap.

**Interest income — fixed, now exact.** The source file had a real
interest repayment from MUHORAKEYE Providence on 2026-05-27 (50,000) that
didn't exist in `iacm_journal_entries`/`iacm_journal_lines` — never
backfilled. Added the missing entry (2-line: 3020 debit 50,000 / 7010
credit 50,000, matching the file exactly). **Verified after the fix: live
7010 total for Jan-Jun 2026 = 6,487,353.4, exact match to the source file
and the real filing.**

**Fee income — 96 of the 187,253 gap fixed, 187,157 remains, genuinely
unresolvable without Devotha:**

1. **Fixed: two wrong backfill amounts, corrected to match the full real
   disbursement entries (not just the fee line — pulling the complete
   5-line real entries revealed the principal/bank/AR/VAT lines and the
   entry dates were also off by small amounts, not just the fee):**

   | | Was (backfill estimate) | Now (real file) |
   |---|---|---|
   | Desire Demino, entry date | 2026-02-12 | **2026-02-13** |
   | — AR (3030) | 70,885 | **70,800** |
   | — Loan Issued (3110) | 1,501,800 | **1,500,000** |
   | — Bank (3020) | 1,501,800 | **1,500,000** |
   | — Fee (7020) | 60,072 | **60,000** |
   | — VAT (2530) | 10,813 | **10,800** |
   | Habimana Emmanuel, entry date | 2026-04-06 | **2026-04-08** |
   | — AR (3030) | 47,228 | **47,200** |
   | — Loan Issued (3110) | 1,000,600 | **1,000,000** |
   | — Bank (3020) | 1,000,600 | **1,000,000** |
   | — Fee (7020) | 40,024 | **40,000** |
   | — VAT (2530) | 7,204 | **7,200** |

   Both entries' 5 lines were deleted and replaced whole (not
   field-patched) so nothing was left half-corrected; both re-verified as
   balanced (debits = credits) after the fix.

2. **187,157 rwf, three backfilled fee entries with no real file
   confirmation at all — NOT fixed, needs Devotha, left exactly as-is
   per explicit instruction not to guess:**
   - Bigirimana Desire: backfilled fee 120,000 (2026-04-02)
   - Aimee Marie Kobisinge / "Marie Kobusinge" in the file: backfilled
     fee 40,024 (2026-04-06)
   - Muhorakeye Providence: backfilled fee 27,133 (2026-05-27, her own
     disbursement — separate from the missing 5/27 interest repayment
     above, which was a different, later transaction on the same client)

   For all three, the source file has zero record of their original
   loan disbursement or fee — only later repayment activity appears
   (e.g. Kobusinge's 2026-03-30 repayment reduces her loan balance from
   ~500,000, implying she was disbursed before the file's Jan-1-2026
   start). These three backfilled amounts are a prior process's
   *computed estimate* (each is close to 4% of a plausible principal,
   consistent with the documented standard fee rate), not a transcribed
   real figure — there is nothing in either source to confirm or
   contradict them.

   **Needs Devotha:** were these three loans (all pre-dating the
   tracked journal) actually charged a fee at disbursement, matching
   standard practice? If yes, are these three estimated amounts close
   enough to keep, or does she have the real figures? If these loans
   were fee-exempt for some reason, the entries should be removed
   instead.

**Verified after both fixes: live 7020 total for Jan-Jun 2026 =
1,839,157 (was 1,839,253). Gap vs. the real file's 1,652,000 is now
exactly 187,157 — precisely the sum of the three unconfirmed estimates
above, nothing left unexplained.**

**Confirmed no effect on `getAccountBalance()` for any report date ≥
2026-06-30**: all three corrected/added entries are dated 2026-02-13,
2026-04-08, and 2026-05-27 — all strictly before `LEDGER_CUTOFF_DATE`
('2026-06-30'). Queried `iacm_journal_entries` directly with the same
`entry_date > LEDGER_CUTOFF_DATE` filter `getAccountBalance()` uses and
confirmed zero of the three touched entries match — they were excluded
before this fix and remain excluded after it, by construction of the date
filter itself.

## FS rows 77/78 and the INDERE/UMURORE swap — closed, same root cause, confirmed historical filing error

**Found:** 2026-08-12, same test as above (two apparently separate items:
a 151,294 Men/Women split discrepancy, and INDERE Serge / UMURORE Brigitte
showing swapped balances). **Confirmed as one single root cause, and
closed: 2026-08-12**, by independently tracing both clients' real loan
principal history in the historical journal source file.

**The journal file proves the live system is correct.** Account 3110
("Loan issued") entries for each client:
- **INDERE Serge**: disbursed 500,000 (2026-03-30). Every subsequent
  repayment in the file (2026-04-21, 2026-05-28, 2026-07-27) posts only to
  Bank and Interest Income — never a 3110 principal-reduction line. His
  true outstanding balance per the real journal is unchanged: **500,000**.
- **UMURORE Brigitte**: disbursed 500,000 (2026-04-22). Two repayments
  *do* post real principal-reduction lines to 3110: 64,027 (2026-05-29)
  and 87,267 (2026-06-26). Her true outstanding balance per the real
  journal is 500,000 − 64,027 − 87,267 = **348,706**.

This exactly matches what the live system already shows (Indere 500,000,
Brigitte 348,706) and exactly contradicts the real Jun-26 BNR filing,
which lists Indere at 348,706 and Brigitte at 500,000 — a swap. The real
filing also lists Indere as Male and Brigitte as female, matching the live
system's own gender records — so the balance swap in that one archived
filing is the entire, sole cause of the Men/Women portfolio-value gap too:
151,294 is exactly the difference between the two clients' true balances
(500,000 − 348,706), and it's exactly the size of the rows 77/78 gap.

**Conclusion: this is a confirmed, already-submitted data-entry error in
the archived Jun-2026 BNR filing itself, not a live-system bug.** The live
system and the independent source journal file agree with each other and
disagree with that one historical filing. Nothing to fix in `iacm_loans`,
`iacm_clients`, or the generator — closed from further investigation.

## Balance-sheet accounts (3020, 3030, 3110, 2530) diverge from the source journal file for Jan-Jun 2026 — real, but currently inert

**Found:** 2026-08-12, during the broader file-vs-live reconciliation run
alongside the items above (every account code, not just 7010/7020,
compared between the source journal file and `iacm_journal_lines` for
Jan-Jun 2026).

**What's different:** unlike the income-statement accounts (6110, 6210,
6280, 6300 — all match the file exactly; 7010/7020 — resolved above),
several balance-sheet accounts have real, substantial net differences
between the file and the live journal for Jan-Jun 2026:

| Account | File net | Live net | Diff |
|---|---|---|---|
| 2530 VAT Control | -27,312 | -61,017 | -33,705 |
| 3020 Bank Accounts | 3,071,804 | -1,609,516 | -4,681,320 |
| 3030 Accounts Receivable | 1,744,793.4 | 1,965,751.4 | 220,958 |
| 3110 Loan issued | 29,587,452 | 34,218,772 | 4,631,320 |

All four differences trace to the same source: journal entries tagged
`[backfill: disbursement method assumed bank transfer, not verified]`
post full 5-line disbursements (principal, fee, VAT, cash, AR) for loans
whose original disbursement isn't in the source file at all — the same
three loans identified in the FS rows 40/41 fee-income gap above
(Bigirimana Desire, Kobisinge/Kobusinge Marie, Muhorakeye Providence),
plus others. These are estimates for pre-2026 disbursements the tracked
journal file never captured, not errors introduced during backfill.

**Why this doesn't currently affect any BNR report output:** `getAccountBalance()`
in `lib/ledger.ts` only counts journal movements *strictly after*
`LEDGER_CUTOFF_DATE` ('2026-06-30') — everything on or before that date is
represented by the manually-calibrated `iacm_opening_balances` snapshot
instead (deliberately aligned to the real BNR filings, see the "Opening
balances aligned to official BNR filings" entry above). Since all of the
Jan-Jun 2026 activity discussed here falls on or before the cutoff, none
of it is actually read for any report as of Jun-2026 or later — the FS
sheet's cash/AR rows already come from the calibrated opening balance, not
these journal entries directly. (This is different from 7010/7020, which
use `getAccountMovementSum()` — deliberately *not* cutoff-protected, since
income-statement rows are real YTD sums with no separate opening snapshot
— which is exactly why 7010/7020 needed fixing and this doesn't, yet.)

**Not started, not urgent.** Real and worth knowing about for any future
work that reconciles the raw ledger independently of the calibrated
opening balance, but no action needed for BNR reporting unless the cutoff
date or opening-balance strategy changes.

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

## CRB monthly report — fields left genuinely blank, and other real assumptions

**Built:** 2026-08-15, `lib/crb-report.ts`. Unlike BNR (a continuing,
column-per-quarter document), Kevin's explicit framing is that CRB
submissions are independent monthly snapshots — every currently-
outstanding loan (`balance_outstanding > 0`), fresh each run, no carry-
forward. The generator loads the most recently archived real `.xls` as a
structural base (74-column Consumer sheet + 6 untouched stub sheets:
Corporate, Shareholders, Directors, Collateral, Guarantors, Bounced
Cheques), clears the Consumer sheet's data rows, and rewrites them.

**Fields with no live data source — left blank, need Devotha or the CRB
guide to resolve:**
Salutation, Passport No, Nationality, Tax No, Driving License No, Social
Security Number, Health Insurance Number, No of Dependants, Date of Birth
(only `age` is tracked, not a real DOB), Place of Birth, Postal Address
(both lines), Physical Address Line 2/Postal Code/Plot Number, Email
Address, Residence Type, Fascimile, the entire Employer block (Name,
Address ×2, Town, Country), Occupation, Income, Income Frequency, Group
Name/Number, Old Account Number, Joint Loan Participants, Terms Duration,
Repayment Term (real historical values are "BUL"/"MTH" but no confident
rule for which applies to a given INEMA loan was found — see below),
Available Credit, Date Closed (always blank by construction — the
`balance_outstanding > 0` filter excludes closed loans), Approval Date,
and Nature/Category/Sector of Activity (Kevin's explicit decision).

**Intentionally NOT replicating known junk from the real historical
files** (found during the earlier study, see prior session's findings):
`Interest Rate` was a flat "13" on every real row regardless of the
client's actual loan — clearly a template artifact, since INEMA's real
monthly rate is 5% (60%/year). This generator computes the real
annualized rate instead (`interest_rate × 12 × 100`). `Approval Date` had
clear junk values ("9300", "0001") — left genuinely blank rather than
reusing `disbursement_date` under a different label, since INEMA has no
separate tracked approval step/date. `First/Last/Final Payment Date` were
identical placeholder values across every row in the real files, some
chronologically impossible — this generator uses the real
`iacm_loans.first_payment_date` / `last_payment_date` / `maturity_date`
columns instead.

**Real, computed (not defaulted) per Kevin's explicit decision:**
`Days in Arrears` / `Amount Past Due` / `Classification` use
`getDaysOverdue()` (moved to `lib/calculator.ts`, shared with the BNR
generator) against each loan's real `maturity_date` and
`balance_outstanding` — the same 1-89/90-179/180-359/360+ day thresholds
already described in the BNR report page's UI text. This is a deliberate
difference from BNR, which defaults every loan to Normal by policy (see
"Loan classification" above) — CRB has real evidence (Muhorakeye
Providence, Jul-2026 filing) that arrears are sometimes accurately
reported, so there's no equivalent "real practice never uses this" basis
to default here.

**Name splitting (Surname / Forename 1-3):** `iacm_clients` stores one
`full_name` field, no separate surname/forename columns. The real
archived files show consistent Rwandan convention — surname first, often
all-caps, then given names — so this generator splits on whitespace and
takes the first token as surname, the rest (up to 3) as forenames. A name
not entered in that order will split wrong; no live data quality check
enforces surname-first entry today.

**Physical Address Province:** `iacm_clients` has no province field, only
district/sector/cell/village. Rwanda's district→province mapping is
fixed public administrative geography (30 districts, 5 provinces + Kigali
City), so this is hardcoded in `lib/crb-report.ts`, not derived from
client-specific data.

**Scheduled Monthly Payment Amount:** computed as `disbursed_amount ×
5%` — INEMA's steady-state (month 2+) monthly interest obligation from
`lib/calculator.ts`. Month 1's real due amount is higher (includes the 4%
upfront fee + 18% VAT on that fee) but isn't used here since this column
represents an ongoing recurring figure, not a specific month's bill.

**Actual Payment Amount:** the most recent `iacm_payments.total_amount`
for the loan (not a running total — the adjacent Scheduled Payment column
already represents the recurring figure).

**Installments in Arrears:** approximated as `days_in_arrears ÷
repayment_frequency_days`, since INEMA's real repayment model (interest
charged monthly, principal due at maturity) has no formal per-installment
tracking table to count against directly. Treat as an estimate, not an
authoritative count.

**Account Number:** `iacm_clients.account_number`, assigned sequentially
(`IFS0001`, `IFS0002`, ...) the first time a client is included in any
CRB export, persisted permanently. Migration added to `supabase.sql`
2026-08-15; needs to be run against the live database (`alter table
iacm_clients add column if not exists account_number text unique;`)
before this generator can run.

**All cell values are written as text, not real numbers — matching the
real archived file's own convention.** Direct inspection found the
original file has no true numeric cells anywhere in the Consumer sheet;
even "Current Balance" reads back as the string `"2000000"`, format code
`"@"` (Text). The first version of this generator wrote amounts/rates/day
-counts as real numbers, which visibly right-aligned instead of matching
every other left-aligned text cell. Fixed 2026-08-16 by writing every
value as `{ t: 's', z: '@' }`, same as the source file.

**Row heights do not survive regeneration — confirmed unfixable with the
`xlsx` (SheetJS) library, not a bug in this code.** The real archived file
has 2 rows (3-4) with an explicit 15.75pt height override; a pure no-op
test — load the original, change nothing, write it straight back out as
`.xls` — drops this even with `cellStyles: true` passed to both the read
and the write. Column widths and number-format codes *are* recoverable
this way (they were the real cause of the "visual appearance changed"
report from Kevin on 2026-08-16 — `cellStyles`/`cellNF` weren't being
passed to `XLSX.read()`, so all 257 of the original's column widths were
lost before any write even happened, on every sheet including the 6
untouched stubs). Row height write support for legacy BIFF8 output
specifically isn't there in this library. Impact is minor — 2 rows, close
to Excel's default height regardless.

**Default font is Arial 12, not the original's real Calibri 11 —
attempted a fix, reverted it, staying on Arial by deliberate decision.**
Confirmed via direct inspection with `xlrd` that the real archived
file's true workbook default (font index 0, used by the header and
nearly every data cell) is Calibri 11 — "Arial 12" is purely this
library's own hardcoded fallback (`write_FONTS_biff8` in
`node_modules/xlsx/xlsx.js` writes a single literal `{sz:12,
name:"Arial"}` FONT record with no option to parameterize it, confirmed
by reading the library source directly).

Patched it via `patch-package` (2-line change, `sz:12→11`,
`name:"Arial"→"Calibri"`) on 2026-08-16. Kevin reported a Protected View
security warning on the resulting file that hadn't appeared before the
patch. Investigated: since "Calibri" is 2 characters longer than
"Arial", the FONT record's byte length changes, which cascades through
every subsequent offset in the legacy BIFF8/OLE-compound-file stream — a
before/after no-op diff (same input, only the font patch differing)
showed 29,590 of 53,248 bytes differing. The write process itself is
fully deterministic (two consecutive runs of identical code produced
byte-identical output, ruling out timestamp noise as the explanation),
so this cascade is real and entirely attributable to the font-name
length change. The resulting file still parsed cleanly and completely
under `xlrd` (an independent reader) with no errors, and had no
Zone.Identifier/Mark-of-the-Web stream — but neither of those is the
same test as opening it in real Excel, and this codebase already has one
precedent (the original BNR template work, `lib/bnr-report.ts`'s header
comment) of an automated round-trip passing while real Excel still
complained. Given Kevin's explicit standard — a security warning on a
real regulatory file is not acceptable under any circumstance — and
given I have no way to independently verify "safe" to that standard,
**the patch was reverted**: `patches/xlsx+0.18.5.patch` deleted, the
`patch-package` dependency and `postinstall` hook removed, `xlsx`
reinstalled clean. The generator produces Arial 12 again, matching what
was already confirmed safe (no warning reported) before the patch.
Calibri 11 remains a real, understood, but unresolved cosmetic gap —
not silently dropped.

**Full decorative-formatting gap (fonts, fills, borders, row heights) —
exhaustively scoped 2026-08-17, shipping as a known limitation, real
byte-level fix deliberately deferred to dedicated future work.**

An exhaustive, all-7-sheets check using `xlrd` (which reads real BIFF8
font/format records directly — more complete than `xlsx`'s own
`cellStyles` reading, which was checked earlier and materially
undercounted this) found the gap is much bigger than "a couple of cells":
the real archived file defines **35 fonts** (Consumer's own *data* rows,
not just the header, use 4 different ones — Calibri automatic, Bookman
Old Style, Arial), **311 distinct cell-format (XF) combinations**, a
full border under the header row on **every one of the 7 sheets**, and a
63-cell accent fill block on the Corporate sheet's data-entry row that
an earlier, Consumer-only check had missed entirely. Every row (not just
2, as first found) has an explicit height. The generator currently
preserves data values, all 74 columns, all 6 stub sheets' content, and
~256 of 257 column widths — everything else in this list is lost, because
`xlsx` (SheetJS community edition) doesn't have working style read/write
support for legacy BIFF8, which isn't a configurable gap (see the font
finding above: even the one style property reachable via source-patching
caused a real security warning once touched).

**Root cause, precisely:** the generator's whole architecture reads the
base file into an in-memory object model, clears/rewrites the Consumer
sheet's data, and re-serializes the *entire* workbook from that model.
Style information that the reader never captured has nothing to write
back out — no write-side option can recover it, because it isn't there
to recover.

**The only real fix identified: a byte-level BIFF8 patcher** that edits
the original archived file's raw bytes directly — never going through
the lossy read/rewrite pipeline — touching only the specific bytes for
cells whose value actually changed, leaving every font/fill/border/row-
height byte untouched. Scoped in detail 2026-08-17, not built. Starting
point for whoever picks this up:

- **First, cheap thing to verify (a real open question, not assumed):**
  whether the Consumer sheet's text cells are stored as `LABELSST`
  records (a 4-byte index into a shared string table — standard for
  real Excel-authored files with repeated text) or inline `LABEL`
  records. This was never confirmed via a raw hex dump, only inferred
  from how `xlsx`/`xlrd` present the parsed values. It determines
  whether "changing a value" means swapping a 4-byte index (if the new
  string already exists in the table — rare in practice, since new
  balances/dates are new strings almost every time) or always growing
  the shared-string table.
- **This isn't a rare-edge-case patcher — it needs real resize
  capability on nearly every run.** The loan book grows most months (17
  real rows in the Aug-2026 archive vs. 21 live outstanding loans the
  same week this was scoped), so new client rows — not just changed
  values — are the common case, and inserting them means growing the
  sheet's row/cell record area, not just substituting bytes in place.
- **The OLE-container mechanics** (the file is a compound file: fixed-
  size sectors, a FAT sector-chain per stream, a directory listing every
  stream) need correct handling whenever the Workbook stream's total
  length changes: extending the FAT chain, finding or allocating free
  sectors, updating the directory entry's declared length, and — the
  sharp, easy-to-miss detail — recomputing the absolute byte offset
  (`BOUNDSHEET.lbPlyPos`) that every one of the 7 sheets stores pointing
  to its own data, since growing anything before a given sheet in stream
  order (the SST lives in the workbook "globals" section, before every
  sheet) shifts where every later sheet actually starts.
- **A real lead worth checking before hand-rolling the OLE layer**:
  SheetJS publishes `cfb` as a separate package for exactly this
  container-level read/write, and `xlsx` likely already uses it
  internally — plausibly why today's generator can already shrink/grow
  the file without corrupting the container, even though it can't
  preserve styles. If `cfb` is reusable directly, the real remaining
  work narrows to the BIFF8 record-level logic (reading and re-emitting
  FONT/XF/fill/border tables and per-cell XF assignments) rather than
  also reimplementing compound-file mechanics from zero. Not confirmed
  — the first real step of the dedicated effort, not an assumption to
  build on.
- **Staged testing matrix**, each stage checked in real Excel before
  moving to the next, given the font-patch precedent above of an
  automated pass not catching a real Excel-only problem: zero-change
  no-op patch; small in-place-only patch (values already present in the
  SST); a patch requiring real SST growth; a patch adding new rows; a
  patch removing rows (repaid clients); and feeding the patcher's own
  output back in as the next month's base, since that's the real usage
  pattern. Every output should self-validate (re-parse with `xlrd`, walk
  the raw FAT chain, confirm every untouched cell's XF/font index is
  unchanged) and refuse to return a file if anything's inconsistent,
  rather than ever hand over a silently-corrupt regulatory document.

**Decision (Kevin, 2026-08-17):** ship the current generator as-is. Data
values, account numbers, arrears/classification, all 74 columns, and all
6 stub sheets are correct and independently verified against live data.
The decorative-formatting gap above is real and understood, not a hidden
risk — explicitly not worth blocking the feature on, and explicitly not
worth attempting as a rushed tonight-fix given the demonstrated fragility
of this file format. The byte-level patcher is scoped and ready to pick
up as dedicated future work, starting with the SST verification spike
above.

**Update, same day: the byte-level BIFF8 patcher was actually built and
staged-tested (`lib/crb-biff8-patcher.ts`), not just scoped.** Each stage
below was verified two ways before moving to the next: the patcher's own
internal self-check (refuses to write a file at all if anything
unexpected changed) and an independent re-check with `xlrd`, plus a real
Excel open-and-check by Kevin at every stage.

- **Stage 0** — `cfb` (already a real `xlsx` dependency, not something
  added) round-trips the OLE container correctly: confirmed real Excel
  opens a parse→write round trip with zero BIFF8 involvement cleanly.
- **Stage 1** — the Workbook stream's 2,361 real BIFF8 records parse and
  reserialize byte-identical with zero changes.
- **Stage 2** — an in-place value change (Gender M→F, reusing an
  existing SST index) touches exactly 1 of 2,361 records, only its
  4-byte `sstIndex` field.
- **Stage 3** — SST growth: a genuinely new value requires appending a
  new SST entry, bumping `cstUnique` (not `cstTotal` — same number of
  text cells overall, one now points elsewhere), and recomputing all 7
  `BOUNDSHEET.lbPlyPos` offsets, since the SST lives in the workbook
  "globals" section that precedes every sheet.
- **Stage 4** — inserting a brand-new client row: new `ROW` + `LABELSST`
  records, each new cell's XF copied directly from the same column on
  the real last row (not inferred). Consumer's `INDEX`/`DBCELL` records
  (row-lookup performance accelerators — MS-XLS documents these as
  optional, not required data) are deleted rather than recomputed,
  since correctly rebuilding `DBCELL`'s relative-offset encoding wasn't
  verified byte-for-byte and leaving them stale seemed riskier than
  removing them — confirmed safe by the real Excel check.
- **Stage 5** — removing an existing row entirely: every later row
  renumbers down by one (a true "close the gap" deletion matching
  Excel's own Delete Row, not a blank row left behind).

**Orphaned SST entries from row removal — confirmed real, decided
permanent, not worth compacting.** Deleting a row's cells doesn't remove
the shared-string entries those cells referenced if nothing else in the
workbook uses them — e.g. removing one real client left 13 of his 46
field values (name, national ID, address, phone, account number — the
identity fields; the ~33 shared/coded values like currency and status
codes stay referenced by other rows) sitting unused in the SST. The
patcher deliberately does not compact/renumber the table to reclaim
these — doing so safely would mean scanning and renumbering every
`LABELSST` reference across all 7 sheets, a meaningfully bigger
operation than "remove one row." **Kevin's decision (2026-08-17):**
accepted as permanent, low-stakes bloat (a name and an ID number sitting
unused costs a few dozen bytes) — not a correctness risk, not worth a
dedicated compaction stage. If this ever needs revisiting, the trigger
would be file-size growth becoming actually noticeable after many real
months of edits, not a theoretical concern today.

**A real bug in `cfb` usage, found by the repeat-use test — not a bug in
this patcher's BIFF8 logic.** Every stage above worked correctly in
isolation (parse the real archived file fresh, mutate, write), but
chaining stages — feeding one stage's own output back in as the next
edit's starting file, exactly how this gets used in real monthly
practice — broke Stage 4 on its second use. Root cause, confirmed by
direct testing: mutating a `CFB.parse()`'d container's stream content in
place and calling `CFB.write()` on that same container object silently
truncates back to the pre-mutation length, but only on a container that
itself came from parsing a *previous* `CFB.write()` output — a single
generation never showed this. Fixed by building a genuinely fresh
container via `CFB.utils.cfb_new()`/`cfb_add()` (copying every other
stream through unchanged) instead of mutating the parsed one — verified
this has no such problem, then re-verified all 5 stages individually
plus a real 4-round chained test (remove → value-change → insert →
remove, each parsing the previous round's actual output bytes) end to
end. This is exactly the failure category the staged testing plan's
"feed the patcher's own output back in" step existed to catch, and it
did.

**Update, wiring the patcher into the live feature (2026-08-17): a
second real bug found, this time in the BIFF8 logic itself, before any
live data touched it.** Building the production diff-based update
(`readConsumerRoster`/`applyRowFieldUpdates`/`applyRowInsertion` in
`lib/crb-biff8-patcher.ts`) against real archived data surfaced that
**not every populated cell in the Consumer sheet is `LABELSST`/text** —
an earlier spot-check (Current Balance, Date Opened) had generalized to
"every cell is text," which turned out to be incomplete. A full scan
found `Classification` is a real RK-encoded number for rows 1-4, and
Opening/Current Balance are packed into a single `MULRK` record for row
2 — every other row/column really is `LABELSST`. Confirmed by hex
decode: `rkraw=1072693248` decodes to `1.0`, matching the real
Classification value.

The first version of the diff logic only scanned for `LABELSST`, so it
treated these real existing values as "not present" — which would have
inserted a second, conflicting cell record at the same row/column
instead of updating the one already there, on the very first live run
(rows 1-4 are real, currently-outstanding clients). Caught in local
testing against the real archived file before any live data ran through
it. Fixed with a proper RK decoder (standard packed-number algorithm:
low 2 bits are flags, either a 30-bit signed int or the high 32 bits of
an IEEE754 double) and MULRK-splitting logic (a touched MULRK group
becomes individual per-column records — `LABELSST` for the column(s)
actually changing, `RK` preserved exactly for the rest) — verified
independently with `xlrd` on both the single-RK-column case
(Classification) and the multi-column-in-one-MULRK-group case (Opening
+ Current Balance changed simultaneously). Once a cell is touched this
way it becomes text going forward, matching the file's dominant
convention and every other cell this generator writes — a deliberate
normalization, not an inconsistency.

**Two more real bugs, both caught by the generator's own self-check on
the actual first live run against real data (21 outstanding loans, 17
real archived clients) — refused to write a file both times, exactly as
designed:**

1. The self-check's own post-patch verification scanner was still
   LABELSST-only (an oversight — the real update logic had already been
   fixed for RK/MULRK, the check verifying it hadn't). A column
   deliberately left untouched because its value already matched (still
   a preserved `RK` cell inside a split `MULRK` group) read back as
   "missing" to the LABELSST-only checker, which then failed a patch
   that was actually correct. Fixed by having the self-check use the
   same RK/MULRK-aware row scanner as the real logic.
2. Inserting a genuinely new client whose data happened to populate
   "Forename or Initial 3" — a column no other real row in the file has
   ever used — had no row to copy an XF (style) from, and the insertion
   logic threw rather than guess. Fixed with an evidence-based fallback:
   when a column has no real example anywhere, use the most common XF
   value across every other real data cell in the sheet (a genuine
   "typical style for this sheet," derived from what's actually there,
   not an invented default) instead of blocking the insert.

Neither was hypothetical — both were hit on the very first real run,
not synthetic test data. Re-ran clean afterward: 21/21 live loans present
with correct values (5 spot-checked by hand against `iacm_loans`/
`iacm_clients` directly — exact match on balance, days in arrears,
account number), 14 added / 7 updated / 10 removed (arithmetically
consistent: 7+14=21 live, 10+7=17 original), all 6 non-Consumer sheets
zero-diff, column widths intact. The generated file was automatically
archived as the new base for next month's edit, confirmed via a fresh
query of `iacm_crb_filed_reports`.
