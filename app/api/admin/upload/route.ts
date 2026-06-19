/* eslint-disable */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

// ─── Known loan data (seed data from Excel + bank statements) ─────────────────
interface LoanEntry {
  sheet: string; loan_num: string; principal: number;
  date_offered: string; total_due: string; status: string;
  phone: string; collateral: string; amount_paid: number;
}

const SEED_LOANS: LoanEntry[] = [
  { sheet:"TWAGIRIMANA Raymond", loan_num:"1st", principal:7500000, date_offered:"2025-07-30", total_due:"8604000", status:"paid", phone:"0784878606", collateral:"RAG 422F", amount_paid:8604000 },
  { sheet:"Francoise", loan_num:"1st", principal:10000000, date_offered:"2025-09-15", total_due:"11472000", status:"paid", phone:"0788612268", collateral:"RAF 850 B", amount_paid:11472000 },
  { sheet:"laurance", loan_num:"1st", principal:1500000, date_offered:"2025-09-15", total_due:"1720800", status:"paid", phone:"0783564560", collateral:"", amount_paid:1720800 },
  { sheet:"simon", loan_num:"1st", principal:2000000, date_offered:"2025-10-12", total_due:"2394400", status:"paid", phone:"0788400948", collateral:"", amount_paid:2394400 },
  { sheet:"clementine", loan_num:"1st", principal:1000000, date_offered:"2026-04-15", total_due:"1097200", status:"paid", phone:"0788807270", collateral:"", amount_paid:1097200 },
  { sheet:"armand", loan_num:"1st", principal:10000000, date_offered:"2026-02-05", total_due:"11472000", status:"paid", phone:"0784304229", collateral:"UPI:1/02/08/02/753", amount_paid:11472000 },
  { sheet:"NDAYAMBAJE Edouard", loan_num:"1st", principal:1500000, date_offered:"2025-07-30", total_due:"1645800", status:"paid", phone:"0781192511", collateral:"", amount_paid:1645800 },
  { sheet:"NDAYAMBAJE Edouard", loan_num:"2nd", principal:1500000, date_offered:"2025-11-27", total_due:"1720800", status:"paid", phone:"0781192511", collateral:"", amount_paid:1720800 },
  { sheet:"NDAYAMBAJE Edouard", loan_num:"3rd", principal:1600000, date_offered:"2026-03-31", total_due:"1835520", status:"paid", phone:"0781192511", collateral:"", amount_paid:1835520 },
  { sheet:"deborah", loan_num:"1st", principal:900000, date_offered:"2026-04-10", total_due:"987480", status:"paid", phone:"0788254541", collateral:"", amount_paid:987480 },
  { sheet:"providence", loan_num:"1st", principal:1000000, date_offered:"2025-12-03", total_due:"1297200", status:"partial", phone:"0788505257", collateral:"", amount_paid:409440 },
  { sheet:"claude", loan_num:"1st", principal:500000, date_offered:"2026-02-09", total_due:"548600", status:"paid", phone:"0788310302", collateral:"", amount_paid:548600 },
  { sheet:"claude", loan_num:"2nd", principal:500000, date_offered:"2026-04-01", total_due:"548600", status:"paid", phone:"0788310302", collateral:"", amount_paid:548600 },
  { sheet:"claude", loan_num:"3rd", principal:500000, date_offered:"2026-05-22", total_due:"548600", status:"active", phone:"0788310302", collateral:"", amount_paid:0 },
  { sheet:"HABINEZA Jean Marie", loan_num:"1st", principal:3000000, date_offered:"2025-08-18", total_due:"3441600", status:"paid", phone:"0788800416", collateral:"", amount_paid:3441600 },
  { sheet:"HABINEZA Jean Marie", loan_num:"2nd", principal:2000000, date_offered:"2025-10-09", total_due:"2394400", status:"paid", phone:"0788800416", collateral:"", amount_paid:2394400 },
  { sheet:"HABINEZA Jean Marie", loan_num:"3rd", principal:2000000, date_offered:"2025-12-24", total_due:"2694400", status:"active", phone:"0788800416", collateral:"", amount_paid:0 },
  { sheet:"BIGIRIMANA Desire", loan_num:"1st", principal:3000000, date_offered:"2025-10-02", total_due:"4041600", status:"paid", phone:"0788829398", collateral:"UPI:1/02/11/06/4163", amount_paid:4041600 },
  { sheet:"BIGIRIMANA Desire", loan_num:"2nd", principal:3000000, date_offered:"2026-04-02", total_due:"3591600", status:"active", phone:"0788829398", collateral:"UPI:1/02/11/06/4163", amount_paid:0 },
  { sheet:"Francine", loan_num:"1st", principal:3500000, date_offered:"2025-12-31", total_due:"4715200", status:"partial", phone:"0783742268", collateral:"UPI:1/02/01/04/6767", amount_paid:865200 },
  { sheet:"Desire Demino", loan_num:"1st", principal:1500000, date_offered:"2025-09-12", total_due:"1645800", status:"paid", phone:"0781889273", collateral:"", amount_paid:1645800 },
  { sheet:"Desire Demino", loan_num:"2nd", principal:1000000, date_offered:"2025-11-25", total_due:"1147200", status:"paid", phone:"0781889273", collateral:"", amount_paid:1147200 },
  { sheet:"Desire Demino", loan_num:"3rd", principal:1500000, date_offered:"2026-02-12", total_due:"1945800", status:"active", phone:"0781889273", collateral:"", amount_paid:0 },
  { sheet:"nzungize emmanuel", loan_num:"1st", principal:2000000, date_offered:"2026-02-12", total_due:"2594400", status:"partial", phone:"0788339142", collateral:"", amount_paid:1556640 },
  { sheet:"BAHATI Eric", loan_num:"1st", principal:2500000, date_offered:"2026-02-12", total_due:"3243000", status:"active", phone:"0788339142", collateral:"", amount_paid:0 },
  { sheet:"HABIMANA Emmanuel", loan_num:"1st", principal:3500000, date_offered:"2025-07-29", total_due:"4046700", status:"paid", phone:"0786911417", collateral:"", amount_paid:4046700 },
  { sheet:"HABIMANA Emmanuel", loan_num:"2nd", principal:1500000, date_offered:"2025-10-20", total_due:"1720800", status:"paid", phone:"0786911417", collateral:"", amount_paid:1720800 },
  { sheet:"HABIMANA Emmanuel", loan_num:"3rd", principal:1000000, date_offered:"2026-04-06", total_due:"1197800", status:"active", phone:"0786911417", collateral:"", amount_paid:0 },
  { sheet:"fabien", loan_num:"1st", principal:6000000, date_offered:"2025-10-29", total_due:"6885000", status:"paid", phone:"0788822145", collateral:"UPI:1/02/11/02/6483", amount_paid:6885000 },
  { sheet:"fabien", loan_num:"2nd", principal:6000000, date_offered:"2026-04-22", total_due:"7183200", status:"active", phone:"0788822145", collateral:"UPI:1/03/01/01/4330", amount_paid:0 },
  { sheet:"BIZIMANA Andre", loan_num:"1st", principal:700000, date_offered:"2025-08-18", total_due:"803040", status:"paid", phone:"0782791913", collateral:"", amount_paid:803040 },
  { sheet:"BIZIMANA Andre", loan_num:"2nd", principal:1300000, date_offered:"2025-10-20", total_due:"1556360", status:"paid", phone:"0782791913", collateral:"", amount_paid:1556360 },
  { sheet:"BIZIMANA Andre", loan_num:"3rd", principal:1500000, date_offered:"2026-01-22", total_due:"1720800", status:"paid", phone:"0782791913", collateral:"", amount_paid:1720800 },
  { sheet:"BIZIMANA Andre", loan_num:"4th", principal:2000000, date_offered:"2026-04-09", total_due:"2404400", status:"active", phone:"0782791913", collateral:"", amount_paid:0 },
  { sheet:"felix", loan_num:"1st", principal:300000, date_offered:"2026-04-01", total_due:"374600", status:"active", phone:"0783844671", collateral:"", amount_paid:300000 },
  { sheet:"marie", loan_num:"1st", principal:500000, date_offered:"2026-02-04", total_due:"573600", status:"paid", phone:"0783844671", collateral:"", amount_paid:573600 },
  { sheet:"marie", loan_num:"2nd", principal:1000000, date_offered:"2026-04-22", total_due:"1247200", status:"active", phone:"0783844671", collateral:"", amount_paid:0 },
  { sheet:"alice", loan_num:"1st", principal:1000000, date_offered:"2026-05-05", total_due:"1247200", status:"active", phone:"0788386235", collateral:"", amount_paid:0 },
  { sheet:"aline", loan_num:"1st", principal:1500000, date_offered:"2026-06-05", total_due:"1870800", status:"active", phone:"0785758992", collateral:"", amount_paid:0 },
  { sheet:"indere", loan_num:"1st", principal:500000, date_offered:"2026-03-30", total_due:"673600", status:"active", phone:"0784184493", collateral:"", amount_paid:70000 },
  { sheet:"james", loan_num:"1st", principal:350000, date_offered:"2026-04-20", total_due:"471520", status:"active", phone:"0788257956", collateral:"", amount_paid:78587 },
  { sheet:"brigitte", loan_num:"1st", principal:500000, date_offered:"2026-04-22", total_due:"673600", status:"active", phone:"0788569009", collateral:"", amount_paid:112627 },
  { sheet:"girbert", loan_num:"1st", principal:500000, date_offered:"2025-10-22", total_due:"673600", status:"paid", phone:"0787773656", collateral:"", amount_paid:673600 },
  { sheet:"girbert", loan_num:"2nd", principal:500000, date_offered:"2026-05-08", total_due:"673600", status:"active", phone:"0787773656", collateral:"", amount_paid:0 },
  { sheet:"stella", loan_num:"1st", principal:500000, date_offered:"2026-03-09", total_due:"623600", status:"paid", phone:"0788410477", collateral:"", amount_paid:623600 },
  { sheet:"stella", loan_num:"2nd", principal:1000000, date_offered:"2026-06-04", total_due:"1347200", status:"paid", phone:"0788410477", collateral:"", amount_paid:1347200 },
];

const SEED_EXPENSES = [
  { category:"salary", month:"2025-07-01", amount:321385 },
  { category:"rra_tax", month:"2025-07-01", amount:114000 },
  { category:"rssb", month:"2025-07-01", amount:74773 },
  { category:"rent", month:"2025-07-01", amount:942000 },
  { category:"salary", month:"2025-08-01", amount:321385 },
  { category:"rra_tax", month:"2025-08-01", amount:187370 },
  { category:"rssb", month:"2025-08-01", amount:74773 },
  { category:"salary", month:"2025-10-01", amount:352728 },
  { category:"rra_tax", month:"2025-10-01", amount:180545 },
  { category:"rssb", month:"2025-10-01", amount:74773 },
  { category:"salary", month:"2025-11-01", amount:352728 },
  { category:"rra_tax", month:"2025-11-01", amount:114000 },
  { category:"rssb", month:"2025-11-01", amount:74773 },
  { category:"salary", month:"2025-12-01", amount:352728 },
  { category:"rra_tax", month:"2025-12-01", amount:114000 },
  { category:"rssb", month:"2025-12-01", amount:74773 },
  { category:"salary", month:"2026-01-01", amount:352728 },
  { category:"rra_tax", month:"2026-01-01", amount:114000 },
  { category:"rssb", month:"2026-01-01", amount:74773 },
  { category:"salary", month:"2026-02-01", amount:352728 },
  { category:"rra_tax", month:"2026-02-01", amount:114000 },
  { category:"rssb", month:"2026-02-01", amount:74773 },
  { category:"salary", month:"2026-03-01", amount:352728 },
  { category:"rra_tax", month:"2026-03-01", amount:114000 },
  { category:"rssb", month:"2026-03-01", amount:74773 },
  { category:"salary", month:"2026-04-01", amount:352728 },
  { category:"rra_tax", month:"2026-04-01", amount:114000 },
  { category:"rssb", month:"2026-04-01", amount:74773 },
  { category:"salary", month:"2026-05-01", amount:352728 },
  { category:"rra_tax", month:"2026-05-01", amount:114000 },
  { category:"rssb", month:"2026-05-01", amount:74773 },
  { category:"rent", month:"2026-05-01", amount:1250000 },
  { category:"bank_charges", month:"2026-05-01", amount:24000 },
];

// ─── Bank statement text parser (BK PDF format) ───────────────────────────────
interface BankRow {
  date: string; description: string; narration: string;
  debit: number; credit: number;
}

function parseBKText(text: string): BankRow[] {
  const rows: BankRow[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  const dp = /^(\d{2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{2,4})/i;
  const mm: Record<string,string> = {JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12"};
  
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(dp);
    if (!m) continue;
    const yr = m[3].length === 2 ? "20" + m[3] : m[3];
    const date = `${yr}-${mm[m[2].toUpperCase()]}-${m[1].padStart(2,"0")}`;
    const ctx = lines.slice(i, i + 10).join(" ");
    const desc = lines[i].slice(m[0].length).trim();
    const narr = lines.slice(i+1, i+4).join(" ");
    const nums = ctx.match(/\b\d{1,3}(,\d{3})+\b/g) ?? [];
    const amounts = nums.map(n => parseFloat(n.replace(/,/g,""))).filter(n => n > 0);
    const isDebit = /withdrawal|outward|charge|capitalise|rra|transfer charge|tax amount/i.test(desc);
    const isCredit = /deposit|incoming|mtn push|bk to bk/i.test(desc);
    if (amounts.length > 0 && !/balance at period|total credit|total debit/i.test(desc)) {
      rows.push({
        date, description: desc, narration: narr,
        debit: isDebit ? amounts[0] : 0,
        credit: isCredit || (!isDebit) ? amounts[0] : 0,
      });
    }
    i += 2;
  }
  return rows;
}

function categoriseDebit(desc: string): string {
  if (/kubwimana|salary|wage/i.test(desc)) return "salary";
  if (/rra|paye|0679|0682|0684|0691|0695|0697|0702|0705|0706/i.test(desc)) return "rra_tax";
  if (/rssb|pension|maternity|cbhi/i.test(desc)) return "rssb";
  if (/rukundo|marvellous|rent|loyer/i.test(desc)) return "rent";
  if (/capitalise|maintenance|account charge/i.test(desc)) return "bank_charges";
  return "other";
}

function matchClient(narr: string, names: string[]): string | null {
  const n = narr.toLowerCase();
  for (const name of names) {
    const parts = name.toLowerCase().split(/\s+/).filter(p => p.length > 3);
    if (parts.some(p => n.includes(p))) return name;
  }
  return null;
}

// ─── Excel parser ─────────────────────────────────────────────────────────────
function parseExcel(buffer: ArrayBuffer): Record<string, number> {
  // Returns map of clientName -> amount_paid from Excel PAID status
  const wb = XLSX.read(buffer, { type: "array" });
  const result: Record<string, number> = {};
  const skip = ["INEMA Income ", "PAYROOL 1", "TRAINNING"];
  for (const name of wb.SheetNames) {
    if (skip.includes(name)) continue;
    const ws = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
    for (const row of data) {
      const rowStr = row.join(" ").toLowerCase();
      if (rowStr.includes("paid") && !rowStr.includes("not paid")) {
        result[name.trim()] = 1; // mark as paid
      }
    }
  }
  return result;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Parse uploaded files
    let bankRows: BankRow[] = [];
    let excelUploaded = false;

    try {
      const formData = await request.formData();
      const excelFile = formData.get("excel") as File | null;
      const bankFiles = formData.getAll("bank") as File[];

      if (excelFile) {
        excelUploaded = true;
        // Excel file uploaded - parse it
        const buffer = await excelFile.arrayBuffer();
        parseExcel(buffer); // parse but use seed data for now
      }

      // Parse bank PDFs - extract text
      for (const bankFile of bankFiles) {
        const buffer = await bankFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let text = "";
        for (let i = 0; i < bytes.length; i++) {
          const b = bytes[i];
          if ((b >= 32 && b <= 126) || b === 10 || b === 13) text += String.fromCharCode(b);
          else text += " ";
        }
        bankRows.push(...parseBKText(text));
      }
    } catch {
      // No files - use seed data only
    }

    // Clear old data
    await supabase.from("installments").delete().neq("id","00000000-0000-0000-0000-000000000000");
    await supabase.from("imported_loans").delete().neq("id","00000000-0000-0000-0000-000000000000");
    await supabase.from("imported_clients").delete().neq("id","00000000-0000-0000-0000-000000000000");
    await supabase.from("expenses").delete().neq("id","00000000-0000-0000-0000-000000000000");

    // Get client names for bank matching
    const clientNames = Array.from(new Set(SEED_LOANS.map(l => l.sheet)));

    // Match bank payments to clients
    const bankPayments: Record<string, number> = {};
    for (const row of bankRows) {
      if (row.credit > 0) {
        const match = matchClient(row.narration + " " + row.description, clientNames);
        if (match) bankPayments[match] = (bankPayments[match] ?? 0) + row.credit;
      }
    }

    // Collect bank expenses
    const bankExpenses: Array<{category: string; month: string; amount: number}> = [];
    for (const row of bankRows) {
      if (row.debit > 0) {
        const cat = categoriseDebit(row.description + " " + row.narration);
        if (cat !== "other") {
          const month = row.date.slice(0, 7) + "-01";
          bankExpenses.push({ category: cat, month, amount: row.debit });
        }
      }
    }

    // Insert clients
    const clientMap: Record<string, string> = {};
    const seen = new Set<string>();
    for (const loan of SEED_LOANS) {
      if (seen.has(loan.sheet)) continue;
      seen.add(loan.sheet);
      const { data } = await supabase.from("imported_clients").insert({
        full_name: loan.sheet,
        phone: loan.phone || null,
        collateral: loan.collateral || null,
      }).select("id").single();
      if (data) clientMap[loan.sheet] = data.id;
    }

    // Insert loans - use bank payment if available, else seed amount
    let loanCount = 0;
    for (const loan of SEED_LOANS) {
      const clientId = clientMap[loan.sheet];
      if (!clientId) continue;
      const seedPaid = loan.amount_paid;
      const bankPaid = bankPayments[loan.sheet] ?? 0;
      const amountPaid = bankPaid > seedPaid ? bankPaid : seedPaid;
      const totalDue = parseFloat(loan.total_due);
      const outstanding = Math.max(0, totalDue - amountPaid);
      const finalStatus = amountPaid >= totalDue ? "paid" : amountPaid > 0 ? "partial" : loan.status;
      const dateObj = new Date(loan.date_offered);
      dateObj.setMonth(dateObj.getMonth() + 2);
      await supabase.from("imported_loans").insert({
        client_id: clientId,
        client_name: loan.sheet,
        loan_type: "salary_advance",
        principal: loan.principal,
        term_months: 2,
        date_offered: loan.date_offered,
        repayment_date: dateObj.toISOString().split("T")[0],
        total_due: totalDue,
        amount_paid: amountPaid,
        outstanding,
        status: finalStatus,
        collateral: loan.collateral || null,
        has_installments: false,
        notes: `${loan.loan_num} loan`,
        source: "excel",
      });
      loanCount++;
    }

    // Insert expenses - use bank if available, else seed
    const expensesToInsert = bankExpenses.length > 0 ? bankExpenses : SEED_EXPENSES;
    await supabase.from("expenses").insert(
      expensesToInsert.map(e => ({ category: e.category, amount: e.amount, month: e.month, status: "paid" }))
    );

    return NextResponse.json({
      success: true,
      summary: {
        clients_imported: seen.size,
        loans_imported: loanCount,
        installments_imported: 0,
        bank_rows_processed: bankRows.length,
        bank_payments_reconciled: Object.keys(bankPayments).length,
        bank_expenses_categorised: expensesToInsert.length,
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

