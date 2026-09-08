# INEMA Accounting & Journal System — Complete Reference

**Prepared:** 2026-09-08 (updated same day — see Addendum)
**Scope:** `lib/ledger.ts` and every route that posts to it, cross-referenced line-by-line against the real `INEMA_Journal_Q3_2026.xlsx` workbook (Kevin's Desktop copy, 13 sheets, 776 Journal rows) and the real deployed `public/journal_template.xlsx`.
**Status:** every figure, formula, and account name below was read directly from the real code and the real files — nothing here is inferred from naming conventions alone. Where I could not verify something directly, it's flagged explicitly as an open question, not stated as fact.

**Read the Addendum at the bottom first if you already read the original version of this document — it corrects one claim in the original Executive Summary and adds a real, newly-confirmed structural finding.**

---

## Executive summary — the one thing to understand before anything else

**`INEMA_Journal_Q3_2026.xlsx` is not a spreadsheet someone maintains by hand. It is a live export.**

`app/api/admin/iacm/journal/export/route.ts` generates this exact file, on demand, every time an admin downloads it:

1. It loads `public/journal_template.xlsx` (a file that lives in the deployed app, not on anyone's Desktop).
2. It reads **every** real `iacm_journal_entries` + `iacm_journal_lines` row from Postgres, oldest first.
3. It wipes rows 3 downward on the **Journal** sheet only, and rewrites them — one row per debit/credit line, in the app's own account codes and narration text — under the filename `INEMA_Journal_Q3_2026.xlsx`, which is hardcoded in the route.
4. Every other sheet (Accounts, Interest Calculations, Sheet1–Sheet6, Q1TB, Months, Share capital entry) is carried through **untouched, exactly as it exists inside `public/journal_template.xlsx` at that moment.**

This one fact explains almost everything else in this document: which sheets are automated, which are manual, and — critically — a real risk in how manual work on those other sheets can silently get lost. That risk is covered in full in Part 3. Read Part 3 before doing any manual editing of this file.

---

## Part 1 — The real accounting system (`lib/ledger.ts` and its callers)

### 1.1 The formally-tracked chart of accounts (`CHART_OF_ACCOUNTS`, 18 accounts)

This is the array `getAccountBalance()`, `getTrialBalance()`, and the manual-journal-entry route (`accountByCode()`) all actually operate against. It is **balance-sheet accounts only** — no income or expense codes — by deliberate design (a code comment explains: income/expense accounts have no opening-balance concept, so including them would let a manual entry silently double-count against `iacm_opening_balances`).

| Code | Name | Normal side |
|---|---|---|
| 3010 | Cash on Hand | Debit |
| 3020 | Bank Accounts | Debit |
| 3030 | Accounts Receivable — Interest and Fees | Debit |
| 3040 | Other Receivables | Debit |
| 3050 | Prepaid Expenses | Debit |
| 3060 | Caution | Debit |
| 3110 | Loan Issued | Debit |
| 3210 | Property, Plant & Equipment (PPE) | Debit |
| 3220 | Accumulated Depreciation | Credit (contra-asset) |
| 2030 | Shareholders' Loan — Long Term | Credit |
| 2530 | VAT Control Account | Credit |
| 2540 | PAYE Payables | Credit |
| 2550 | Maternity Contribution Payables | Credit |
| 2560 | Pension and Risk Contribution Payables | Credit |
| 2570 | CBHI Payables | Credit |
| 2580 | Salary Payables | Credit |
| 2640 | Tax Payable | Credit |
| 1010 | Ordinary Share Capital | Credit |
| 1050 | Retained Earnings | Credit |

**Structural consequence, worth understanding:** a **manual** journal entry (`app/api/admin/iacm/journal/route.ts`) can only ever use these 18 codes — it resolves each line's account name via `accountByCode(code)!.name`, which throws for anything not in this list. **Automated** postings (disbursements, expenses, salary, etc.) are not restricted this way and freely use additional 6xxx/7xxx/2xxx codes that never appear in `CHART_OF_ACCOUNTS` at all. So a person using the in-app "New Journal Entry" screen has real, narrower options than the app's own automated postings do — they cannot, for example, manually post directly to "Salaries & Wages" (6110) or "Interest Income on Loans" (7010) through that screen.

### 1.2 The full, real chart of accounts (from the Excel "Accounts" sheet — 65 accounts)

This is the authoritative, complete list — **more complete than the code's `CHART_OF_ACCOUNTS`**, and it is the real source `Sheet1`'s VLOOKUP formulas read from (`VLOOKUP(E19,Accounts!$B$2:$C$66,2,FALSE)`). Grouped by class exactly as the sheet organizes it:

| Class | Accounts (code — name) |
|---|---|
| **1000 Equity** | 1010 Ordinary Share Capital · 1020 Preference Share Capital · 1030 Donor Grants & Contributions · 1040 Revaluation Reserves · 1050 Retained Earnings · 1060 Current Year Surplus/(Deficit) |
| **2000 Long-Term Liabilities** | 2010 Long-Term Borrowings · 2020 Lease Liabilities · 2030 Shareholders' Loan — Long Term |
| **2500 Current Liabilities** | 2510 Trade Payables · 2520 Other Payables · 2530 VAT Control Account · 2540 PAYE Payables · 2550 Maternity Contribution Payables · 2560 Pension and Risk Contribution Payables · 2570 CBHI Payables · 2580 Salary Payables · 2590 Withholding Tax (WHT) Payables · 2600 Social Security Payables · 2610 Accrued Expenses · 2620 Other Statutory Payables · 2630 Unearned Income/Deferred Revenue · 2640 Tax Payable |
| **3000 Current Assets** | 3010 Cash on Hand · 3020 Bank Accounts · 3030 AR — Interest and Fees · 3040 Other Receivables · 3050 Prepaid Expenses · 3060 Caution |
| **3100 Loan Portfolio Assets** | 3110 Loan Issued · 3120 Performing Loans · 3130 Non-Performing Loans · 3140 Provision for Loan Losses (contra-asset) |
| **3200 Non-Current Assets** | 3210 PPE · 3220 Accumulated Depreciation (contra-asset) · 3230 Intangible Assets · 3240 Other Long-Term Investments |
| **4000 Loans and Advances** | 4010 Microloans to Clients · 4020 SME Loans · 4030 Loan Guarantees Issued (off-balance sheet) |
| **5000 Loan Loss Provisions** | 5010 General Loan Loss Provision · 5020 Specific Loan Loss Provision |
| **5100 Loan Write-offs** | 5110 Principal Write-offs · 5120 Interest Write-offs |
| **5200 Exceptional Items** | 5210 Foreign Exchange Losses · 5220 Extraordinary Adjustments |
| **6000 Financial Expenses** | 6010 Interest on Borrowings |
| **6100 Personnel Costs** | 6110 Salaries & Wages · 6120 Staff Benefits & Welfare |
| **6200 Administrative Expenses** | 6210 Office Rent · 6220 Utilities · 6230 IT & Software Expenses · 6240 Depreciation & Amortization · 6250 Legal & Professional Fees · 6260 Travel & Transport · 6270 Communication Expenses · 6280 Bank Charges · 6290 Income Tax Expense · 6300 Miscellaneous Expenses |
| **7000 Operating Income** | 7010 Interest Income on Loans · 7020 Fees & Commission Income · 7030 Penalty & Late Payment Charges |
| **7100 Non-Operating Income** | 7110 Investment Income · 7120 Other Miscellaneous Income |

**Real, worth-knowing gap:** roughly half of this list is **never posted to by any code path** — 1020, 1030, 1040, 1060, 2010, 2020, 2510, 2520, 2590, 2600, 2610, 2620, 2630, 3120, 3130, 3140, 3230, 3240, 4010, 4020, 4030, 5010, 5020, 5110, 5120, 5210, 5220, 7030, 7110, 7120. This "Accounts" sheet is the **aspirational full chart** (built for a more mature loan-portfolio-classification and provisioning regime — performing/non-performing splits, loan-loss provisioning, write-offs — that INEMA hasn't implemented yet). Treat it as the reference for what codes are *available and reserved* if a code change is ever made, not as evidence those categories are currently tracked.

### 1.3 How a real journal entry is created — `postJournalEntry()`

```
postJournalEntry(supabase, { entry_date, narration, reference?, entry_type?, created_by?, lines })
```

`iacm_journal_entries` is a pure **header** table — `entry_date`, `narration`, `reference`, `entry_type`, `created_by`. It carries no debit/credit of its own. The real debit/credit lines live in `iacm_journal_lines` (`account_code`, `account_name`, `debit_amount`, `credit_amount`), one row per line, all pointing back at the header via a foreign key. One call to `postJournalEntry()` = one header insert + N line inserts. This two-table shape is deliberate and was itself a real historical fix — an earlier version of this code assumed a flat single-table schema and silently failed.

`entry_type` is what later drives reversal eligibility (`REVERSAL_HANDLERS`, see §1.6) and is what the Journal export/UI now render as a badge. The real values in use: `disbursement`, `payment`, `expense`, `salary_payment` (the accrual itself is typed `expense`, not its own type — see §1.4), `shareholder_loan`, `cash_transfer`, `loan_restructuring`, `manual`.

### 1.4 Every real transaction type — the complete debit/credit reference table

This is the authoritative table Kevin asked for. Every row below is a real, exact line from a real route file, not paraphrased.

**Disbursement** (`app/api/admin/iacm/loans/route.ts`) — `entry_type: 'disbursement'`

| Account | Dr | Cr |
|---|---|---|
| 3030 AR — Interest and Fees | fee + VAT | |
| 3110 Loan Issued | principal | |
| 3010/3020 Cash on Hand / Bank Accounts (by `disbursement_method`) | | principal |
| 7020 Fees & Commission Income | | fee |
| 2530 VAT Control Account | | VAT |

**Payment** (`app/api/admin/iacm/payments/route.ts`) — `entry_type: 'payment'`

| Account | Dr | Cr |
|---|---|---|
| 3010/3020 Cash on Hand / Bank Accounts (by `payment_method`) | amount paid | |
| 3030 AR — Interest and Fees | | fee portion (clears the AR set up at disbursement — not new income) |
| 7010 Interest Income on Loans | | interest portion |
| 3110 Loan Issued | | principal portion |

**Expense — normal** (`app/api/admin/iacm/expenses/route.ts`) — `entry_type: 'expense'`

| Account | Dr | Cr |
|---|---|---|
| Category account, from `EXPENSE_ACCOUNTS` map (below) | amount | |
| 3010/3020 Cash on Hand / Bank Accounts (by `payment_method`) | | amount |

**Expense — depreciation** (same route, `category: 'depreciation'`, non-cash)

| Account | Dr | Cr |
|---|---|---|
| 6240 Depreciation & Amortization | amount | |
| 3220 Accumulated Depreciation | | amount |

The real `EXPENSE_ACCOUNTS` map (category → account), with the real historical corrections already baked in via code comments — `petty_cash` was explicitly removed after a real incident where cash withdrawals were wrongly posted as expenses:

| Category | Code | Name |
|---|---|---|
| interest_on_borrowings | 6010 | Interest on Borrowings |
| personnel | 6110 | Salaries & Wages |
| staff_benefits | 6120 | Staff Benefits & Welfare |
| rent | 6210 | Office Rent |
| utilities | 6220 | Utilities |
| it_software | 6230 | IT & Software Expenses |
| legal | 6250 | Legal & Professional Fees |
| transport | 6260 | Travel & Transport |
| communication | 6270 | Communication Expenses |
| bank_charges | 6280 | Bank Charges & Commissions |
| income_tax_expense | 6290 | Income tax expense |
| vat | 2530 | VAT Control Account |
| paye | 2540 | PAYE Payables |
| cbhi | 2570 | CBHI Payables |
| pension | 2560 | Pension and Risk Contribution Payables |
| maternity | 2550 | Maternity Contribution Payables |
| wht | 2590 | Withholding Tax (WHT) Payables |
| social_security | 2600 | Social Security Payables |
| other_statutory | 2620 | Other Statutory Payables |
| tax | 2640 | Tax Payable |
| other | 6300 | Miscellaneous Expenses |

**Salary — Step 1, accrual** (`app/api/admin/iacm/salary/accrual/route.ts`) — `entry_type: 'expense'`, also writes a real `iacm_expenses` row (category `personnel`, amount = gross)

| Account | Dr | Cr |
|---|---|---|
| 6110 Salaries & Wages | gross | |
| 2540 PAYE Payables | | PAYE |
| 2550 Maternity Contribution Payables | | maternity |
| 2560 Pension and Risk Contribution Payables | | pension |
| 2570 CBHI Payables | | CBHI |
| 2580 Salary Payables | | net payable |

**Salary — Step 2, payment** (`app/api/admin/iacm/salary/payment/route.ts`) — `entry_type: 'salary_payment'`, journal-only

| Account | Dr | Cr |
|---|---|---|
| 2580 Salary Payables | net amount | |
| 3010/3020 Cash on Hand / Bank Accounts | | net amount |

**Cash transfer** (`app/api/admin/iacm/cash-transfer/route.ts`) — `entry_type: 'cash_transfer'`, journal-only. Built to fix the same real incident that removed `petty_cash` from expenses.

| Direction | Dr | Cr |
|---|---|---|
| Withdrawal (bank → cash) | 3010 Cash on Hand | 3020 Bank Accounts |
| Deposit (cash → bank) | 3020 Bank Accounts | 3010 Cash on Hand |

**Shareholder loan** (`app/api/admin/iacm/shareholder-loan/route.ts`) — `entry_type: 'shareholder_loan'`, journal-only

| Direction | Dr | Cr |
|---|---|---|
| Deposit (shareholder lends the company money) | 3020 Bank Accounts | 2030 Shareholders' Loan |
| Withdrawal (repaying the shareholder) | 2030 Shareholders' Loan | 3020 Bank Accounts |

**Split expense — prepaid recognition** (`app/api/admin/iacm/split-expense/route.ts`) — `entry_type: 'expense'`. This is the app's own automated equivalent of the manual work in Excel **Sheet1** — see Part 2.11.

| Account | Dr | Cr |
|---|---|---|
| 3050 Prepaid Expenses | prepaid portion | |
| 6210 Office Rent (or other current-period expense account) | current-period portion | |
| 2530 VAT Control Account | VAT portion | |
| 3010/3020 Cash on Hand / Bank Accounts | | total |

**Loan restructuring** (`restructureLoan()` in `lib/ledger.ts`) — `entry_type: 'loan_restructuring'`. Closes the old loan (`status: 'restructured'`), opens a new one at the agreed amount (or the old balance if none given).

| Account | Dr | Cr |
|---|---|---|
| 3110 Loan Issued | new loan amount | |
| 3110 Loan Issued | | old loan balance (nets to zero on the shared GL code) |
| 3030 AR — Interest and Fees | new fee (4%) + VAT (18% of fee) | |
| 7020 Fees & Commission Income | | new fee |
| 2530 VAT Control Account | | new VAT |

**Manual entry** (`app/api/admin/iacm/journal/route.ts`) — `entry_type: 'manual'`. Caller-supplied lines, restricted to the 18 `CHART_OF_ACCOUNTS` codes only (§1.1). Deliberately **not reversible** through the reversal feature.

### 1.5 Balances: `getAccountBalance()` / `getAccountMovementSum()` / the cutoff date

`LEDGER_CUTOFF_DATE = '2026-06-30'` is the date of a real, reconciled opening-balance snapshot (`iacm_opening_balances`).

- **`getAccountBalance(code, asOfDate)`** — balance-sheet style, point-in-time. `opening balance + journal movements strictly after the cutoff, up to asOfDate`. Entries on/before the cutoff never contribute — they're already baked into the snapshot, and re-counting them would double-count. Used by the Dashboard, the Journal page's trial-balance boxes, and the BNR balance sheet.
- **`getAccountMovementSum(codes, fromDate, toDate, side)`** — income-statement style, a period flow sum for 6xxx/7xxx codes that aren't in `CHART_OF_ACCOUNTS` at all. **Has no cutoff guard**, because there's no pre-cutoff income snapshot to double-count against. Used by BNR's income statement and the Dashboard/Income fee figures.

This asymmetry matters for reversals: reversing a pre-cutoff entry is a no-op on every balance-sheet screen, but **does** change a regulator-facing income-statement figure for a past period — which is exactly why the reversal feature (§1.6) requires an explicit acknowledgement checkbox for pre-cutoff reversals rather than blocking them outright.

### 1.6 Reversals (already built)

`REVERSAL_HANDLERS` maps `entry_type → {domainTable, referencePrefix}` for the five reversible types (disbursement, payment, expense, shareholder_loan, cash_transfer — `manual` and `loan_restructuring` are out of scope). `reverseTransaction()` writes an `iacm_reversals` audit row *before* mutating anything (a leftover audit row on partial failure is safer than a silent unaudited deletion), blocks reversing a disbursement or restructuring that already has real payments against it, and blocks double-reversal via a check against existing `iacm_reversals` rows. `recomputeLoanFromPayments()` rebuilds a loan's balance from its `disbursed_amount` and its currently-existing `iacm_payments` rows from scratch (not incremental math) — this is what fixed the real INEMA-2026-0008 incident. Full design detail lives in the earlier plan for this feature; it is implemented, not pending.

---

## Part 2 — Sheet-by-sheet study of `INEMA_Journal_Q3_2026.xlsx`

For each sheet: what it really is, system-generated or manual, and how it relates to the others.

### 2.1 Journal (main sheet) — **100% system-generated**

776 rows. Header row 2: `Month | Date | Narration | Account code | Account name | Debit | Credit`. Data from row 3. Confirmed byte-for-byte against `journal/export/route.ts`: every row is one `iacm_journal_lines` row, grouped into consecutive blocks sharing one transaction's date/narration — exactly matching the real transaction shapes in Part 1. Two concrete confirmations from the real data:

- Rows 413–420 (April 2026): a 6-line "Salary and wages for April 2026" accrual block (6110/2540/2550/2560/2570/2580) immediately followed by a 2-line "Payment of Salary and wages for april2026" block (2580/3020) — the exact two-step accrual/payment pattern from §1.4.
- Rows 757–770 (late July 2026): narration style has visibly shifted to `"Loan disbursed — HARERIMANA Daniel (INEMA-2026-0028)"` and `"Loan repayment — NASABWE Alice"` — em-dashes, and the loan's real ID code in parentheses — a noticeably more machine-generated style than the earlier "Loan issued to marie" / "Loan repayment made by providence" phrasing seen in April. This is real evidence the narration convention in the code itself evolved over the period the file covers (later disbursement/payment code produces IDs in the narration; earlier code, or earlier manual entries, didn't).

**Do not hand-edit this sheet.** It is fully overwritten, rows 3+, on every export.

### 2.2 Accounts — static reference, manual only if the business genuinely adds a new GL code

67 rows, the full chart from §1.2. This is what `Sheet1`'s `VLOOKUP` formulas read from. Carried through from the template untouched by every export. Only needs editing if a real new account is introduced — and if so, `lib/ledger.ts` / `EXPENSE_ACCOUNTS` need the matching code change, or the app simply won't ever post to it.

### 2.3 Detail1 — **PivotTable drill-down, system-derived (needs a manual refresh)**

68 rows. Literally titled `"Details for Sum of Debit - Account name: Loan issued"` — this is Excel's own "Show Details" output for account 3110 (Loan Issued) from the Sheet2 pivot, spanning January–June 2026. Every row matches a real Journal line (I cross-checked several against the Journal sample directly — e.g. "Loan issued to marie" F=1,000,000 appears in both). Regenerating this after a fresh export requires opening the file in Excel and refreshing the PivotTable it's derived from — it does **not** update itself just because the underlying Journal sheet changed.

### 2.4 Sheet2 — the full-period trial balance pivot — **system-derived, needs refresh**

`Row Labels | Sum of Debit | Sum of Credit`, one row per account name appearing anywhere in Journal, with a `GETPIVOTDATA` formula on the VAT Control Account row and a Grand Total row. The Grand Total balances exactly: **132,517,235.4 debit = 132,517,235.4 credit** — a genuine, passing double-entry integrity check across the whole recorded period. Same refresh caveat as Detail1.

### 2.5 Sheet4 — trial balance with net-balance columns — **system-derived, needs refresh**

Same pivot as Sheet2, plus a `Diff` column (`Debit − Credit`) and an `F`/`G` "natural side" split — each account's *net* balance placed on whichever side it actually sits on (e.g. VAT Control Account nets to a 27,312 credit, shown in G not F). **Its Grand Total (F28/G28 = 40,766,812.4 both sides) is a different, smaller number than Sheet2's Grand Total (132,517,235.4) — this is correct, not a discrepancy.** Sheet2 sums the full gross debit and credit turnover; Sheet4's F/G columns sum only the *net* balance per account (whichever side is larger), which is naturally a much smaller number since offsetting debits/credits within the same account cancel out. Worth stating plainly so this isn't mistaken for a balancing error.

### 2.6 Q1TB — Trial balance restricted to Q1 (Jan–Mar 2026) — **system-derived, needs refresh**

Same structure as Sheet4 (minus the Diff/natural-side columns), but scoped to Q1 only — e.g. "Loan issued" shows 27,805,240 debit here vs. 61,226,760 in the full-period Sheet2, and the file's own Grand Total balances internally too: **38,252,925 = 38,252,925**. This is a quarter-end snapshot, almost certainly saved by copy-pasting Sheet4's values for a Q1-filtered pivot at the time Q1 closed — a real, one-time archival copy, not something that stays live.

### 2.7 Sheet3 — VAT-on-disbursement drill-down with client names — **manual (a hand-added column on top of a pivot drill-down)**

18 rows, April–June 2026, every row a 2530 VAT Control Account **credit** line tied to a loan disbursement. Structurally identical to Detail1/Sheet6, but with one addition: **column H, the client's full name**, typed in by hand — the Journal sheet itself has no name column, so this had to be added manually, row by row, to make the VAT figures traceable back to a specific client. This is real, genuine manual work layered on top of a pivot-style export, most plausibly built to support a real RRA VAT filing where auditors expect a name against every VAT line.

### 2.8 Sheet5 — a VAT recomputation check — **manual scratch work**

18 rows, matching Sheet3's VAT amounts **in the same order** (3600, 43200, 7200, 7200, 2160, 7200, 14400, 2520, 3600, 6480, 7200, 3600, 3600, 7200, 10800, 1080). Column B = the actual VAT figure, column C = the fee base, column E = `C × 18%` as an independent recomputation. This is literally a hand-built cross-check: does 18% of the loan's fee actually equal the VAT figure Sheet3 shows? Pure verification scratch work, not a record of anything new.

### 2.9 Sheet6 — the full VAT Control Account sub-ledger, Jan–Jun 2026 — **manual (superset of Sheet3)**

34 rows. This is the real, complete picture Sheet3 is a subset of: every 2530 credit from a loan disbursement (Jan–Jun, not just Apr–Jun), **plus** the debit side — real VAT *payments* to RRA ("Payment of quarterly VAT from September to december" = 91,489; "Payment of quarterly VAT from january to april" = 41,235) and the recurring prepaid-rent input-VAT recognitions ("Recognition of rent payment made for jan & feb / march & aprl / may & june" = 76,271 each, month after month) — that Sheet1's calculation (§2.11) produces. Row 2's opening 91,489 credit (dated 1-Jan-26, no narration) is a genuine **VAT Control Account opening balance carried forward from before this workbook's period began.** A running-subtotal formula at I16 (`=SUM(G3:G16)`) confirms this was actively used as a real working T-account, not just a report.

### 2.10 Interest Calculations — manual accrued-interest workings, real open question attached

27 rows, two blocks (roughly one per quarter), columns `Names | Loan amount | Payment Date | Interest Due | Comment`, formula `=Loan amount × 5% × months`. This computes accrued-but-not-yet-paid interest for specific named clients whose loans are overdue at month/quarter end — e.g. "BIGIRIMANA Desire — accrued interest for 3 months (October to December) — 450,000". **Genuinely manual**, and there is no automated equivalent anywhere in `lib/ledger.ts` — nothing in the code computes or posts an interest-accrual journal entry on a schedule.

**Open question I could not resolve from the code or the Journal sample I read:** I did not find a matching "accrued interest" journal-entry pattern anywhere in the Journal rows I sampled (395–420, 757–770). It's a real, open question whether these calculated figures are ever actually posted as a real double entry (e.g. Dr 3030 AR / Cr 7010 Interest Income, recognizing income before cash is received) or whether this sheet is purely an internal tracking/monitoring tool that never becomes a journal entry at all. **Worth confirming directly with whoever prepares this sheet** — it changes whether INEMA's income statement is on a cash basis or an accrual basis for interest income, which is not a small distinction.

### 2.11 Sheet1 — the manual prepaid-rent/VAT split calculation — **overlaps a real app feature**

A dense scratch-calculation block: takes a 500,000 six-month rent payment, splits out VAT (`500,000 × 18/118 = 76,271`), splits the VAT-exclusive balance into a currently-consumed portion and a remaining prepaid portion, and produces the exact three-line entry (Dr 6210 Office Rent, Dr 2530 VAT Control Account, Cr 3050 Prepaid Expenses) that shows up recurring in Sheet6 as "Recognition of rent payment made for [months]" (76,271, month after month). Rows 19–21 `VLOOKUP` the account codes straight from the Accounts sheet (`VLOOKUP(E19,Accounts!$B$2:$C$66,2,FALSE)`), confirming this was built as a real working calculation, not a mockup.

**Real, worth-flagging overlap:** §1.4's `split-expense` route (`app/api/admin/iacm/split-expense/route.ts`) automates exactly this — prepaid/current/VAT split, posted directly to 3050/6210/2530 against cash. If that feature is actively used for the monthly rent recognition, Sheet1 is redundant manual work duplicating something the app already does correctly. If it isn't being used (e.g. because this recognition needs to happen before cash actually moves, which the split-expense route may not support), Sheet1 is the real, load-bearing calculation and should stay. **This is worth Kevin confirming directly** — I did not find evidence either way of which one is actually driving the recurring Sheet6 entries.

### 2.12 Months — a flat reference list, no manual maintenance beyond annual extension

19 rows, one date per row, July 2025 through December 2026, first-of-month. No formulas, no narration — purely a lookup/reference list, most likely feeding a data-validation dropdown or pivot-table month grouping elsewhere in the workbook. Needs a row added roughly once a year to extend the range; otherwise untouched.

### 2.13 Share capital entry — the company's one-time opening capitalization — **manual, done once, essentially archival now**

15 rows. The real opening entry for INEMA's initial capitalization:

- **Assets contributed:** Bank 30,000,000; Prepaid rent 942,000; Caution 250,000; Computers & Equipment 1,500,000; Furniture 1,000,000 → Total assets 33,692,000.
- **Financed by:** Share Capital 30,000,000 (credit) + Shareholders' Loan 3,692,000 (credit).
- **Formal double entry (columns L–O):** Dr PPE 2,500,000 (= Computers + Furniture) · Dr Prepaid Rent 942,000 · Dr Bank Accounts 30,000,000 · Dr Caution 250,000, against Cr Share Capital 30,000,000 · Cr Shareholders' Loan 3,692,000 — balances exactly.

This is the real work-out behind the January-2026 PPE/Caution/opening-balance entries that appear at the very start of the Journal sheet. **One open item worth Kevin verifying directly:** I could not re-confirm in this session whether `iacm_opening_balances`' real stored figure for account 2030 (Shareholders' Loan) matches this sheet's 3,692,000 exactly — that table lives in Postgres, not in this workbook, and I did not re-query it as part of this study. Worth a direct check since it's the actual number every `getAccountBalance()` call is built on.

---

## Part 2 — Cross-reference findings (Journal vs. the real code)

- **Structural match is excellent.** Every real transaction-type pattern in Part 1 (§1.4) shows up in the Journal sample exactly as the code would produce it — account codes, account names, and even the fee/interest/principal split logic for payments.
- **Two minor, cosmetic-only naming inconsistencies**, neither a real accounting problem: `"Loan issued"` (row 402) vs. `"Loan Issued"` (row 768) — inconsistent capitalization across different points in the period; and `"Bank charges"` (row 411, Accounts-sheet-style name) vs. `"Bank Charges & Commissions"` (row 769, the exact `EXPENSE_ACCOUNTS` string) for the same code 6280. The second one is actually useful evidence: it suggests the April "Internal transfer charges" entry (row 411) predates the `bank_charges` expense category being wired up in the code, while the July "account maintenance charges" entry (row 769) was posted through the real expense route using its exact account-name string.
- **The Accounts sheet's aspirational codes (§1.2) are never used** — confirmed nowhere in either the code or the 776-row Journal sample. Not a bug; just confirms the sheet is a forward-looking master list, not a report of what's active today.
- **No accrued-interest journal entries found** matching the Interest Calculations sheet's figures — flagged as an open question in §2.10.

---

## Part 3 — The real workflow: what's automated, what's manual, and in what order

### The most important thing to get right: how the template file actually works

Because every export starts from `public/journal_template.xlsx` and only ever rewrites the Journal sheet (§Executive Summary), **any manual work done on Accounts, Interest Calculations, Sheet1, Sheet3, Sheet5, Sheet6, Months, or Share capital entry inside a downloaded copy of this file does not automatically persist.** The next time anyone downloads a fresh copy from the app, those sheets come back exactly as they exist in `public/journal_template.xlsx` on the server — not as they were last saved on someone's Desktop.

`git log` on that file shows it has been touched exactly twice, both for a technical bug fix ("Fix corrupt xlsx downloads: strip Excel Tables"), never to carry forward new manual content. **This means whoever has been doing the manual VAT/interest/prepaid-rent work needs a real, deliberate process to feed their updates back into `public/journal_template.xlsx` (a code change + deploy) for that work to survive the next export** — otherwise every fresh download quietly resets those sheets to a stale baseline. This is worth confirming directly with Kevin/Devotha: is there already a process for this that I simply have no visibility into (e.g. someone manually replacing the template file outside of git), or has manual work been accumulating only in personal Desktop copies that a future export would silently overwrite?

### What needs zero manual touch

- **Journal** — always fresh from Postgres. Never hand-edit; it will be discarded.
- **Detail1, Sheet2, Sheet4, Q1TB** — pure PivotTables sourced from the Journal sheet's own cells. After a fresh export, opening the file in real Excel and running **Data → Refresh All** brings them current. No retyping, ever.
- **Accounts, Months** — static reference lists. Touch only when a genuinely new GL code is introduced, or once a year to extend the Months list.
- **Share capital entry** — a one-time historical record. Done; no reason to touch it again unless new share capital is actually raised.

### What's genuinely manual, and why

- **Interest Calculations** — computing accrued interest for overdue loans at month/quarter end. Genuinely necessary (no automated equivalent exists), but see the open question in §2.10: confirm whether these figures are meant to become real journal entries, and if so, make sure that's actually happening — right now there's no evidence in the Journal data that they are.
- **Sheet1** — the prepaid-rent/VAT split calculation. Confirm with Kevin whether the app's own `split-expense` feature (§1.4, §2.11) is the one actually producing the recurring Sheet6 rent-recognition entries. If it is, this manual calculation is redundant and can stop. If it isn't, it should keep being done exactly as-is.
- **Sheet3, Sheet5, Sheet6** — VAT Control Account reconciliation and RRA-filing support. Sheet6 is the master working T-account; Sheet3 is a client-attributed extract of it for a specific period; Sheet5 is an independent arithmetic check on Sheet3. Real, necessary quarterly work to support the actual VAT return filed with RRA.

### Recommended real order for a month/quarter close

1. **Confirm every real transaction for the period was entered through the actual IACM app** (disbursements, payments, expenses, salary accrual + payment, cash transfers, shareholder loans) — the app's Postgres tables are the real system of record, not this spreadsheet.
2. **Download a fresh Journal export** from the app (`/api/admin/iacm/journal/export`) — this is the only way the Journal sheet reflects the period's real activity.
3. **Open it in real Excel and Refresh All PivotTables** (Detail1, Sheet2, Sheet4, and — quarterly only — copy a fresh Q1TB-style snapshot for the quarter that just closed).
4. **Check the Sheet2/Sheet4 Grand Total rows balance** (debit = credit) before doing anything else with the numbers. If they don't, something in the period's postings is wrong and needs investigating before any figure from this file is trusted or filed.
5. **Compute Interest Calculations** for any loans overdue at period end, and confirm (per the open question above) whether that needs a real journal entry posted, or is tracking-only.
6. **Handle any prepaid-rent recognition for the period** — via the app's split-expense feature if that's confirmed as the active mechanism, or via Sheet1's manual calculation if not.
7. **Quarterly: reconcile Sheet6 against the actual VAT return** being filed with RRA, using Sheet3/Sheet5 as the supporting client-level breakdown.
8. **Before ending the session, feed any real changes made to the manual sheets back into `public/journal_template.xlsx`** (via a real code change/deploy) — otherwise, per the warning above, this period's manual work will not survive the next export.

---

*This document was produced by reading `lib/ledger.ts` in full, every real `postJournalEntry()` call site in `app/api/admin/iacm/`, the real `journal/export/route.ts`, and all 776 rows / 13 sheets of the real `INEMA_Journal_Q3_2026.xlsx` file directly. Three items are flagged above as genuinely open — not resolved by inspection — and are called out explicitly rather than guessed at: (1) whether Interest Calculations' accrued-interest figures are ever posted as real journal entries, (2) whether the app's split-expense feature or Sheet1's manual calculation is the one actually driving the recurring rent-recognition entries, and (3) whether `iacm_opening_balances`' real stored figure for account 2030 matches the Share capital entry sheet's 3,692,000.*

---

## Addendum (2026-09-08, same day) — two follow-up questions, investigated with direct evidence

### 1. Correction to the original Executive Summary: the manual sheets do NOT come back blank

I opened `public/journal_template.xlsx` — the real file the export route reads from — directly and dumped every sheet. **All 12 non-Journal sheets are fully populated**, and every one of them has the exact same row count as Kevin's Desktop copy (Interest Calculations 27, Accounts 67, Months 19, Share capital entry 15, Sheet1 28, Detail1 68, Sheet2/Sheet4/Q1TB 28 each, Sheet3 18, Sheet5 18, Sheet6 34) — and the content I sampled from each is identical, cell for cell, to what's in Kevin's Desktop file.

**So the precise, honest answer: no, a fresh export today would not blank out Accounts, Interest Calculations, Sheet1, Sheet3, Sheet5, Sheet6, Months, or Share capital entry.** My original wording ("come back reset to a stale baseline") was directionally right but imprecise — I hadn't actually opened the template file when I wrote it. Having now opened it: those sheets come back **exactly as they were baked into `public/journal_template.xlsx` on 2026-07-30** (`git log` shows only two commits ever touched that file, both technical, neither a content update). If nobody has hand-edited any of those 12 sheets in a downloaded copy since July 30, there is currently no drift and nothing has been lost. **The real risk is prospective, not retrospective**: the moment someone *does* edit one of those sheets in a downloaded copy and doesn't feed that edit back into the deployed template file, the next export will silently revert it. Worth Kevin confirming whether any such manual edits have happened since July 30 in a Desktop copy that were never pushed back to the template.

### 2. Kevin's structural-link finding — confirmed, with the exact mechanism

**a. Does the Journal sheet's account code/name have any real structural link to the Accounts sheet right now?**

**No — in the real, exported file (what Kevin has on his Desktop), Journal's account-code column is plain, independent text, with no formula and no data-validation link to the Accounts sheet.** Confirmed two ways:

- I re-checked the raw dump of Kevin's Desktop file: every Journal row's account-code cell (e.g. `D397="7010"`) is a bare literal — never a formula object.
- I directly inspected the Journal sheet's `dataValidations` — empty (`{}`). No dropdown exists on the account-code or account-name columns either.

**But here's the real, exact mechanism** — and it's more specific than "nobody built the link":

The **template file itself**, before the export code touches it, still carries its own original historical rows (rows 3 onward, left over from however the template was first built), and **those rows do have a real, working link**: column D is a genuine formula, `=IFERROR(VLOOKUP(E3,Accounts!$B$2:$C$66,2,FALSE),0)` — deriving the account code from whatever text is typed into column E, against the real Accounts sheet. So whoever originally built this workbook (almost certainly Devotha) **did** design it with a real structural link.

**The export route destroys that link on every single real export.** In `journal/export/route.ts`:

```js
const values = [monthLabel(r.date), dayLabel(r.date), r.narration, r.accountCode, r.accountName, r.debit || null, r.credit || null]
values.forEach((v, idx) => {
  const c = idx + 1
  const cell = row.getCell(c)
  cell.value = v   // <- writes r.accountCode as a literal value, not the template's VLOOKUP formula
  ...
})
```

`r.accountCode` is a plain string pulled straight from the real `iacm_journal_lines.account_code` column in Postgres. Every export wipes the template's formula-based rows and replaces them with literal values — so the link isn't merely absent by original design, **it's actively overwritten every time the file is regenerated.**

**b. Is this a real, genuine drift risk?**

Yes, and it isn't hypothetical — this document's own Part 2 cross-reference section already caught a live example: account **6280** is called `"Bank charges "` in the real Accounts sheet, but the app's own `EXPENSE_ACCOUNTS` map (`lib/ledger.ts`) calls the same code `"Bank Charges & Commissions"` — and both real spellings show up in the actual Journal data (row 411 vs. row 769) for the exact same account code. Nothing anywhere currently checks that a code and its name stay paired consistently across the app's route files, `CHART_OF_ACCOUNTS`, and the Accounts sheet.

It's worth being precise about *where* the real single source of truth actually lives, because the Excel-internal link is the narrower of two real risks:

- **Narrower risk (inside the workbook):** if the Accounts sheet's own text for a code is ever edited, nothing in the Journal sheet would reflect it or flag a mismatch, because Journal no longer references Accounts at all post-export.
- **Deeper risk (inside the app):** the actual `account_code`/`account_name` pairs are hardcoded as literal string pairs, independently, in at least three separate places — each route file's inline object literals (e.g. `{ account_code: '2530', account_name: 'VAT Control Account' }`, repeated across 9+ files), `CHART_OF_ACCOUNTS` in `lib/ledger.ts`, and the Excel Accounts sheet. None of these three references any of the others. Restoring the Excel-internal VLOOKUP link (below) only protects against a typo inside the spreadsheet — it does nothing to catch a name drifting across those three code-level copies, which is exactly what already happened with 6280.

**c. Proposed concrete fix — two layers, immediate and structural**

**Immediate, cheap, real fix (Excel-level):** change the export route to write a formula into column D instead of a literal value, restoring exactly what the template's own original design already had:

```js
// column D (index 3, c=4): derive from column E via the same VLOOKUP the
// template's own original rows used, instead of overwriting with a literal
const codeCell = row.getCell(4)
codeCell.value = { formula: `IFERROR(VLOOKUP(E${rowNum},Accounts!$B$2:$C$66,2,FALSE),0)`, result: Number(r.accountCode) || r.accountCode } as any
codeCell.style = styleByCol[4]
if (numFmtByCol[4]) codeCell.numFmt = numFmtByCol[4]
```
(leaving columns A/B/C/E/F/G exactly as they are today, all still literal values). Real Excel recalculates formulas on open by default, so the `result` is only a fallback for viewers that don't recalc. This alone means: if the Accounts sheet's spelling for a code is ever edited, every Journal row for that code updates with it (or falls back to `0` and becomes visibly wrong, which is the correct failure mode — loud, not silent). **This is a genuinely small, safe, real change — I have not made it yet; it needs your go-ahead before I implement, test, and deploy it, the same way every other fix this investigation has produced went through you first.**

**Structural, more durable fix (app-level, larger, not proposed for immediate action):** consolidate the account-code/name pairs that are currently duplicated across every route file's inline literals and `CHART_OF_ACCOUNTS` into one real registry in `lib/ledger.ts` (a superset covering every 6xxx/7xxx/2xxx code actually posted to, not just the 18 balance-sheet accounts), and have every route resolve `account_name` from that registry by code — the same pattern `accountByCode()` already enforces for manual entries — rather than writing a literal name string. That removes the deeper, three-copies-of-the-truth risk entirely, not just its Excel-visible symptom. This is a real, larger refactor across 9+ files, not something to do casually — flagging it here as the correct long-term direction, not proposing it as tonight's task.

### 3. Real database queries to close out the three open items — ready to run

I don't currently have the INEMA database credential (`.env.local` no longer exists in the repo — see the note at the end of this document), so I could not run these myself tonight. These are exact, schema-verified queries (confirmed directly against `lib/ledger.ts` and `supabase.sql`) for Kevin to run in the Supabase SQL Editor.

**Open item 1 — do Interest Calculations' accrued-interest figures ever become real journal entries?**

Concrete test case: the sheet shows BIGIRIMANA Desire, loan 3,000,000, "accrued interest for 3 months (October to December)" = 450,000, calculated as of a sheet-date around 2026-04-02.

```sql
select e.entry_date, e.narration, e.entry_type, l.account_code, l.account_name, l.debit_amount, l.credit_amount
from iacm_journal_entries e
join iacm_journal_lines l on l.journal_entry_id = e.id
where e.narration ilike '%bigirimana%' or e.narration ilike '%accrued%' or e.narration ilike '%accrual%'
order by e.entry_date;
```
If this returns nothing for Bigirimana around the relevant dates (or nothing at all with "accrued"/"accrual" in the narration, across the whole table), that's real, direct evidence the accrued-interest figures are tracking-only and never posted.

**Open item 2 — does the app's split-expense feature or Sheet1's manual math drive the recurring rent-recognition entries?**

```sql
select e.id, e.entry_date, e.narration, e.entry_type, e.reference, e.created_by,
       l.account_code, l.account_name, l.debit_amount, l.credit_amount
from iacm_journal_entries e
join iacm_journal_lines l on l.journal_entry_id = e.id
where e.narration ilike '%recognition of rent%'
order by e.entry_date, l.account_code;
```
The split-expense route always posts the same real 3-or-4-line shape (3050 debit / 6210 debit / 2530 debit / cash credit) as one entry. If the real rows match that shape exactly, the app feature is what's producing them — Sheet1 would then be redundant, duplicate manual work. If instead each "Recognition of rent" entry is `entry_type = 'manual'` or has a different line shape, that's evidence it's still being hand-entered via Sheet1's numbers through the generic manual-journal screen.

**Open item 3 — does `iacm_opening_balances` for account 2030 (Shareholders' Loan) match the Share capital entry sheet's 3,692,000?**

```sql
select account_code, account_name, debit_balance, credit_balance, as_of_date
from iacm_opening_balances
where account_code in ('1010', '2030', '3020', '3050', '3060', '3210')
order by account_code;
```
This directly answers the 2030 question and, as a bonus, checks all five other real figures from the Share capital entry sheet (Share Capital 30,000,000 / Bank 30,000,000 / Prepaid Rent 942,000 / Caution 250,000 / PPE 2,500,000) against Postgres in one pass — a genuine, complete reconciliation of that sheet, not just the one figure originally in question.

### Credential note

`inema-backend/.env.local` — the file holding the temporary, explicitly-scoped service-role credential used for this entire investigation — no longer exists in the repository as of this check. I did not just delete it as part of this session; it was already absent when I looked. I have no way to confirm from here whether that means it was cleaned up earlier, or never persisted the way it was originally described — either way, there is currently nothing on disk to delete, and no further credential-cleanup action is needed.
