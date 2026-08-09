# Tenant-Isolation Inventory (Multi-Tenant / SaaS Feasibility)

**Date:** 2026-08-09
**Status:** Reference only. Multi-tenant/SaaS direction was evaluated and
**not pursued** based on this inventory. No schema changes or code were
written toward it. Kept here in case this direction gets revisited later,
so the next evaluation starts from real numbers instead of re-deriving them.

## Method

Every number below came from grepping the actual codebase and the live
RLS policy dump from the same night's security audit — not estimated.

## Scale of the change

- **109 Supabase query call sites**, across **42 files**, touching **16
  actively-queried tables** — every one of them has zero tenant filter
  today, because no tenant concept exists anywhere in this schema.
  Heaviest concentration: `app/api/admin/applications/[id]/{approve,reject}/route.ts`
  (8 call sites each), `app/api/admin/iacm/loans/route.ts` and
  `app/admin/page.tsx` (7 each).
- **19 tables** in the public schema (post `excel_uploads` drop), and
  **every one** would need a `tenant_id` column — there is no
  tenant-agnostic table in this schema, since the whole thing was built
  for exactly one company.

## Table-by-table

| Table | Current scope | Tenant-isolation need |
|---|---|---|
| `profiles` | `id = auth.uid()` | Anchor table — needs `tenant_id`; every other table's tenant check traces back to this one |
| `loans`, `loan_applications`, `repayment_schedules` | `client_id = auth.uid() OR is_admin()` | Needs `tenant_id`; client-scoped SELECT is probably still safe as-is (a user's `auth.uid()` only ever belongs to one tenant), but every `is_admin()`-gated INSERT/UPDATE/DELETE needs a tenant check added |
| `iacm_clients`, `iacm_loans`, `iacm_payments`, `iacm_expenses`, `iacm_journal_entries`, `iacm_journal_lines`, `iacm_opening_balances`, `iacm_payment_proofs` | `is_admin()` only | Needs `tenant_id` on every table, and the bare `is_admin()` check replaced with an admin-and-same-tenant check. **Biggest concentration of real risk** — "admin" is currently a global concept, not per-company |
| `imported_clients`, `imported_loans`, `installments`, `expenses` | `is_admin()` only | Same as above, though these are already legacy/frozen — worth deciding whether they even carry into a multi-tenant model at all |
| `contact_messages` | public INSERT, admin-only read | Needs `tenant_id` if the contact form becomes per-tenant (e.g. white-labeled per company) |
| `compliance_deadlines` | `is_admin()` only | Needs `tenant_id` — BNR deadlines are specific to one licensed entity |
| `audit_log` | Open INSERT (trigger-driven), admin SELECT | Needs `tenant_id`; both triggers (`audit_role_changes`, `audit_application_changes`) would need updating to stamp it |
| `loan-documents` storage bucket | Path-prefixed by `user.id` | Path convention would need a tenant segment too (`{tenant_id}/{user.id}/...`); both storage policies added the same night would need rewriting |

## The real crux: `is_admin()`

Used across essentially every admin-only policy in the schema, and baked
into `requireAdmin()`/`requireAdminApi()` in `lib/admin.ts`, which gate
all 15+ admin API routes and every admin page via the layout. In a
multi-tenant world, `is_admin()` alone is a **cross-tenant data leak by
construction** — an admin at Company A passes the exact same check
needed to touch Company B's `iacm_loans`, because the function has no
concept of which company anyone belongs to. It would need to become
`is_admin_for(tenant_id)`, and every call site — in RLS policies and in
`lib/admin.ts` — would need updating in lockstep, or the transition
period itself is a live vulnerability window.

## Bottom line

Not a bounded feature-sized task. A rewrite of the authorization model
the entire application is built on — every table, most of the app's
query surface, the two functions gating all admin access, and the
storage layer. Would need a deliberate transition plan (old and new
authorization coexisting during migration), not a single cutover.
