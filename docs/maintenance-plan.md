# INEMA Maintenance Plan

**Purpose:** a real, disciplined routine for keeping INEMA's system correct going forward, run by a dedicated maintenance agent — separate from whichever agent is building LendAfrica — that has no memory of tonight's build session and needs to pick this up cold every time it runs.

This is not a generic "run tests regularly" plan. Every check below exists because a real, specific bug of that shape was actually found in this system tonight. The goal is to catch the next one of those before it sits unnoticed for weeks, not to re-run tonight's entire audit every day.

---

## 1. Recommended cadence: daily quick check + weekly deep check, not one or the other

**Daily, every morning before Kevin/Devotha start real work.** Reasoning: INEMA books real transactions every real business day — loans, payments, expenses. A mistake in one of those (a duplicate payment, a mis-posted journal entry, a new client missing required data) is cheapest to catch the same day it happens, before three more days of activity get layered on top of a wrong balance. Waiting a week to catch a duplicate payment means a week of a dashboard KPI being quietly wrong.

**Weekly, deeper, on the same morning as that week's daily check (recommended: Monday, catching the weekend and starting the week clean).** Reasoning: some checks are expensive or only meaningful in bulk — a full BNR/CRB live-generation test, a complete client-data audit across every active client, a full historical loan-balance reconciliation. These don't need daily attention because the underlying data (regulatory code mappings, client completeness) doesn't drift day to day the way transaction data does — it only drifts when new clients/loans are added, which a weekly cadence catches well within any real reporting deadline.

**A third, non-scheduled trigger, stated once here rather than baked into either prompt below:** if the INEMA codebase itself is ever changed (a bug fix, a new feature) — run the relevant parts of the Weekly Deep Check the same day, regardless of what day it is. Tonight's session found the classification-boundary bug independently reimplemented in three different files; a code change is exactly the moment a new instance of that failure mode gets introduced, and it's cheap to catch immediately rather than at the next scheduled weekly check.

**What NOT to do**: don't run the full weekly-scope check daily "just to be safe." It's real query volume against production data for no real benefit — the things it checks don't change fast enough to justify it, and it turns a 10-minute daily habit into a 40-minute one that's more likely to get skipped.

---

## 2. What grounds these checks — the real bug patterns from tonight

Every item in both prompts below traces back to one of these real, already-happened problems, not a hypothetical:

- **Journal integrity** — every entry must balance and have no orphaned lines. Confirmed 100% clean twice tonight (261 entries, 768 lines, 0 unbalanced, 0 orphans) but this is exactly the kind of thing a form regression could break silently.
- **Timezone/date-boundary bugs** — a real, recurring bug class. `toISOString().slice(0,7)` (or any UTC-round-trip on a locally-built `Date`) silently shifted the Monthly Collections chart to the wrong month (fixed `f1c3b9a`), and a separate but related staleness bug hit the Journal page (fixed `d8947f8`). Worth an explicit spot-check that today's date-keyed figures (Monthly Revenue, Monthly Collections) land in the right bucket.
- **The same business rule, reimplemented in more than one place, drifting** — the loan classification day-boundaries (Normal 0-29, Watch 30-89, etc.) were wrong in three independent places at once tonight (`lib/crb-report.ts`, the dashboard's portfolio chart, and the BNR report page's display text) before being found and fixed. There's no structural guarantee a fourth copy doesn't get introduced later.
- **Duplicate transactions slipping through** — the app has a real, working soft-warn duplicate check on New Loan/Record Payment/Record Expense (`DuplicateWarningModal`), but it can be legitimately overridden (`confirmed_duplicate: true`) for a real second identical transaction. A periodic independent scan is the backstop for the case where it was overridden incorrectly.
- **Client data completeness gaps accumulating silently** — tonight's session found 15 real active clients with missing marital_status/date_of_birth/occupation/nationality, built up over time with nobody noticing until a full audit. The fix was real and thorough, but nothing stops a newly-added client from starting that pile over again.
- **Net Profit silently including the wrong things** — a real fix tonight excluded liability-settling expense categories (VAT/PAYE/CBHI/etc.) from Net Profit, since paying down a payable isn't a new operating cost. Any new expense category added later needs the same classification decision made correctly, or Net Profit quietly drifts wrong again.
- **Regulatory report generation breaking silently** — BNR/CRB report generation involves real byte-level file manipulation (`lib/crb-biff8-patcher.ts`) and real external code-table dependencies. A live-generation test is the only way to know it still works; reading the code is not enough (this was true of every fix tonight — verified by actually running it against real data, not by inspection).

---

## 3. Daily INEMA Health Check — ready to paste

Copy the block below into a fresh agent session every morning. It's scoped to run in well under 20 minutes of real work.

```
You are running the recurring "Daily INEMA Health Check" for INEMA
Financial Solutions Ltd's real production system, repo at
C:\Users\hp\Downloads\inema-backend (Next.js 14 + Supabase). You have
no memory of any prior session — read docs/known-gaps.md in full
first, so you know what's already-documented and accepted (e.g. 3
legacy import journal rows with no narration, two clients with
duplicate records under one phone number) and don't re-flag those as
new findings. Only flag something as an issue if it's new, or if a
documented gap has gotten worse.

Credential ritual: ask Kevin for a FRESH Supabase service-role key and
URL this session (never reuse one from memory). Run
`git check-ignore -v .env.local` before writing it, write it with a
"TEMPORARY, do not commit" comment, do the checks in a .tmp-* scratch
directory, then delete both the .env.local file and the scratch
directory when done. This is a READ-ONLY check — do not modify any
code or data. If you find something wrong, report it clearly with real
evidence; do not fix it yourself without Kevin explicitly confirming
first.

Run these checks against real live data:

1. JOURNAL INTEGRITY: pull all iacm_journal_entries and
   iacm_journal_lines. Confirm every entry's debit total equals its
   credit total, confirm zero orphaned lines (no line without a parent
   entry), confirm zero entries with no lines at all. Report any
   non-empty narration on entries dated in roughly the last 7 days
   specifically (older empty narrations are the known legacy-import
   gap, already documented).

2. KPI RECOMPUTE: independently recompute Total Disbursed, Total
   Collected, Outstanding Balance, Active Loans, Net Profit, and
   Monthly Revenue directly from iacm_loans/iacm_payments/iacm_expenses
   using the exact formulas in app/admin/page.tsx and
   lib/net-profit.ts (read them fresh, don't assume they're unchanged
   from any prior session). Confirm your recompute would match what the
   dashboard shows.

3. DUPLICATE SCAN: look across iacm_payments and iacm_expenses for any
   same-loan-or-category, same-amount, same-date rows (the same shape
   the app's own duplicate-warning check screens for at entry time).
   For any found, report them clearly — don't assume they're
   legitimate re-submissions, and don't assume they're mistakes either.

4. NEW CLIENT DATA GAPS: find any iacm_clients row created since the
   last time this check ran (or in the last 7 days if you can't tell)
   and check it has national_id, nationality, marital_status,
   date_of_birth, occupation, gender, phone, and district all
   populated. Report any gaps by name.

5. COMPLIANCE DEADLINES: confirm compliance_deadlines has no deadline
   that's overdue (deadline_date in the past, is_done still false)
   without already being flagged on the dashboard's own alert section
   — the dashboard should already be surfacing this, so this check is
   really "confirm that alert mechanism itself still works," not a
   fresh manual list.

6. CROSS-VIEW SPOT CHECK: pick 3 real active loans at random. Confirm
   their balance_outstanding is identical whether read via the main
   dashboard's data path, the Loan Portfolio page, and the Journal's
   own account-balance queries (lib/ledger.ts's getAccountBalance /
   direct iacm_loans read) — these should structurally always agree
   since every view reads the same column directly, so this is a cheap
   confirmation that hasn't silently stopped being true.

Give Kevin a short, clear verdict: confirmed good, or a specific real
issue with evidence, for each of the 6 checks above. If everything is
clean, say so plainly in a few lines — this should not become a long
report on a normal day.
```

---

## 4. Weekly Deeper Check — ready to paste

Run this once a week (recommended: the same morning as that week's Daily Check, e.g. every Monday), in addition to, not instead of, the daily prompt above. Budget more like 30-45 minutes — it does real live report generation and a full audit pass.

```
You are running the recurring "Weekly INEMA Deep Check" for INEMA
Financial Solutions Ltd's real production system, repo at
C:\Users\hp\Downloads\inema-backend (Next.js 14 + Supabase). You have
no memory of any prior session — read docs/known-gaps.md and
docs/bnr-codification-reference.json in full first, so you know the
real, already-confirmed business rules (fee-first payment allocation,
the real classification day-boundaries: Normal 0-29 / Watch 30-89 /
Substandard 90-179 / Doubtful 180-359 / Loss 360+, the liability
expense categories excluded from Net Profit) rather than re-deriving
or guessing them.

Credential ritual: same as every session — ask Kevin for a FRESH
Supabase service-role key and URL, confirm .env.local is gitignored
before writing it, delete it and any scratch directory when done. This
is a READ-ONLY check unless Kevin explicitly confirms a fix — show
evidence and ask before changing anything.

Run everything from the Daily Health Check above, PLUS:

1. FULL CLIENT-DATA AUDIT: check every real active client (not just
   ones created this week) for the same 8 fields as the daily check
   (national_id, nationality, marital_status, date_of_birth,
   occupation, gender, phone, district). Report any gap, even in a
   long-standing client record.

2. FULL LOAN-BALANCE RECONCILIATION: for every active loan (not a
   sample), confirm disbursed_amount minus the sum of real
   principal_portion payments equals balance_outstanding exactly.

3. LIVE BNR REPORT GENERATION: actually call generateBnrReport() for
   the real current quarter against live data (this function is a pure
   read with no archiving side effect, safe to call directly). Confirm
   it completes with no error and produces real, non-NaN figures.

4. LIVE CRB REPORT GENERATION: actually run the real
   generateCrbReport() logic against live data and the real most-
   recently-archived CRB file. IMPORTANT: this function DOES archive
   its own output as a new real filed report by default — either
   intercept/stub the storage-upload and iacm_crb_filed_reports-insert
   calls so this weekly check doesn't create a real extra filing every
   week, or explicitly ask Kevin first if a real filing is wanted this
   run. Confirm zero blank Nature/Category/Sector-of-Activity fields
   across all active loans, confirm the duplicate-coordinate self-check
   doesn't throw, confirm the output file re-opens cleanly (e.g. via
   the xlsx library) and has no Zone.Identifier stream if written
   locally.

5. SAME-RULE-MULTIPLE-PLACES RE-CHECK: specifically re-verify that the
   loan classification day-boundaries still agree across all three
   places they're implemented — lib/crb-report.ts's classifyByDays(),
   app/admin/page.tsx's portfolio chart bucket logic, and the BNR
   report page's display text (app/admin/iacm/reports/bnr/page.tsx).
   This exact rule was found wrong in all three places independently
   in one night — there's no code-level guarantee a future edit to one
   doesn't silently drift from the other two again.

6. REVERSAL HISTORY REVIEW: read every iacm_reversals row from the
   past week. For each, sanity-check the reason given makes sense and
   that the journal is still fully balanced afterward (should already
   be covered by check 1, but call out reversals specifically here
   since they're the highest-consequence action available in the app).

Give Kevin a clear, organized verdict, area by area, same evidence-
first standard as tonight's original full system audit — confirmed
good, or a specific real issue with evidence. This is the check that's
allowed to take real time and find real things; don't compress it into
a one-line summary the way the daily check should be on a clean day.
```

---

## 5. One honest note for whoever picks this up

Both prompts above assume the maintenance agent will actually run real queries against real live data and read real current code, not recall facts from this document as if they were still true. This plan itself will go stale the moment the schema, the account codes, or the business rules change — treat every fact in it (file paths, formulas, table names) as a starting pointer to verify, not a fact to trust outright, exactly the same discipline this whole system was built with tonight.
