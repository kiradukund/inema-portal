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

**Full 74-column audit (2026-08-17) — `iacm_clients.marital_status` is
null for every real client, an upstream data-entry gap, not a CRB
generator defect.** Auditing every column against a real live scenario
(14 added, 7 updated, 10 removed) found Marital Status showing correctly
on the 7 preserved rows but blank on all 14 new ones — not because the
generator has a bug, but because `client.marital_status` is confirmed
`null` for all 21 real clients with an outstanding loan today, old and
new alike. The 7 preserved rows only show a real value ("M") because
that's the original archived file's historical data, inherited
untouched — the diff logic never had a live value to compare it
against, so it was never in a position to catch that the underlying
field had never actually been captured. **Flag for Devotha:** capturing
marital status at loan origination — a field that already exists on
`iacm_clients`, just never gets filled in through the current intake
process — would let this column start populating correctly for every
client going forward, with no generator change needed.

**Same audit found two real, previously-missed wiring opportunities,
both now added to `HEADERS_OF_INTEREST`:**
- **Salutation** — the 7 preserved rows show a clean, consistent real
  convention: "Mr" for every male client, "Mrs" for every female one,
  never "Miss"/"Ms" despite `marital_status` existing as a field. Since
  `gender` (unlike `marital_status`) is actually populated for every
  real client, this is now derived with confidence — gender alone, no
  attempt at a marital-status-aware Miss/Mrs distinction, since that
  data doesn't exist yet either (see above).
- **Sector of Activity** — `iacm_loans.economic_sector` is a real schema
  field that was never wired in, the same class of gap as Salutation.
  Confirmed via live query it's currently null for every real loan too,
  so wiring it in doesn't visibly change anything today — but it will
  start populating automatically the first time a loan officer records
  it, with zero further generator changes required.

The remaining 71 blank/excluded columns were each individually confirmed
during this audit to have either no real data source anywhere in the
schema, or to be genuinely inapplicable by the product's own structure
(e.g. Available Credit — not a revolving-credit product; Date Closed —
excluded by construction, since the `balance_outstanding > 0` filter
never includes a closed loan) — not further missed-wiring gaps.

**Final live-schema pass (2026-08-17)** — pulled the real schema
directly from PostgREST (the tracked `supabase.sql` turned out to be
stale relative to the live database, missing real columns like
`iacm_loans.total_installments`) and checked every other table for
anything relevant. Two real, previously-missed sources found and wired
in: `Terms Duration` ← `total_installments` (currently `1` for every
real loan, same "wire it in anyway" treatment as Sector of Activity),
and `Repayment Term` ← BUL if `total_installments = 1`, MTH if `> 1`
(Kevin's confirmed rule — all 21 real current loans show BUL today,
since none has more than 1 installment set yet). `profiles` (the
self-service client-portal table) really does have `date_of_birth`,
`marital_status`, `employment_status`, `employer_name` — but a live
query matching all 21 real CRB clients by `national_id` found zero
overlap; it's a structurally separate system with no real data for
today's actual clients. `loan_applications` has the right columns for a
real approval workflow but has zero rows in the whole database.
Nationality, Occupation, Category, Nature, and Approval Date remain
confirmed to have no source anywhere in any table.

---

## FUTURE (not built) — capture Nationality, Date of Birth, Occupation,
## and Marital Status at loan origination, so CRB stops needing them left blank

**Scoped 2026-08-17, intentionally not built tonight** — this is real
future work, ready to pick up as its own task.

**Correction worth noting first:** Marital Status is *not* actually
missing from the intake form. `app/admin/iacm/loans/new/page.tsx`'s
Client Identity step (step 1) already has a real dropdown for it
(`married`/`single`/`widowed`/`divorced` — the exact 4 values
`maritalCode()` in `lib/crb-report.ts` already expects), and
`app/api/admin/iacm/loans/route.ts` already correctly saves it on both
the insert and update paths (lines 28 and 39). The reason all 21 real
current clients show `marital_status: null` isn't a missing field —
these clients were entered through an older version of this flow, or a
backfill, before this field existed. **No form change needed for
Marital Status** — it will already populate correctly for any new
client going forward. This is genuinely different from Nationality,
Date of Birth, and Occupation, which have no form field and no schema
column at all.

**a. Which form(s):** `app/admin/iacm/loans/new/page.tsx` — specifically
the "Client Identity" step (step 1), the same section that already
collects Full Name/National ID/Phone/Gender/Age/Marital Status/
District/Sector/Cell/Village. This is the one real place Devotha enters
a new client's details, as part of recording a loan — not a separate
admin screen, matching how she actually works.

**b. Field types:**
- **Date of Birth** — a real date picker (`<input type="date">`,
  matching the pattern already used elsewhere for `disbursement_date`/
  `maturity_date` in this same form's Loan Terms step), not free text.
- **Occupation** — plain text input, same style as Sector/Cell/Village.
  No fixed enumeration exists in any real CRB filing seen so far to
  justify a dropdown.
- **Nationality** — text input defaulting to `"Rwandan"` (INEMA's real
  client base is confirmed overwhelmingly Rwandan, with rare real
  exceptions already seen — e.g. Niwagaba James, Ugandan — so a
  dropdown with "Rwandan" pre-selected plus free-text override, rather
  than a hard-coded closed list, is the safer design for a real
  exception).

**c. Schema:** `marital_status` already exists on `iacm_clients`.
`nationality`, `date_of_birth`, `occupation` would be three genuinely
new columns:
```sql
alter table iacm_clients add column if not exists nationality text default 'Rwandan';
alter table iacm_clients add column if not exists date_of_birth date;
alter table iacm_clients add column if not exists occupation text;
```
(Needs Kevin to run directly — service-role/PostgREST can't execute DDL,
the same established constraint as every other schema change this
session.)

**d. Feeds CRB automatically, no generator changes needed once this
exists:** `lib/crb-report.ts`'s `HEADERS_OF_INTEREST` and
`computeFieldValues()` already follow the exact pattern this would need
— add `'Nationality': client.nationality`, `'Date of Birth':
toYyyymmdd(client.date_of_birth)`, `'Occupation': client.occupation` to
`computeFieldValues()`'s `raw` object and the three header strings to
`HEADERS_OF_INTEREST`, the same two-line change already made three times
tonight (Salutation, Sector of Activity, Terms Duration/Repayment Term).
The moment Devotha starts entering real values through the form, they
start appearing in CRB exports automatically — no separate backfill,
no bulk admin task, just the same loan-recording flow she already uses.

## Real incident: last_payment_date-based interest calc silently discarded real cash (HABINEZA Jean Marie, INEMA-2026-0002, 2026-08-18)

Kevin recorded a real 2,694,400 RWF payment for HABINEZA Jean Marie
(6 months of accrued interest/principal/fee+VAT clearing on a 2,000,000
loan disbursed 2025-12-24). The system recorded it as 1 month of
interest and silently discarded 500,000 RWF of real cash — never
written to `iacm_payments.total_amount`, never debited to Bank Accounts
in the journal, never recognized as interest income.

**Root cause**: `app/api/admin/iacm/payments/route.ts`'s interest
calculation trusted `iacm_loans.last_payment_date` as "when this loan
was last touched." The prior night's bulk SQL loan reload had populated
that field on every one of the 21 reloaded loans as a synthetic
placeholder equal to `maturity_date` — not real payment history —
including on loans (13 of 21, confirmed by direct query) with zero real
payments ever recorded in `iacm_payments`. `monthsElapsed(last_payment_date,
payment_date)` came out to exactly 1 because Kevin's chosen payment date
(2026-07-02) happened to match the synthetic placeholder. The resulting
undercounted `interestOwed` fed directly into the "can't overpay" cap
(`maxOwed = outstanding + interestOwed + feeAndVatOwed`), which then
capped `paid` at 2,194,400 — silently truncating the real 2,694,400
received.

**Fix**: the interest calculation now queries `iacm_payments` directly
for the loan's own most recent real `payment_date`, falling back to
`disbursement_date` only when zero real payment rows exist —
`iacm_loans.last_payment_date` is never read for this calculation again
(it's still written for display purposes). Verified safe across all 21
real loans before landing: for every loan with real payment history the
new source matches that history exactly; for every loan with none it
falls back to the true disbursement date. `monthsElapsed` moved to
`lib/calculator.ts` so the Record Payment form's live preview (also
added this incident — shows months-elapsed and the full interest/fee/
principal breakdown before submission, plus a `interest_months`
override input for deliberate multi-month catch-ups) can never drift
from what the backend actually calculates, which was the direct
proximate cause here — the old preview always assumed a flat 1 month
and gave no warning before the caps silently applied.

**Manual correction**: Habineza's incorrect payment row and journal
entry were deleted; `iacm_loans` reverted to `balance_outstanding=
2,000,000`, `principal_repaid=0`, `status='active'`,
`last_payment_date=NULL` (not the synthetic placeholder — NULL is the
truthful state, and the fix no longer depends on this field regardless).
Confirmed clean via direct re-query and dashboard-aggregate reversion.
Kevin re-recorded the real payment through the live UI after the fix
landed.

**Standing risk, checked and cleared**: the 6 other reloaded loans that
already carried a real payment (0003, 0007, 0008, 0010, 0018, 0019) were
checked directly — every `interest_portion` across all 12 of their
payment rows correctly matches the real elapsed months, confirming
those were loaded as historical records via the SQL reload itself, not
entered live through the buggy route. Habineza's was the only real
payment actually processed through the broken calculation before this
fix landed.

## Real incident: /admin/loans, /admin/clients, /admin/reminders silently disconnected from live data (2026-08-18)

Kevin noticed `/admin/loans` (Portal sidebar, NOT the IACM section) still
showed HABINEZA Jean Marie as active with RWF 0 paid, even after the
Habineza payment fix above landed and was verified correct in
`iacm_loans`. Investigated directly: this page — and `/admin/clients`
and `/admin/reminders` alongside it — reads `imported_loans`/
`imported_clients`, a completely separate table pair frozen from an
11-Jun-2026 bulk Excel import, structurally disconnected from
`iacm_loans`/`iacm_clients` (confirmed: no FK relationship exists
between the two systems). Confirmed the same disconnect for every real
client checked (Habineza, Bizimana Andre, Francine, Desire Demino), not
Habineza-specific.

Grepping the whole app for `imported_loans`/`imported_clients` found
this went beyond display pages: `app/api/admin/applications/[id]/
approve/route.ts` was **writing new loans into `imported_loans`** on
every loan-application approval — a live write-path bug, not just a
stale read. Checked the real blast radius: `loan_applications` has zero
rows ever, so this had caused zero real damage (the only two
post-import `imported_loans` rows, created 2026-08-03, were dev-test
entries under "Devotha Kubwimana" with gibberish notes) — but it was a
live landmine for the day someone actually used that feature. Also
found `app/api/admin/applications/[id]/reject/route.ts` updating
`imported_loans` by matching on `client_name` — with `approve` no
longer creating rows there, this would only ever have matched and
corrupted an unrelated real legacy loan for a same-named client.

**Fix, three tiers**:
1. Added a shared `StaleDataBanner` component (`app/admin/
   StaleDataBanner.tsx`) to all three pages: a prominent "Historical /
   Imported Data — Not Current" warning with a direct link to the real
   equivalent (`/admin/iacm/loans` for Loans/Clients, `/admin` for
   Reminders — its live overdue/maturing alerts already exist there,
   built from real `iacm_loans`).
2. `approve/route.ts` no longer writes to `imported_loans`/
   `installments` at all. Deliberately NOT replaced with an
   `iacm_loans`/`iacm_clients` insert either — a portal application only
   captures loan_type/amount/term plus the applicant's profile (name/
   phone/email), none of the national_id/district/gender/marital_status/
   date_of_birth that `iacm_clients` requires and the New Loan form
   already collects. Auto-creating a client record with placeholder KYC
   data would silently produce a low-quality real record. The approval
   still completes (status update, portal-facing `loans` record used by
   the real client portal, approval email) but the response now says
   "⚠️ This is NOT yet in the IACM Loan Portfolio — go to New Loan and
   enter it manually with full KYC" — and `ApplicationActions.tsx` was
   fixed to actually display that message (it was previously discarding
   the API's returned message and showing its own hardcoded "✓
   Approved" text). `reject/route.ts`'s dangerous `imported_loans`
   update removed outright.
3. Cleaned up `imported_loans`/`imported_clients` to only the 21
   current real clients' history (older paid-off loans kept as
   reference) plus removal of the 2 dev-test rows. Matching by
   `national_id` was impossible — every `imported_clients.nid` is null
   — so this was name-based, which required real care: exact-name
   matching alone would have wrongly deleted history for 14 of 21
   current clients whose legacy records are first-name-only (e.g.
   imported "stella" = real "TUYISENGE MATUTINA Stella"). A fuzzy pass
   caught this before any deletion; 2 genuinely ambiguous cases ("Desire
   Demino", "marie" — each matching 2 possible real clients) were sent
   to Kevin rather than guessed, resolved by exact disbursement-date
   match and by elimination (the other candidate was already separately
   correctly attributed). Full pre-deletion backup of both tables:
   `C:\Users\hp\Desktop\imported_data_backup_2026-08-18.json`. Executed
   in FK order (installments → imported_loans → imported_clients, 4/12/8
   rows), verified `iacm_loans`/`iacm_clients`/`iacm_payments`/journal
   exact ID sets identical before and after, not just row counts.

## Real bug: payoff fee-clearing ignored fee already paid by an earlier real payment (NZUNGIZE Emmanuel, INEMA-2026-0010, 2026-08-18)

Caught on a live payment preview before submission, not after. Kevin
tried to record 518,880 against Nzungize's loan (real outstanding
418,880) and the preview showed it trying to clear another 94,400
fee/VAT — but this loan's fee/VAT was already fully cleared by his real
first payment (2026-03-13, `fee_portion=94,400`). No receivable was
left to clear.

**Root cause**: `payments/route.ts`'s `feeAndVatOwed = disbursed *
UPFRONT_FEE_RATE * (1 + VAT_RATE)` was computed purely from
`disbursed_amount`, with no reference to any prior payment's
`fee_portion` — it always assumed the full original fee+VAT was still
owed on any payoff. Worked correctly for Habineza (a genuine first-ever
payment, so the assumption happened to be true) and broke for Nzungize
(multiple real partial payments already made, fee cleared early). Real
consequence, worse than cosmetic: the phantom 94,400 would have been
carved out of the payment before principal, leaving a fake 94,400
balance and blocking the loan from actually closing on a payment that
genuinely covered it in full — plus a duplicate AR-clearing journal
credit against a receivable already at zero in the real ledger (this
loan's historical payments predate the ledger cutoff and never touched
the journal, so the opening balance already reflects the March
clearing).

**Fix**: `feeAndVatOwed` is now netted against this loan's own
cumulative `fee_portion` already paid
(`feeRemaining = max(0, feeAndVatOwed - feeAlreadyCleared)`), used
everywhere the unconditional figure was. Same fix applied to the
Record Payment form's live preview — the whole point of that preview
is to never show something the backend wouldn't actually do, and it
would have kept showing this exact phantom fee otherwise. Verified
read-only against real data before landing: re-simulating Nzungize's
exact pending payment now correctly produces `feePortion=0`,
`principalPortion=418,880`, `newBalance=0` (closes); re-deriving
Habineza's already-completed payoff under the same fixed logic
reproduces his real recorded `feePortion=94,400` exactly unchanged —
a strict generalization, not a behavior change for the case already
proven live.

## Real incident: cleared override silently fell back to auto-calc with no visible signal (BAHATI Eric, INEMA-2026-0005, 2026-08-18)

Kevin entered `5` into "Months of Interest to Charge" and submitted a
payment for Bahati Eric (Feb 12 disbursement). The recorded payment
showed `interest_portion=500,000` — exactly 4 months, not 5.

Investigated directly: no code-level bug found. `submit()` reads
`monthsOverride` from current state at call time with no staleness or
clearing logic anywhere in the client. The evidence instead pointed at
the override field being genuinely empty at submission — an
independent recompute of clean auto-calc (`monthsElapsed(2026-02-12,
2026-07-03)`) produced exactly 500,000, a perfect match to what's
stored, and the submitted `total_amount` (3,118,000) was *also* exactly
the clean 4-month full-payoff total — both fields agreed with each
other as a 4-month transaction, not a partially-corrupted 5-month one.

The real, fixable problem: the override field gave **no visible signal**
if it went from set to empty right before submit — a user could type
`5`, watch the preview update correctly, then lose that value (however
it happened) and submit believing the override was still active, with
nothing on screen contradicting that belief. Fixed: the Payment
Breakdown now leads with an explicit, high-contrast mode badge —
"⚠ MANUAL OVERRIDE ACTIVE" (amber) vs "Auto-calculated (no override
set)" (neutral) — and the months line itself says which mode produced
its number, not just "(auto-calculated)" unconditionally as before.

Reversed and reverified clean: payment + journal entry deleted, loan
restored to `balance_outstanding=2,500,000`, `principal_repaid=0`,
`status='active'`, `last_payment_date=NULL` — every field re-queried
fresh after the writes, not assumed from the delete calls' own return
values.

## Real bug: Monthly Expenses on IACM Home used the same UTC-shift date bug already fixed elsewhere (2026-08-19)

`app/admin/iacm/page.tsx:20` computed "start of this month" via
`new Date(year, month, 1).toISOString().split('T')[0]` — the exact
same root cause as the Monthly Collections chart bug fixed earlier:
converting a locally-constructed date to UTC shifts day=1 back to the
last day of the previous month on this UTC+2 server. Confirmed live:
this printed `2026-07-31` instead of `2026-08-01`. Currently invisible
— the only 2 real expenses ever (500 and 3,000 RWF) are both dated in
early July, outside the affected window either way — but would
silently miscount any expense dated on the actual month boundary going
forward. Fixed with the same pattern as the Collections chart: read
the month-start key back via local getters, no `toISOString()`
round-trip. Verified real August total is still correctly RWF 0 under
the fix, and confirmed the boundary itself: a hypothetical July 31
expense would be wrongly counted as "this month" under the old logic
but correctly excluded under the new one.

Also investigated the same night: HABIMANA Emmanuel's loan showing
`balance_outstanding=118.32` — traced to a real payment
(`total_amount=1,197,800`) that was genuinely 118.32 RWF short of a
clean full payoff (`150,090` interest + `47,228.32` fee + `1,000,600`
principal = `1,197,918.32` needed). Confirmed not a bug — the system
correctly allocated interest → fee → principal against the real amount
received, journal balances, and the small remaining balance is left
on record as-is, honestly reflecting a genuine tiny shortfall rather
than being written off or adjusted.

## Real gap: PAYE/CBHI/Pension/Maternity/WHT had no distinct expense category (2026-08-19)

Kevin provided the real, authoritative chart of accounts (confirmed
against the "Accounts" sheet in `INEMA_Journal_Q3_2026.xlsx`, which
matches his list exactly) and suspected these were being lumped into
2640 Tax Payable. Confirmed: `expenses/route.ts`'s old `EXPENSE_ACCOUNTS`
had no `paye`/`cbhi`/`pension`/`maternity`/`wht` key at all — the single
`'tax'` category (labeled "Tax Payments (PAYE, RSSB, CBHI)") absorbed
all of them into 2640. The route's own prior comment claimed these
"already have their own dedicated codes... settled alongside salary" —
that was never actually true in code; no such path existed.

Real historical evidence from the Journal sheet (638 real rows):
every month Dec 2025 – Jun 2026, PAYE/Maternity/Pension/CBHI were
correctly posted to 2540/2550/2560/2570 (13 times each) — the *real*
bookkeeping got this right consistently. One real exception: two June
entries were misfiled to 2640 on 2026-07-08 in Devotha's own manual
journal — and the same two entries had already been backfilled into
the live `iacm_expenses`/journal exactly as miscoded.

**Fix**: added `paye`(2540)/`cbhi`(2570)/`pension`(2560)/`maternity`(2550)/
`wht`(2590) as their own real categories in `expenses/route.ts` and the
Record Expense form. `tax` now specifically means Corporate Income Tax
(2640), matching its one genuine historical use.

**Audit of everything currently on 2640/6300** (8 real journal lines,
full list and confidence levels shown to Kevin before any change):
confirmed-clear miscategorization on the two live entries described
above ("maternity payment for june 2026" 3,000, "PAYE Payment for june"
114,000 — both explicitly named in their own narration, both dated
2026-07-08). Confirmed correct and left alone: the real "Corporate
Income tax" entry (204,165, 2026-03-31). Flagged, not resolved, pending
Kevin's input: a Jan-1 opening balance on 2640 with no narration
(unknown whether it's pure Corporate Income Tax or a bundled figure
across several liability types); two generic "Expenses paid by cash[...]"
6300 entries with no category signal in their narration; and a real
data-quality anomaly — one 6300 journal entry has BOTH its lines coded
to account 6300 (one mislabeled "Cash on Hand" despite the 6300 code),
meaning no actual cash/bank account is touched by that transaction at
all. Confirmed reclassifying an account code has zero effect on Total
Assets or Net Profit (neither KPI reads journal account codes for
these — Net Profit sums `iacm_expenses.amount` directly regardless of
category; Total Assets only sums the 3xxx asset codes).

Separately worth a real look sometime, not resolved here: PAYE/CBHI/
Pension/Maternity *settlements* (paying down an already-accrued
liability) are balance-sheet transactions, not new P&L expenses — if
the underlying salary cost was already recognized when the liability
first accrued, recording the settlement through `iacm_expenses` could
double-count it in Net Profit.

**Update, same night**: the two confirmed-clear entries (maternity
3,000, PAYE 114,000) were reclassified — journal lines moved from 2640
to 2550/2540 respectively, `iacm_expenses.category` updated to match.
Re-verified with real balances, not just row counts: 2640 correctly
returns to 0 (no longer holding amounts that were never really its),
2550 correctly nets to exactly 0 (the real June maternity liability now
shown as fully paid, using its real 2026-06-30 opening balance of
3,000), 2540 correctly shows a real remaining 50,000 (opening 164,000
minus this 114,000 settlement) — combined total across all three
accounts unchanged at 50,000 before and after, confirming a pure
reclassification with zero effect on Total Assets or Net Profit.

**Item C fixed** (2026-08-19, journal entry `d574bf7c-05b1-46ed-9d46-
efc2c18a9151`, dated 2026-04-13, narration "Miscellaneous Expenses"):
this was a confirmed data-entry error, not a categorization judgment
call — one line correctly coded `6300` "Miscellaneous Expenses" (credit
30,000), the other line already correctly *named* "Cash on Hand" but
*coded* `6300` too instead of the real cash account. Corrected line
`f8047833-2b26-4706-ba4f-7a9e09aa63e9`'s `account_code` to `3010`
(Cash on Hand) — amount and name untouched, entry still balances at
30,000/30,000. Confirmed zero effect on any live balance: this entry
predates the 2026-06-30 ledger cutoff, so it was already excluded from
every `getAccountBalance()` query before the fix and remains excluded
after — Total Assets and Net Profit were never reading it either way.

**Items A, B, and D remain genuinely unresolvable from data alone** —
flagged here for a real conversation with Devotha, not guessed:

- **Item A** — journal entry `337768c3-3e40-40fc-a462-dc3d5d30a232`,
  dated 2026-01-01, `entry_type='opening'`, account `2640` Tax Payable,
  204,165 credit. **Narration is completely empty.** No
  `iacm_opening_balances` row exists for 2640 either — this figure
  lives only as this one journal line. Unknown whether it's 100%
  genuine Corporate Income Tax carried from the prior year, or a
  bundled starting balance across several liability types (PAYE/CBHI/
  Pension/Maternity/WHT/Corporate Tax) collapsed into one number during
  the historical backfill. If bundled, it should be split across
  several real opening-balance rows, not left as one lump 2640 figure.

  **Update, 2026-08-19, building the Shareholder Loan feature**: this
  same journal entry (`337768c3-...`) also carries a line for account
  `2030` Shareholders' Loan — Long Term, 2,750,000 credit — same empty
  narration, same root issue. A second, separate real entry
  (`2919eaf2-78a3-4f90-a623-3c8f60fef45f`, dated 2026-05-18, narration
  **"Ordinary Share Capital" — mislabeled, since it actually posts to
  2030, not 1010**) debits 2030 by 1,250,000. Net: 2,750,000 −
  1,250,000 = **1,500,000** — the real figure Kevin has stated
  consistently all session. But `iacm_opening_balances` for 2030 was
  sitting at `0/0`, not 1,500,000 — the same reconciliation gap as
  2640, just never noticed until a real feature needed to read it.
  **Fixed**: `iacm_opening_balances` for 2030 updated to
  `credit_balance=1,500,000, debit_balance=0`, re-verified fresh —
  `getAccountBalance('2030', today)` now correctly returns 1,500,000
  (was 0). The AMOUNT is confirmed correct, by Kevin's direct
  knowledge and by the real net of these two entries agreeing exactly.
  What's still not clean: the audit trail behind it — the empty-
  narration Jan-1 lump sum (shared with Item A) and the mislabeled
  May-18 "Ordinary Share Capital" entry that actually moved 2030, not
  1010. Real conversation with Devotha still needed for that part.

- **Item B** — journal entry `9b3b1991-80fa-4d17-96c0-02bc96748ec4`,
  dated 2026-03-31, account `6300` Miscellaneous Expenses, 199,500
  debit. Narration exactly **"Expenses paid by cash"** — no further
  detail. Could be communication, stationery, transport, petty cash, or
  genuine miscellaneous; nothing in the record narrows it down.

- **Item D** — journal entry `3c9075dd-37c2-467b-b138-bc21f0ef6288`,
  dated 2026-06-30, account `6300` Miscellaneous Expenses, 191,500
  debit. Narration exactly **"Expenses paid by cash from April to June
  2026"** — a full quarter of unspecified cash expenses lumped into one
  figure, same problem as Item B, three months wide.

Communication/stationery/transport/advertising/legal/maintenance/
petty_cash categories remain a separate, still-open gap: several map
to real account codes (6220–6290) that mean something entirely
different per the Accounts sheet (e.g. `communication` → 6220, which
is really "Utilities"; real Communication Expenses is 6270). Out of
scope for this fix.

## Real bug: Inquiries sidebar badge never cleared (2026-08-19)

Kevin noticed the Inquiries badge stayed stuck at "3" no matter how
many times he opened the page — unlike the Applications "Pending"
count, which correctly drops when an application's `status` actually
changes (approve/reject). Traced precisely: the badge
(`app/admin/layout.tsx`) counts `contact_messages` where
`is_read=false` — a real, correctly-used field (`inquiries/page.tsx`
already reads it for unread styling). But grepping every reference to
`contact_messages` in the app found only three: the public contact
form inserts, the layout reads the count, and the inquiries page reads
and displays. **No `.update()` on `is_read` existed anywhere.** Opening
the page was a pure read; nothing ever wrote the field back. Confirmed
against real data: all 3 real messages (dated 2026-06-25, nearly two
months old) were still `is_read=false` despite being viewed repeatedly
over the course of this whole session.

**Fix**: `inquiries/page.tsx` now bulk-updates every currently-unread
message to `is_read=true` right after fetching them, using the
already-in-scope admin (service-role) client. The page's own render
still reflects what was unread *on load* (computed before the update
runs) — correct, not a race bug — while `layout.tsx` computes its
badge independently on every request, so the badge itself only
reflects the cleared state on the *next* load, not instantly
mid-navigation. Tested end-to-end against the real 3 messages, not
synthetic data: confirmed all 3 flip to `is_read=true`, the badge
query drops from 3 to 0, a second simulated visit is a clean no-op,
and every other field (`replied_at`, message content) stayed
untouched.

## Real bug: cash withdrawal recorded as an expense (KUBWIMANA Devotha, 9-Jul-26, 50,000)

Kevin's real historical practice for moving cash from the bank into
physical petty cash: Debit 3010 (Cash on Hand) / Credit 3020 (Bank
Accounts) — a pure internal asset transfer, zero effect on
expenses/profit. A real transaction (entry `6a533180-4213-4b37-af9b-
341b3fd124e3`, ref was `expense-335d5087-...`) instead posted through
Record Expense's `petty_cash` category — Debit 6290 / Credit 3020.
6290 is a real account code, but per Kevin's actual chart it's
**"Income tax expense"**, not petty cash at all — the same class of
6220–6290 block-scrambling already documented elsewhere in this file,
just now caught on a real live transaction, not just in a code audit.

**Fixed**: journal line reclassified 6290 → 3010 (amount and the other
leg untouched, entry still balances), the `iacm_expenses` row deleted
outright (this was never a real expense), reference updated off the
now-deleted expense id. Re-verified: Net Profit increased by exactly
50,000 (the wrongly-subtracted amount) — expected. **Total Assets also
increased by exactly 50,000 — this was NOT expected going in**, but is
correct: a *correctly*-recorded cash withdrawal is genuinely net-zero
on Total Assets (asset-to-asset), but comparing the wrong old state to
the fixed new state isn't that comparison. The old 6290 debit was
never counted in Total Assets at all (not an asset code), so the real
cash that moved into Devotha's hands was invisible on the asset side
this whole time — fixing it correctly adds the missing 3010 side,
revealing Total Assets was quietly understated by this exact bug, not
just Net Profit.

**Root cause, permanent fix**: `petty_cash` removed entirely from
Record Expense (`expenses/route.ts` and its form) — the server now
explicitly rejects it rather than silently falling back to `other`
(6300), which would just trade one wrong account for another; a stale
client sending it gets a real error, not a quiet miscode. New
dedicated feature instead: `/admin/iacm/cash-transfer/new` — Debit
3010/Credit 3020 (withdrawal) or the reverse (deposit), posted via the
same `postJournalEntry()` as everything else, zero expense-account
involvement, deliberately a separate page from Record Expense so this
specific mistake can't recur.

**Full audit of every other real transaction recorded live tonight**
(`created_by = 'iradukunda cyusa kevin'`, excluding both historical
backfill batches): 21 entries checked individually against Kevin's
real chart — loan disbursements (3030/3110/3020/7020/2530), payments
(3020/3110/7010/3030), the new Shareholder Loan feature's first real
use (3020/2030, correct), and every bank-charge/PAYE/CBHI/pension/
maternity expense. **This 6290 entry was the only error found** — the
other 20 all used the correct real account code.

## Real bug: payment allocation order was interest-first with fee gated behind full payoff (ABAYISENGA jean claude, INEMA-2026-0006)

Kevin flagged a real discrepancy: ABAYISENGA's real first payment
(73,600 RWF, ~2 months after a 500,000 disbursement) posted as 100%
interest — Debit Bank 73,600 / Credit Interest Income 73,600 — with
zero fee/VAT clearing and zero principal. Kevin's own real historical
record showed it should have split fee 23,600 / interest 25,000 /
principal 25,000.

**Investigated, not assumed.** `monthsElapsed()` was confirmed correct
(`monthsElapsed('2026-05-22','2026-07-09')` genuinely returns 1) — not
a repeat of the Habineza `last_payment_date` bug or the Nzungize
fee-already-cleared bug, both already fixed and unaffected here. The
real cause was the allocation *order* itself in `payments/route.ts`:
interest was deducted first (uncapped by anything but `interestOwed`),
and fee/VAT was only ever charged when `isPayoff` was true — so a
partial first payment like Abayisenga's never touched the fee at all,
and every RWF went to interest first regardless of how small the
payment was.

**Verified against real historical evidence**, not just this one
payment — read every real installment-payment example in Kevin's
actual historical journal (`inema journal updated as per 2026 (1)
until july (1).xlsx`, 576 real Journal rows). Alice's real first
payment (loan disbursed 1,000,000, monthly interest 50,000) was only
50,000 total, yet her real recorded split was `fee_portion=47,200` /
`interest_portion=2,800` — genuinely short of a full month's interest.
Under interest-first, that 50,000 would have been entirely consumed by
interest (owed ≥ 50,000), leaving nothing for fee — the only way to
get `interest_portion=2,800` is if fee took priority first. Indere's
and Aline's real first payments show the identical shape, with no
contradicting example found anywhere in the file. INEMA's real,
consistently-observed practice: fee/VAT clears first, unconditionally,
on every payment (not just a full payoff) until the loan's fee/VAT
receivable is exhausted; interest next; principal last.

**Process note**: Kevin's own first fix instruction described the
corrected order backwards ("interest-first, fee-second"), directly
contradicting the Alice evidence just gathered. Flagged the
contradiction with Alice's exact numbers instead of building it as
stated; Kevin confirmed the description was backwards and gave the
corrected fee-first spec.

**Fixed**, `payments/route.ts` and `payments/new/page.tsx`: allocation
is now fee/VAT first (capped at `feeRemaining`, i.e. this loan's real
fee+VAT owed minus `fee_portion` already cleared by prior real
payments — the same netting the Nzungize fix already established, now
applied as the first step instead of only under `isPayoff`), then
interest (capped at `interestOwed`), then whatever remains reduces
principal (capped at `outstanding`). The `isPayoff` gate is gone
entirely — fee eligibility is decided purely by whether this loan's
fee/VAT receivable is still outstanding, identically on every payment.
The "can't overpay" cap (`maxOwed = outstanding + interestOwed +
feeRemaining`) is unchanged — order-independent by construction.
Journal line order in the auto-post was also reordered (3030 fee credit
before 7010 interest credit before 3110 principal credit) to match,
though this has no effect on the entry's own balance.

**Tested**: 5 disposable scenarios on a throwaway client/loan
(disbursed 1,000,000, monthly interest 50,000, fee+VAT owed 47,200) —
(a) 20,000 (less than fee owed) → fee 20,000/interest 0/principal 0;
(b) 47,200 (exactly the fee) → fee 47,200/interest 0/principal 0;
(c) 77,200 (fee + partial interest) → fee 47,200/interest 30,000/
principal 0; (d) 197,200 (fee + full interest + some principal) → fee
47,200/interest 50,000/principal 100,000, new balance 900,000; (e)
1,097,200 (full payoff) → fee 47,200/interest 50,000/principal
1,000,000, new balance 0, status completed. All 5 matched expected
splits exactly, every journal entry balanced (debit total = credit
total), `balance_outstanding`/`status` updated correctly in each case.
Cleanup deleted all test payments, journal lines, journal entries,
loans, and the client; re-query confirmed zero rows remaining.

**Not yet done**: Abayisenga's actual real payment record still shows
the old wrong 100%-interest split — this fix corrects the algorithm
going forward but does not retroactively correct that specific
historical transaction. Follow-up, analogous to the Habineza/Nzungize/
Bahati reversal-and-redo pattern, not yet requested.

**Update, same night**: done. Abayisenga's payment was reversed and
re-entered with the fixed algorithm (fee 23,600/interest 25,000/
principal 25,000, no override). A second real issue surfaced on the
redo — a manual "2 months" override on the interest_months field,
based on Kevin's own loose "roughly 2 months after disbursement"
description rather than the real calendar math (1 month, 18 days) —
confirmed via a direct re-check of `monthsElapsed()` against the real
dates, reversed a second time, and re-entered correctly with no
override. See git history for both reversals; no separate write-up
here since neither was a code bug, just confirmation the already-fixed
code was working exactly as designed both times.

## Reverse Transaction feature — generalizing tonight's manual reversal recipe into an audited, in-app action

By the end of tonight's session, the same by-hand recipe had been used
to reverse four real mistaken entries (Habineza, and Abayisenga twice)
by connecting directly to the database with a temporary service-role
key: delete journal lines, delete the journal entry, delete the domain
row, recompute the loan. Correct every time, but slow, requiring a
live DB session each time, and leaving no permanent record of what was
undone or why beyond this file being updated after the fact.

**Built**: a general Reverse Transaction feature, open to any
authenticated admin (Kevin's explicit decision — no new role tier;
`profiles.role` only ever had a flat admin/client/loan_officer split
anyway). Design was planned and approved before any code was written
(see the design questions below); implementation followed exactly.

**Per-type reversal logic** (`REVERSAL_HANDLERS` + `reverseTransaction()`
in `lib/ledger.ts`): every type deletes the journal entry + lines;
domain data varies —
- **Payment**: delete the `iacm_payments` row, recompute the loan
  exactly like every manual reversal tonight (`balance_outstanding`,
  `principal_repaid`, `installments_paid/outstanding`, `status`, and
  `last_payment_date` set to the most recent *remaining* payment's
  date, or null if none remain).
- **Loan disbursement**: delete the `iacm_loans` row. Blocked entirely
  while any real payments exist against it — reversing those
  individually first keeps every undo tied to its own single reason,
  rather than one click silently cascading several distinct financial
  corrections. `iacm_clients` is never touched (may be shared/pre-existing).
- **Expense**: delete the `iacm_expenses` row.
- **Shareholder loan / cash transfer**: journal-only, no domain row —
  matches how those two features were already built (no dedicated table).

**Audit table**: new `iacm_reversals` (DDL in `supabase.sql`, created
directly in the Supabase dashboard same as every other IACM table) —
`entry_type`, `original_journal_entry_id`/`original_reference`/
`original_entry_date`/`original_created_by` (pointers/copies, since the
original row is deleted in the same operation), `domain_table`/
`domain_row_id`, a `jsonb` `snapshot` of the full before-state (journal
entry + lines, domain row, and for payments the loan's pre-recompute
state — so a mistaken reversal is still recoverable by reading this
table), a required `reason`, and `reversed_by_user_id` (real FK to
`profiles`, unlike the plain-text-only `created_by` convention
elsewhere in this ledger) plus `reversed_by_name`.

**Atomicity, a deliberate departure from the ideal**: the audit row is
written FIRST, before any deletes — not after, and not inside a real
Postgres transaction (this project's tables aren't set up with an RPC
function for that). If a later step fails partway, a leftover audit
row describing an incomplete reversal is a far safer failure mode than
a silent, unaudited deletion of real financial data. Every error path
after the audit insert says explicitly what did and didn't complete.

**UI**: `app/admin/iacm/journal/page.tsx` — the only cross-transaction-
type list in the app, and for payments/shareholder-loan/cash-transfer
entries the *only* list at all (no dedicated payments list page
exists). Now shows `entry_type`/`created_by` per row (both were already
fetched, never rendered), a Reverse button (only for the 5 reversible
types) opening a confirm modal with a required reason field, and a new
"Reversal History" section listing every `iacm_reversals` row.

**Time limit**: no calendar expiry — real mistakes surface late, which
is the whole reason this feature exists. Instead, a targeted guard tied
to a real, confirmed asymmetry in `lib/ledger.ts`: `getAccountBalance()`
ignores journal entries dated on/before `LEDGER_CUTOFF_DATE`
(2026-06-30), so reversing one is a no-op for every balance-sheet
screen — but `getAccountMovementSum()` (income-statement/BNR flows) has
no such guard, so the same reversal WOULD change historical
income-statement figures. Reversing a pre-cutoff entry requires an
explicit checkbox acknowledging this, in addition to the reason field,
rather than being blocked outright.

**Tested**: full disposable-data suite — client → loan disbursement →
payment → expense → shareholder-loan deposit → cash-transfer
withdrawal, reversing each. Confirmed: Net Profit moved by exactly the
right amount at every creation step and returned to its exact prior
value after every reversal (verified against the real live business
data, not a mock); the loan-disbursement block correctly refused while
a payment existed and succeeded once it was reversed first; the loan's
full state (`balance_outstanding`, `principal_repaid`,
`installments_paid/outstanding`, `last_payment_date`, `status`) matched
exactly after a payment reversal; a simulated already-reversed state was
correctly rejected without touching the live journal entry; the
pre-cutoff acknowledgment gate correctly blocked without the flag and
succeeded with it; every reversal produced a complete, correct
`iacm_reversals` audit row. 30 checks, 0 failures. Cleanup confirmed
zero residue across all 7 affected tables and Net Profit back to the
exact pre-test baseline.

## Full Record Expense re-check against the real chart, plus a confirmed Net Profit gap

Kevin asked for a complete, final check of every expense-relevant
account against his real 72-account chart — not just the PAYE/CBHI/
Pension/Maternity/WHT fix from 2026-08-19. Direct comparison, one
account at a time, found the 6220–6270 block was genuinely scrambled
(previously flagged as a known, out-of-scope gap — now resolved):

| Code | Real name | Was | Now |
|---|---|---|---|
| 6010 | Interest on Borrowings | missing | added (`interest_on_borrowings`) |
| 6120 | Staff Benefits & Welfare | missing | added (`staff_benefits`) |
| 6210 | Office Rent | `rent`, labeled "Rent & Utilities" | relabeled "Office Rent" (code unchanged) |
| 6220 | Utilities | code squatted by `communication` | added as its own category (`utilities`) |
| 6230 | IT & Software Expenses | code squatted by `stationery` | added (`it_software`) |
| 6240 | Depreciation & Amortization | code squatted by `transport`; `depreciation` category posted to 6310 instead | `transport` moved off; `depreciation` recoded to 6240 |
| 6250 | Legal & Professional Fees | code squatted by `advertising` | `legal` moved here (was wrongly on 6260) |
| 6260 | Travel & Transport | code squatted by `legal` | `transport` moved here (was wrongly on 6240) |
| 6270 | Communication Expenses | code squatted by `maintenance` | `communication` moved here (was wrongly on 6220) |
| 6290 | Income tax expense | missing (was `petty_cash`'s wrong target, removed 2026-08-19) | added (`income_tax_expense`), distinct from 2640 Tax Payable |

`advertising`, `stationery`, and `maintenance` are **removed** — none
had a match anywhere in Kevin's real chart, and none had any real
historical usage (checked live data before removing: zero rows in any
of the three). They were squatting on the correct codes for
communication/legal/transport, which do have real matches, so removing
them was what unblocked the fix. If any of the three turn out to be
real, distinct accounts elsewhere in the full 72, they can be
re-added with their real code once confirmed. Same reasoning for
recoding `depreciation` from 6310 (not a real account anywhere in the
given chart) to 6240 — zero real usage, so safe to correct outright
rather than leave wrong.

**Separately confirmed, materially wrong on live data**: both Net
Profit calculations (`app/admin/page.tsx`, `app/admin/income/page.tsx`)
summed every `iacm_expenses` row unconditionally — no exclusion for
the liability categories (paye/cbhi/pension/maternity/wht/tax), which
settle a real 2xxx payable, not a 6xxx operating cost. Checked real
data: 4 real post-cutoff liability payments already existed (maternity
3,000, PAYE 114,000, pension 70,000, CBHI 1,773 — all 2026-07-08),
totaling 188,773 RWF wrongly subtracted from the live-reported Net
Profit. Fixed via a new shared `LIABILITY_EXPENSE_CATEGORIES` export in
`lib/net-profit.ts`, applied to both pages' Net Profit calculation only
— deliberately NOT applied to the "Total Expenses" KPI card or the
category-breakdown chart on the Income page, which track total real
cash outflow regardless of account type, a different, legitimate
purpose. Verified against real live data: Net Profit moved by exactly
+188,773 (6,956,191.4 → 7,144,964.4) after the fix, matching the exact
amount of the 4 real liability payments.

## VAT Control Account and the rest of the 2500-series payables

Same night, immediate follow-up: Kevin confirmed he needs to record a
real VAT payment and found 2530 "VAT Control Account" wasn't
selectable on Record Expense at all — same class of gap as the
PAYE/CBHI/Pension/Maternity fix above, just missed at the time. Checked
the rest of the 2500-series liability payables Kevin named: 2590 WHT
already present and correct; 2600 Social Security Payables and 2620
Other Statutory Payables both genuinely missing too. 2640 Tax Payable
re-confirmed still scoped only to Corporate Income Tax, not conflated
with any of these.

**Fixed**: added `vat` (2530), `social_security` (2600), and
`other_statutory` (2620) to `EXPENSE_ACCOUNTS`
(`app/api/admin/iacm/expenses/route.ts`), the Record Expense dropdown,
and `CATEGORY_LABELS` (`app/admin/income/page.tsx`) — same
liability-settlement pattern as PAYE/CBHI/Pension/Maternity. All three
added to `LIABILITY_EXPENSE_CATEGORIES` (`lib/net-profit.ts`) so they
follow the exact same Net Profit exclusion.

**Tested**: confirmed zero real expense rows used any of the three new
categories before adding them (no migration risk). Recorded a real
disposable 60,000 VAT payment: the real VAT Control Account balance
(already a genuine nonzero 77,712 from disbursement VAT bookings)
correctly moved to 17,712 — a clean 60,000 decrease — while Net Profit
stayed exactly unchanged (6,407,464.4 before and after). Cleanup
confirmed both reverted exactly and the test rows were gone.

## Out-of-order date entry — confirmed safe, no gap

Kevin asked: if a transaction dated July 24 is recorded, then a
different one dated July 19 is entered afterward, does the app still
display and calculate everything correctly, or does insertion order
leak into anything? Tested directly against real disposable data
(payment dated July 24 inserted first, payment dated July 19 inserted
second, on the same throwaway loan): the Journal page's query
(`order('entry_date', desc).order('created_at', desc)`) correctly
showed July 24 before July 19 despite the reverse insertion order, and
the "most recent payment" lookup `payments/route.ts` uses for
`monthsElapsed()` (`order('payment_date', desc)`) correctly identified
July 24 as the more recent real date, never falling back to insertion
order or `created_at`. No code path anywhere uses `created_at` for
either sorting or the months calculation. Cleanup confirmed exact
reversion. No gap, no change needed.

## Duplicate-transaction warning — New Loan / Record Payment / Record Expense

**Built**, per Kevin's request for a safety net against accidental
double-entry: before this, none of the three forms had any check for
an existing, suspiciously identical record — a same-client/same-amount/
same-date resubmission (e.g. a slow request retried, or a genuine
double-click) saved silently every time.

**Design**: a server-side check inside each POST route (not
client-side, so a stale cached page can't bypass it) — exact match, same
day, on: client + disbursed_amount + disbursement_date (New Loan);
loan + total_amount + payment_date (Record Payment); category + amount
+ expense_date (Record Expense). A match returns
`{ possible_duplicate: true, existing }` instead of inserting; the
frontend shows a modal (`app/admin/iacm/DuplicateWarningModal.tsx`,
shared across all three forms) naming the existing record and asking
"Is this a different, genuine transaction?" — "Cancel" leaves the form
as-is, "Yes, record it anyway" resubmits with `confirmed_duplicate:
true`, which skips the check entirely. A soft warning, not a hard
block — a real second identical transaction (two equal bank charges in
a month, two equal installments the same day) still goes through with
one extra click.

**Self-caught bug while wiring the frontend**: all three submit buttons
were `onClick={submit}`, which passes the click `SyntheticEvent` as
`submit`'s first argument. Once `submit` took a `confirmedDuplicate`
boolean parameter, that event object would have been truthy and every
very first submission would have silently skipped its own duplicate
check. Fixed to `onClick={() => submit()}` before this ever shipped.

**Tested**: 12 real checks across all three forms on disposable data —
for each, confirmed the duplicate check correctly finds an identical
existing record with the right summary, that not confirming leaves
exactly one row saved (nothing extra), that confirming creates a
genuine second real row, and that a non-duplicate case (same category/
loan/client but a different amount) triggers no warning at all and
saves directly. All 12 passed. Cleanup confirmed zero residue across
expenses, payments, loans, and clients.

## Real miscoding: rent recorded as "Salaries & Wages" (expense-4157d291-de7a-4301-819f-60e8b2042042)

A real rent payment (500,000, dated 2026-07-21, "paid rent for july and
august") posted as Dr 6110 Salaries & Wages / Cr 3020 Bank Accounts —
completely wrong category. Traced to a real, confirmed root cause, not
a one-off mis-click: Record Expense's category dropdown defaulted to
`'personnel'` in the form's initial state, not a neutral placeholder.
Anyone who fills in date/description/amount without deliberately
touching the category dropdown silently submits as "Salaries & Wages"
regardless of what the expense actually is — the same class of
invisible-default issue as the interest-months override fixed earlier
for Bahati Eric.

**Fixed**: `app/admin/iacm/expenses/new/page.tsx` now defaults
`category` to `''`, shows a disabled `-- Select category --` as the
first option, and blocks submission client-side until a real category
is chosen (the server already rejected an empty category via its
existing `!category` check, now actually reachable).

Also confirmed, separately: Kevin's real historical practice for this
exact kind of transaction (rent covering one already-elapsed month and
one prepaid in advance) is a real 4-line split — Debit Prepaid Expenses
(future portion), Debit Office Rent (current portion), Debit VAT
Control, Credit Bank — and **neither existing feature could express
it**. Record Expense is a strict one-category-to-one-account map (2
lines only). The manual "New Journal Entry" feature deliberately
excludes every 6xxx/7xxx account (`lib/ledger.ts`'s `CHART_OF_ACCOUNTS`
comment — income-statement flows must come from `iacm_expenses`/
`iacm_payments` only, never raw journal lines, or Net Profit gets a
second, inconsistent source of truth), so it can't post the Office Rent
line either.

**Built**: a new "Split Expense" feature
(`app/api/admin/iacm/split-expense/route.ts` +
`app/admin/iacm/split-expense/new/page.tsx`), named generally since the
same prepaid/current/VAT shape applies to any prepaid cost, not just
rent. Writes a real `iacm_expenses` row for the current-period portion
only (`category: 'rent'`, correctly flowing into Net Profit), then
posts the full real 4-line journal split directly. Reuses the
`expense-<id>` reference convention, so it integrates for free with the
Reverse Transaction feature and the Journal page — no changes needed
either place.

**Tested**: real disposable scenario matching the actual transaction —
500,000 total split into 211,865 current-period / 211,864 prepaid /
76,271 VAT. All 15 checks passed: 4 journal lines, correctly balanced
(debit total = credit total = 500,000); each line exactly right;
`iacm_expenses` shows only 211,865 under `rent`, not 500,000 or
211,864; Net Profit moved by exactly 211,865 (confirmed it did NOT move
by the full 500,000 or by the prepaid 211,864); cleanup confirmed exact
reversion.

**Not yet done**: the real miscoded transaction
(`expense-4157d291-de7a-4301-819f-60e8b2042042`) is left untouched —
Kevin's explicit instruction was to leave it as-is until the new
feature existed, then reverse it via the Reverse Transaction feature
and re-record it correctly through Split Expense. Follow-up, not yet
requested.

## Split Expense "This is rent" quick mode

Same night, follow-up: entering a split rent payment by hand (working
out current/prepaid/VAT portions manually) was more friction than
needed for the common case. Added a "This is Rent (Quick Mode)" toggle
to the Split Expense form — enter just the total paid and the number of
months it covers, and the three portions are derived automatically.
Manual entry mode is unchanged and still fully available.

**Formula** (`computeRentSplit()` in
`app/admin/iacm/split-expense/new/page.tsx`): VAT is rounded FIRST
(`Math.round(total - total / 1.18)`), then the pre-VAT total is taken
as the exact remainder (`total - vat`, not the raw division kept as a
float), then the monthly rent is rounded and the leftover goes to
prepaid. This specific order is what makes current+prepaid+vat always
reconcile to exactly the real total paid, and is also what reproduces
Kevin's real recorded transaction exactly — rounding the raw
total/1.18/months figure directly (the more "obvious" order) gives
211,864/211,865, the reverse of the real values.

**Tested**: verified the formula reproduces Kevin's real transaction
exactly (500,000 total, 2 months → current 211,865 / prepaid 211,864 /
VAT 76,271, matching the real recorded values precisely), then ran both
that scenario and a second one (300,000 / 3 months → 84,746 / 169,491 /
45,763) against real disposable data. All 8 checks passed: journal
balances exactly in both cases, Net Profit moves by exactly the
current-period amount in both cases, and cleanup confirmed exact
reversion.

**Documentation-only, no architecture change**: flagged (code comment
in `app/api/admin/iacm/split-expense/route.ts` + new
`docs/saas-readiness-notes.md`) that this feature assumes single-tenant
data like every other IACM route — no tenant scoping exists anywhere in
this schema. Points back to `docs/tenant-isolation-inventory.md` for
the full analysis; `saas-readiness-notes.md` is a lightweight running
log for new features going forward, not a re-derivation of that
inventory.

## Record Salary — the real two-step accrual/payment process, missing entirely from Record Expense

Same night, follow-up to the rent/Split Expense finding: Kevin's real
historical practice for salary is a genuine two-step process (accrue
gross + statutory deductions when earned, pay the net separately when
actually paid out), confirmed by the historical backfill's own journal
entries — 6 real matching pairs, Jan–Jun 2026, each a "Salary and wages
for X" accrual (Dr 6110 gross / Cr 2540/2550/2560/2570 deductions / Cr
2580 net payable) followed by a separate "Payment of Salary and wages
for X" (Dr 2580 / Cr 3020, net amount only).

**Confirmed broken, same structural class as rent**: Record Expense's
`personnel` category is a strict one-category-to-one-account map (2
lines only) — it would post the full gross straight to 6110 with zero
PAYE/Maternity/Pension/CBHI/net-payable breakdown, understating what's
actually owed to RRA/RSSB and never creating those liabilities at all.
The manual Journal Entry feature can't help either (excludes 6xxx by
design, same reason it couldn't do rent).

**Investigated whether real damage had already happened before
concluding anything**: `personnel` has **never actually been used**
live — zero real `iacm_expenses` rows with that category, ever. The 4
real statutory payments dated 2026-07-08 that superficially looked like
they might be evidence of this gap (114,000 PAYE / 3,000 Maternity /
70,000 Pension / 1,773 CBHI — matching Kevin's own example numbers
exactly) turned out to be **correct**: checked `iacm_opening_balances`
and found 2540/2550/2560/2570 carrying real reconciled payable balances
as of the ledger cutoff, and each July 8 transaction is a clean `Dr
<liability> / Cr Bank` clearing exactly that owed amount — a legitimate
Step 2 payment against an already-established real liability, not a
new expense. So the gap is a real, live structural risk waiting to
trigger the first time a new payroll period needs recording — not an
already-realized miscoding requiring reversal.

**Built**: "Record Salary" (`app/admin/iacm/salary/new/page.tsx`), two
separate real actions matching the actual historical practice exactly,
not one combined form:
- **Step 1 — Accrual** (`app/api/admin/iacm/salary/accrual/route.ts`):
  real `iacm_expenses` row for the full gross (`category: 'personnel'`,
  so Net Profit reflects the true cost), plus a direct 6-line journal
  entry — Dr 6110 (gross) / Cr 2540 (PAYE) / Cr 2550 (Maternity) / Cr
  2560 (Pension) / Cr 2570 (CBHI) / Cr 2580 (net payable, computed as
  gross minus all four deductions). No cash/bank line, matching the
  real historical accrual entries exactly.
- **Step 2 — Payment** (`app/api/admin/iacm/salary/payment/route.ts`):
  journal-only, no domain row (same architecture as Shareholder
  Loan/Cash Transfer) — Dr 2580 Salary Payables / Cr Bank or Cash, for
  the net amount. New `entry_type: 'salary_payment'`, added to
  `REVERSAL_HANDLERS` in `lib/ledger.ts` so it's reversible via the
  Reverse Transaction feature like everything else, and to the Journal
  page's type labels.

**Tested**: real disposable scenario matching Kevin's exact historical
numbers (gross 541,501 / PAYE 114,000 / Maternity 3,000 / Pension
70,000 / CBHI 1,773 / net payable 352,728). All 18 checks passed: net
payable computed correctly; Step 1's 6 journal lines each exactly
right and balanced (541,501 = 541,501); `iacm_expenses` shows the full
gross under `personnel`; Net Profit moved by exactly the full gross
after Step 1; Step 2's 2 journal lines exactly right and balanced
(352,728 = 352,728); **Net Profit did NOT move again after Step 2** —
confirmed it stayed at the post-accrual value, not gross+net; cleanup
confirmed exact reversion of both journal entries and the expense row,
and Net Profit back to the exact pre-test baseline.

## Auto-derived narrations for Split Expense (rent) and Record Salary

Same night, follow-up to both features above: their journal lines
either needed Kevin to type which months were covered by hand (Split
Expense) or used a generic, non-specific narration that didn't match
real historical practice at all (Record Salary).

**Split Expense**: added `buildRentNarrations()` (mirrored identically
in the route and the live preview) deriving real month names directly
from `expense_date` + `months_covered` — no new manual input. The
current-period line always names just the one current month; the
prepaid line lists every remaining covered month (correctly scales
past 2 months — tested to 3); the VAT and cash/bank lines both
describe the full span. Manual mode (no month-count input) falls back
to non-month-specific language for the prepaid/VAT/cash lines, since
there's nothing to derive it from. New shared `monthOffset()`/
`joinMonthLabels()` helpers in `lib/calculator.ts` do the actual date
arithmetic and natural-language joining ("July 2026" / "July & August
2026" / "July, August & September 2026"), reused by both features
below to avoid drift between two independent implementations.

**Record Salary**: checked what narration the feature actually
generated (built earlier the same night) — a generic "Salary accrual —
[employee]" for the accrual and "Salary payment" for the payment,
neither matching real historical practice at all. Checked the real
historical journal entries directly: all 6 real Jan–Jun 2026 accrual
entries read "Salary and wages for [Month] [Year]", no exceptions; 5
of 6 real payment entries read "Payment of Salary and wages for
[Month] [Year]" (May's "Payment of salary" is a one-off inconsistency
in that specific real entry, not the intended convention). Both
routes now derive the real month directly from the entered date —
`expense_date` for the accrual, `payment_date` for the payment — with
no extra input required.

**Tested**: 3 real Split Expense scenarios (July 21/500,000/2 months —
Kevin's exact real case; July 21/600,000/3 months; July 21/250,000/1
month) plus the Record Salary case (gross 541,501, dated May 28). All
24 checks passed: every narration matched exactly (including the
3-month case correctly listing both prepaid months, and the 1-month
case producing no prepaid line at all rather than an empty/malformed
one), every journal balanced exactly, both salary narrations included
"May 2026" as expected. Cleanup confirmed zero residue across all
scenarios.

## Loan Restructuring / Rollover

New feature, built from a real scenario: a client owed 2,500,000 +
interest, paid 1,000,000, defaulted on the rest — INEMA writes a new
contract for the remaining 1,500,000 as a fresh loan. No existing
feature could represent this: it's not a payment (no cash), not a
normal disbursement (no new money), and needed two loan records
updated together with a real, auditable link between them.

**Real accounting, confirmed with Kevin before building**: the old
loan is marked `status: 'restructured'` (not `'completed'` — the debt
was transferred, not paid) with `balance_outstanding` set to 0. The new
loan is created with the remaining principal as its `disbursed_amount`,
linked back via a new `restructured_from_loan_id` column. The journal
has no cash line for the principal transfer — `Cr 3110 (old loan) / Dr
3110 (new loan)`, both for the same amount, net to zero on the shared
GL account since 3110 isn't tracked per-loan in the ledger (the real
per-loan state lives in `iacm_loans.balance_outstanding`). **Kevin
confirmed a restructured contract DOES charge a fresh 4%+18%VAT
disbursement fee** on the new principal, same as any normal new loan —
this is the one real, non-zero effect on any account balance (`Dr 3030
/ Cr 7020 / Cr 2530`), a genuine cost of the new contract even though
no principal cash moved. Flagged as an open question rather than
guessed, since the two options had materially different real
consequences (fee vs. no fee changes whether Net Profit/Total Assets
move at all).

**Real schema check before writing any code**: confirmed the *actual
live* `iacm_loans.status` column has no CHECK constraint blocking
`'restructured'` at all — `supabase.sql`'s tracked DDL
(`check (status in ('active', 'completed'))`) is stale, consistent with
this table's already-known drift from its real dashboard-managed
schema. Only `restructured_from_loan_id` needed a real migration, which
Kevin ran directly via the SQL Editor.

**Reversal**: doesn't fit any existing `REVERSAL_HANDLERS` shape (it
touches two loan records, not one), so `reverseTransaction()`
(`lib/ledger.ts`) got a dedicated `loan_restructuring` branch — restores
the old loan's `status`/`balance_outstanding` and deletes the new loan.
The old loan's pre-restructuring balance is recovered from the new
loan's own `disbursed_amount` (always exactly equal, since a
restructuring always transfers a loan's *entire* remaining balance) —
no extra snapshot storage needed. Same payment-block safety check as
disbursement reversal: blocked if the new loan already has real
payments recorded against it.

**Tested**: real scenario matching Kevin's numbers exactly (old loan
2,500,000, a real 1,000,000 payment, remaining 1,500,000 restructured
with a fresh fee). All 20 checks passed: old loan correctly
`restructured`/0; new loan correctly 1,500,000 with the link set;
restructuring journal balanced exactly (1,570,800 = 1,570,800); **Total
Assets moved by exactly the fee+VAT (70,800), not the full 1,500,000
principal**; **Net Profit moved by exactly the fee income (60,000), not
fee+VAT**; reversal correctly restored the old loan and deleted the
new one, with both figures reverting exactly to their
pre-restructuring values; final cleanup confirmed zero residue and
both figures back to the true pre-test baseline.

## Journal page serving a stale render — real Data Cache gap, not browser caching

Real, confirmed loan (INEMA-2026-0027, MUGWIZA Alain Herve, 2,500,000)
appeared correctly on Loan Portfolio, and its disbursement journal
entry existed and was fully correct in `iacm_journal_entries` (5
balanced lines, right amounts, right reference) — but the Journal page
kept showing a stale render with no fresh-data path. Survived a hard
refresh AND an incognito window, ruling out browser caching entirely.

**Root cause**: individual admin pages set `dynamic = 'force-dynamic'`
alone, which disables static generation but does not reliably disable
Next.js's own Data Cache for every fetch inside that route on every
Next 14.2.x deploy target. Confirmed by a real, pre-existing
inconsistency already in this codebase: `app/(portal)/loans/page.tsx`
and `app/admin/applications/page.tsx` already paired
`dynamic = 'force-dynamic'` with `revalidate = 0`; every other admin
page did not.

**Full audit of every page under `app/admin/`** (server-rendered pages
only — client components don't use this route segment config at all):

| Page | `dynamic='force-dynamic'` | `revalidate` (before) |
|---|---|---|
| `app/admin/applications/page.tsx` | yes | yes — already correct |
| `app/admin/iacm/journal/page.tsx` | yes | missing — **fixed** |
| `app/admin/iacm/loans/page.tsx` | yes | missing — **fixed** |
| `app/admin/iacm/page.tsx` (IACM Home) | yes | missing — **fixed** |
| `app/admin/inquiries/page.tsx` | yes | missing — **fixed** |
| `app/admin/page.tsx` (Dashboard) | yes | missing — **fixed** |

**Fixed two ways, deliberately redundant**: added `export const
revalidate = 0` to each of the 5 affected pages directly, AND to
`app/admin/layout.tsx` — the single shared layout for the entire admin
section (confirmed no nested layouts exist under `app/admin/iacm/` or
anywhere else). `revalidate` has real documented cascading semantics
`dynamic` doesn't share: when a layout and its page each set a value,
Next.js uses the shortest one across the whole route. Setting it to 0
once on the layout makes zero-caching the enforced floor for every
page under `/admin`, current or future — no one has to remember to add
it to a new page for this specific protection to apply. The explicit
per-page directives stay too, as defense in depth and self-documentation.

**BNR/CRB report pages checked specifically, confirmed NOT affected**:
both `app/admin/iacm/reports/{bnr,crb}/page.tsx` are entirely `'use
client'` — they fetch their data via `fetch()` inside a `useEffect`,
a plain browser-initiated request, not a server-rendered data fetch
subject to this route segment config at all. Their underlying API
routes (`app/api/admin/iacm/reports/{bnr,crb}/route.ts` and their
`filed/route.ts` siblings) all use `requireAdminApi()`, which reads
cookies for auth — per Next.js's documented behavior, a Route Handler
using a dynamic function like `cookies()` is automatically forced into
fully dynamic, per-request execution regardless of any `dynamic`/
`revalidate` export. Structurally immune, not just currently unaffected.

**Tested**: created a real disposable test loan after the fix — its
disbursement journal entry appeared in the exact Journal-page query
immediately, at position 0. Kevin independently confirmed it rendered
on the live Journal page on first load, no refresh needed. Re-ran the
exact query for MUGWIZA's real entry afterward too: unchanged, still
correct, still at position 4 of 50.

**Note on the investigation that followed**: after this fix, Kevin
separately reported still not seeing MUGWIZA's specific entry render.
An exhaustive follow-up (full field-by-field diff against neighboring
entries that do render, duplicate-`id`/duplicate-`reference`/
duplicate-line-`id` collision checks across the whole fetched set) found
zero anomalies — the entry is structurally identical to ones that
render correctly. That specific report was never resolved with a
second code fix; it needs direct browser console/DOM evidence to go
further, which wasn't provided before the investigation moved on to
other real issues. Flagged here rather than silently dropped.

## monthsElapsed's minimum-1-month floor was overcharging real second-and-later payments

Investigating why NKUBITO RUSAMAZA Desire Demino's loan (INEMA-2026-0009)
showed 75,090 of interest due found the real payment trajectory was
correct (one real payment, 2026-07-21, a 5-month catch-up that exactly
matched flat 5% × 5 months) — but Kevin then confirmed the real,
complete picture: she made a genuine SECOND payment (150,000, 2026-07-24,
only 3 real days after the first) that had never been entered. Working
through the real numbers with the existing logic found the actual bug:
`monthsElapsed()`'s `Math.max(1, months)` floor — added earlier tonight
specifically to protect a genuine first payment from being undercounted
— was being applied unconditionally to every payment, including ones
made just days after a loan's own prior real payment. It would have
charged her a full extra month of interest (75,090) she hadn't actually
owed, for 3 real elapsed days.

**Fixed**: `monthsElapsed()` (`lib/calculator.ts`) now takes an
`isFirstPayment` parameter — floors to a minimum of 1 month only when
true (a loan's genuine first payment, reference date = disbursement
date, where undercounting is the real risk being protected against);
floors to a minimum of 0 (never negative, but no longer forced up to 1)
for every payment after the first, where the reference date is the
loan's own real last payment date. Staff retain the existing "Months of
Interest to Charge" override to manually add a month when they know one
is genuinely owed. Both `payments/route.ts` and the live preview in
`payments/new/page.tsx` compute `isFirstPayment` from whether real prior
payments exist and pass it through identically, so the preview never
shows a different number than what actually posts.

**Tested**: 3 real disposable scenarios. (1) A genuine first payment 2
days after disbursement — still correctly floors to 1 month (protection
preserved; the raw `interestOwed` for that period is exactly 50,000,
confirming the floor itself, independent of how fee-first allocation
then splits an actual payment amount). (2) A second payment 3 days
after the first, matching Desire Demino's real shape — correctly shows
0 months and 0 additional interest by default, no longer forced to 1.
(3) A second payment genuinely over a month after the first — correctly
still charges based on real elapsed time (1 month, 50,000 interest),
completely unaffected by the fix. All 12 checks passed, cleanup
confirmed zero residue.

**Real correction**: checked first whether the wrong July 24 payment had
actually been entered yet — it hadn't (the loan still showed only the
July 21 payment), so there was nothing to reverse. Recorded the real
July 24 payment directly with the fixed logic instead: fee 0 / interest
0 / principal 150,000 (script hard-guarded to refuse writing anything
unless the computed split matched this exactly). Loan's real
`balance_outstanding` is now 2,334.96 (down from 152,334.96),
`principal_repaid` 1,499,465.04, `last_payment_date` 2026-07-24,
journal entry posted and balanced (150,000 = 150,000).

## Real client data found in archived CRB filings — 14 of 15 marital_status/date_of_birth gaps closed, plus a real national_id discrepancy to verify

A final, comprehensive July integrity audit (journal balance/orphan/
duplicate checks, independent KPI recompute, BNR/CRB data-readiness,
cross-view consistency — all confirmed clean or already documented
elsewhere) found 15 real active clients missing `marital_status` and
`date_of_birth` — all from the 2026-08-14 bulk historical reload,
predating the 2026-08-17 commit (`ed6b76a`) that added date_of_birth
capture to the New Loan form. Before treating this as purely a future
Devotha data-collection task, Kevin asked for a thorough search of
every real source already provided tonight.

Searched all 3 real historical journal file variants — including two
sheets (`Sheet9`, `Sheet10`) that only exist in the oldest variant and
were never used before — via a full keyword scan of every cell across
every sheet. Zero mentions of marital status or date of birth anywhere.

Then checked the two real archived CRB submission files
(`crblC20260707001.730.xls`, `crblC20260806001.730.xls.xls`, both real
INEMA filings) — both have a genuine "Consumer" sheet with real Marital
Status and Date of Birth columns per the actual CRB format.

**14 of 15 found**, matched by National ID. 7 matched exactly. The
other 7 only matched once a real, unexpected discrepancy was noticed:
`iacm_clients.national_id` agrees with the real archived filing on
every digit except the last, which is consistently `0` in our database
— ABAYISENGA jean claude (`...849010` vs real `...849011`), NIYITEGEKA
Francine (`...149240` vs `...149244`), UMURORE Brigitte (`...014280`
vs `...014287`), NKUBITO RUSAMAZA Desire Demino (`...904180` vs
`...904188`), INDERE Serge (`...193010` vs `...193012`), NASABWE Alice
(`...817070` vs `...817073`), Kami Girbert (`...802050` vs
`...802059`). Seven independent IDs all losing the same final digit is
not a coincidence — almost certainly a systematic truncation bug in the
original bulk historical import.

**Not corrected tonight, deliberately**: `national_id` is left
completely untouched on all 14 — `national_id` is the CRB matching/
deduplication key and feeds BNR filings too, so correcting it needs
Kevin/Devotha to verify the real ID against each client's actual
physical ID document first, not an assumption that the CRB file's
version is the correct side. **Flagged here for that verification to
happen tomorrow.**

**Populated**: `marital_status`/`date_of_birth` for all 14, using the
real values found in the archived CRB filings (git history has the
exact per-client values and before/after). Confirmed via direct
re-query after each update that `national_id` was left byte-for-byte
unchanged on every one.

**Not resolved**: HABIMANA Emmanuel (INEMA-2026-0001) genuinely does
not appear in either archived CRB file's Consumer sheet under any name
— searched exhaustively, confirmed absent. His marital_status/
date_of_birth remain a real data-collection task requiring direct
contact with him, not recoverable from any source already available.
