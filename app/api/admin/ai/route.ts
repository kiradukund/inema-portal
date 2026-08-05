import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdminApi } from "@/lib/admin";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { message } = await req.json();
    const supabase = await createServerSupabaseClient();

    // Fetch all real data
    // NOTE: imported_loans/imported_clients here are the same confirmed-
    // stale tables excluded from the main dashboard tonight (frozen at an
    // 11-Jun-2026 fake bulk import) — this whole route is very likely
    // producing garbage business analysis right now, not just the expenses
    // figure below. Left as a flagged follow-up, not expanded into here.
    const [{ data: loans }, { data: clients }, { data: deadlines }] = await Promise.all([
      supabase.from("imported_loans").select("*"),
      supabase.from("imported_clients").select("*"),
      supabase.from("compliance_deadlines").select("*").eq("is_done", false),
    ]);

    const allLoans = loans ?? [];
    // expenses (old table) removed — confirmed its data was the hardcoded
    // SEED_EXPENSES fallback from the now-deleted /admin/upload feature,
    // never real. No iacm_expenses-based replacement wired in here yet.
    const allExpenses: { amount?: number; category?: string; month?: string }[] = [];
    const allClients = clients ?? [];

    // Calculate key metrics
    const totalDisbursed = allLoans.reduce((s, l) => s + (l.principal ?? 0), 0);
    const totalCollected = allLoans.reduce((s, l) => s + (l.amount_paid ?? 0), 0);
    const totalOutstanding = allLoans.filter(l => l.status !== "paid").reduce((s, l) => s + ((l.total_due ?? 0) - (l.amount_paid ?? 0)), 0);
    const paidLoans = allLoans.filter(l => l.status === "paid");
    const activeLoans = allLoans.filter(l => l.status === "active" || l.status === "partial");
    const overdueLoans = allLoans.filter(l => l.status !== "paid" && l.repayment_date && new Date(l.repayment_date) < new Date());
    const totalExpenses = allExpenses.reduce((s, e) => s + (e.amount ?? 0), 0);
    const grossIncome = allLoans.reduce((s, l) => {
      const fee = (l.principal ?? 0) * 0.04 * 1.18;
      const interest = (l.principal ?? 0) * 0.05 * (l.term_months ?? 1);
      const total = fee + interest;
      if (l.status === "paid") return s + total;
      return s + total * ((l.amount_paid ?? 0) / (l.total_due ?? 1));
    }, 0);
    const netProfit = grossIncome - totalExpenses;

    // Build context for Claude
    const context = `
You are the AI business analyst for INEMA Financial Solutions Ltd, a licensed microfinance company in Rwanda.
You have FULL ACCESS to their real business data. Be direct, specific, and give actionable advice in the style of a CFO.
Always use RWF amounts. Be concise but thorough. Use bullet points where helpful.

=== CURRENT BUSINESS DATA (as of today) ===

PORTFOLIO SUMMARY:
- Total loans disbursed: RWF ${totalDisbursed.toLocaleString()} (${allLoans.length} loans, ${allClients.length} clients)
- Total collected: RWF ${totalCollected.toLocaleString()} (${paidLoans.length} fully paid)
- Outstanding: RWF ${totalOutstanding.toLocaleString()} (${activeLoans.length} active loans)
- Gross income: RWF ${Math.round(grossIncome).toLocaleString()}
- Total expenses: RWF ${totalExpenses.toLocaleString()}
- Net profit: RWF ${Math.round(netProfit).toLocaleString()}
- Current bank balance: ~RWF 2,511,321

OVERDUE LOANS (${overdueLoans.length} loans — CRITICAL):
${overdueLoans.map(l => `- ${l.client_name}: RWF ${((l.total_due ?? 0) - (l.amount_paid ?? 0)).toLocaleString()} outstanding, was due ${l.repayment_date}`).join("\n") || "None"}

ACTIVE LOANS:
${activeLoans.map(l => `- ${l.client_name}: ${l.loan_num ?? ""} loan, principal RWF ${(l.principal ?? 0).toLocaleString()}, paid RWF ${(l.amount_paid ?? 0).toLocaleString()} of RWF ${(l.total_due ?? 0).toLocaleString()}, due ${l.repayment_date}`).join("\n")}

UPCOMING COMPLIANCE DEADLINES:
${(deadlines ?? []).slice(0, 5).map((d: { title: string; deadline_date: string }) => `- ${d.title}: due ${d.deadline_date}`).join("\n") || "None"}

EXPENSE BREAKDOWN (last entries):
${allExpenses.slice(-10).map(e => `- ${e.category}: RWF ${(e.amount ?? 0).toLocaleString()} (${e.month})`).join("\n")}

KEY RISKS:
- BAHATI Eric: RWF 3,243,000 due, ZERO payments since Feb 2026 (4+ months)
- Desire Demino 3rd: RWF 1,945,800 due, ZERO payments since Feb 2026
- HABINEZA Jean Marie 3rd: RWF 2,694,400 due June 24 2026 (THIS WEEK)
- Fabien 2nd loan: RWF 7,183,200 due July 22 2026 (largest single exposure)
- BIGIRIMANA Desire 2nd: RWF 3,591,600 due July 2 2026

BUSINESS CONTEXT:
- Company: INEMA Financial Solutions Ltd, Nyarugenge, Kigali
- License: BNR licensed microfinance
- Interest rate: 5% per month (first month 9% incl fees + 18% VAT)
- Expenses: ~RWF 805,000/month (salary RWF 352K + PAYE RWF 114K + RSSB RWF 74K + other)
`;

    // Call Anthropic API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: context,
        messages: [{ role: "user", content: message }],
      }),
    });

    const data = await response.json();
    const reply = data.content?.[0]?.text ?? "I couldn't generate a response. Please try again.";

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ reply: `Error: ${msg}` }, { status: 500 });
  }
}
