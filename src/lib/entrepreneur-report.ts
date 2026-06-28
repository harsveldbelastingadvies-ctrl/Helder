import "server-only";

import { effectiveInvoiceStatus, type InvoiceStatus } from "./invoice";
import { getProfitLoss } from "./profit-loss";
import { supabaseSelect, supabaseSingle, usesSupabaseStorage } from "./supabase";
import { getVatSummary } from "./vat";

export type EntrepreneurReport = {
  companyName: string;
  owner: string;
  year: number;
  createdAt: string;
  revenueCents: number;
  regularExpensesCents: number;
  depreciationCents: number;
  profitCents: number;
  openInvoicesCents: number;
  openInvoicesCount: number;
  overdueInvoicesCount: number;
  vatPeriod: string;
  vatPayableCents: number;
  customerCount: number;
  expenseCount: number;
};

async function getCompany(userId: string) {
  if (usesSupabaseStorage()) {
    const company = await supabaseSingle<{ company_name: string; name: string }>("users", {
      select: "company_name,name",
      filters: { id: userId },
    });
    return { companyName: company?.company_name ?? "Mijn onderneming", owner: company?.name ?? "Ondernemer" };
  }
  const { db } = await import("./db");
  return db.prepare("SELECT company_name AS companyName, name AS owner FROM users WHERE id = ?")
    .get(userId) as { companyName: string; owner: string };
}

async function getOpenInvoiceSummary(userId: string) {
  const rows = usesSupabaseStorage()
    ? (await supabaseSelect<{ total_cents: number; status: InvoiceStatus; due_date: string }>("invoices", {
      select: "total_cents,status,due_date",
      filters: { user_id: userId },
    })).map((row) => ({ totalCents: row.total_cents, status: row.status, dueDate: row.due_date }))
    : await import("./db").then(({ db }) => db.prepare(`SELECT total_cents AS totalCents, status, due_date AS dueDate
      FROM invoices WHERE user_id = ? AND status IN ('Openstaand', 'Te laat')`)
      .all(userId) as Array<{ totalCents: number; status: InvoiceStatus; dueDate: string }>);

  return rows.reduce((summary, invoice) => {
    const status = effectiveInvoiceStatus(invoice.status, invoice.dueDate);
    if (status === "Openstaand" || status === "Te laat") {
      summary.count += 1;
      summary.total += invoice.totalCents;
    }
    if (status === "Te laat") summary.overdueCount += 1;
    return summary;
  }, { count: 0, total: 0, overdueCount: 0 });
}

async function getEntityCounts(userId: string) {
  if (usesSupabaseStorage()) {
    const [customers, expenses] = await Promise.all([
      supabaseSelect<{ id: string }>("customers", { select: "id", filters: { user_id: userId } }),
      supabaseSelect<{ id: string }>("expenses", { select: "id", filters: { user_id: userId } }),
    ]);
    return { customerCount: customers.length, expenseCount: expenses.length };
  }
  const { db } = await import("./db");
  const customers = db.prepare("SELECT COUNT(*) AS count FROM customers WHERE user_id = ?").get(userId) as { count: number };
  const expenses = db.prepare("SELECT COUNT(*) AS count FROM expenses WHERE user_id = ?").get(userId) as { count: number };
  return { customerCount: customers.count, expenseCount: expenses.count };
}

export async function getEntrepreneurReport(userId: string, year = new Date().getFullYear()): Promise<EntrepreneurReport> {
  const [profitLoss, vat, company, open, counts] = await Promise.all([
    getProfitLoss(userId, year),
    getVatSummary(userId),
    getCompany(userId),
    getOpenInvoiceSummary(userId),
    getEntityCounts(userId),
  ]);

  return {
    companyName: company.companyName,
    owner: company.owner,
    year,
    createdAt: new Date().toISOString(),
    revenueCents: profitLoss.revenueCents,
    regularExpensesCents: profitLoss.regularExpensesCents,
    depreciationCents: profitLoss.depreciationCents,
    profitCents: profitLoss.profitCents,
    openInvoicesCents: open.total,
    openInvoicesCount: open.count,
    overdueInvoicesCount: open.overdueCount,
    vatPeriod: vat.period,
    vatPayableCents: vat.payableVatCents,
    customerCount: counts.customerCount,
    expenseCount: counts.expenseCount,
  };
}

