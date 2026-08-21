# SaaS-Readiness Notes

Running log of individual features built with a single-tenant assumption
baked in — no schema change, no tenant concept, nothing acted on. Exists so
a future multi-tenant evaluation has a feature-by-feature starting point
instead of re-auditing the whole codebase from scratch. See
`docs/tenant-isolation-inventory.md` for the full, one-time inventory of
what multi-tenant support would actually require across every table and
query site — this file only tracks new additions as they're built, not a
re-derivation of that analysis.

## Split Expense feature (2026-08-21)

`app/api/admin/iacm/split-expense/route.ts` and
`app/admin/iacm/split-expense/new/page.tsx` — like every other IACM route,
reads/writes `iacm_expenses`/`iacm_journal_entries`/`iacm_journal_lines`
with no tenant scoping, because none exists anywhere in this schema (see
the inventory doc's table-by-table breakdown — these three tables are
already listed there). No new exposure introduced by this feature
specifically; noted here only for completeness as new IACM surface area.
