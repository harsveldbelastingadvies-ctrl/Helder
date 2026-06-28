import "server-only";

import { calculateExpense, type VatRate } from "./expense";
import { supabaseSelect, usesSupabaseStorage } from "./supabase";

type InvoiceResultRow = {
  invoiceId: string;
  issueDate: string;
  customerName: string;
  quantity: number;
  unitPriceCents: number;
};

type ExpenseResultRow = {
  id: string;
  expenseDate: string;
  supplier: string;
  description: string;
  category: string;
  amountInclCents: number;
  vatRate: VatRate;
  depreciationYears: number;
};

type SupabaseInvoiceRow = {
  id: string;
  issue_date: string;
  customer_id: string;
};

type SupabaseInvoiceLineRow = {
  id: string;
  invoice_id: string;
  quantity: number;
  unit_price_cents: number;
};

type SupabaseCustomerRow = {
  id: string;
  name: string;
};

type SupabaseExpenseRow = {
  id: string;
  expense_date: string;
  supplier: string;
  description: string;
  category: string;
  amount_incl_cents: number;
  vat_rate: VatRate;
  depreciation_years: number;
};

export type DepreciationRow = {
  id: string;
  supplier: string;
  description: string;
  purchaseYear: number;
  depreciationYears: number;
  purchaseAmountExclCents: number;
  yearlyDepreciationCents: number;
  currentYearDepreciationCents: number;
  remainingYears: number;
};

export type ProfitLossSummary = {
  year: number;
  revenueCents: number;
  regularExpensesCents: number;
  depreciationCents: number;
  profitCents: number;
  investmentPurchasesCents: number;
  depreciationRows: DepreciationRow[];
};

async function getInvoiceRows(userId: string, start: string, end: string) {
  if (usesSupabaseStorage()) {
    const invoices = await supabaseSelect<SupabaseInvoiceRow>("invoices", {
      select: "id,issue_date,customer_id",
      filters: {
        user_id: userId,
        status: { op: "neq", value: "Concept" },
        issue_date: { op: "gte", value: start },
      },
      order: "issue_date.asc,id.asc",
    });
    const yearInvoices = invoices.filter((invoice) => invoice.issue_date <= end);
    if (!yearInvoices.length) return [];

    const invoiceIds = yearInvoices.map((invoice) => invoice.id);
    const customerIds = [...new Set(yearInvoices.map((invoice) => invoice.customer_id))];
    const [lines, customers] = await Promise.all([
      supabaseSelect<SupabaseInvoiceLineRow>("invoice_lines", {
        select: "id,invoice_id,quantity,unit_price_cents",
        filters: { invoice_id: { op: "in", value: invoiceIds } },
        order: "created_at.asc,id.asc",
      }),
      customerIds.length
        ? supabaseSelect<SupabaseCustomerRow>("customers", {
          select: "id,name",
          filters: { user_id: userId, id: { op: "in", value: customerIds } },
        })
        : Promise.resolve([]),
    ]);
    const invoiceById = new Map(yearInvoices.map((invoice) => [invoice.id, invoice]));
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));

    return lines
      .map((row): InvoiceResultRow | null => {
        const invoice = invoiceById.get(row.invoice_id);
        if (!invoice) return null;
        return {
          invoiceId: invoice.id,
          issueDate: invoice.issue_date,
          customerName: customerById.get(invoice.customer_id)?.name ?? "Klant",
          quantity: Number(row.quantity),
          unitPriceCents: Number(row.unit_price_cents),
        };
      })
      .filter((row): row is InvoiceResultRow => Boolean(row));
  }
  const { db } = await import("./db");
  return db.prepare(`SELECT invoices.id AS invoiceId, invoices.issue_date AS issueDate,
      customers.name AS customerName, invoice_lines.quantity, invoice_lines.unit_price_cents AS unitPriceCents
    FROM invoice_lines
    JOIN invoices ON invoices.id = invoice_lines.invoice_id
    JOIN customers ON customers.id = invoices.customer_id
    WHERE invoices.user_id = ? AND invoices.issue_date BETWEEN ? AND ? AND invoices.status != 'Concept'`)
    .all(userId, start, end) as InvoiceResultRow[];
}

async function getExpenseRows(userId: string) {
  if (usesSupabaseStorage()) {
    const rows = await supabaseSelect<SupabaseExpenseRow>("expenses", {
      select: "id,expense_date,supplier,description,category,amount_incl_cents,vat_rate,depreciation_years",
      filters: { user_id: userId },
      order: "expense_date.asc,supplier.asc",
    });
    return rows.map((row): ExpenseResultRow => ({
      id: row.id,
      expenseDate: row.expense_date,
      supplier: row.supplier,
      description: row.description,
      category: row.category,
      amountInclCents: Number(row.amount_incl_cents),
      vatRate: Number(row.vat_rate) as VatRate,
      depreciationYears: Number(row.depreciation_years),
    }));
  }
  const { db } = await import("./db");
  return db.prepare(`SELECT id, expense_date AS expenseDate, supplier, description, category,
      amount_incl_cents AS amountInclCents, vat_rate AS vatRate, depreciation_years AS depreciationYears
    FROM expenses
    WHERE user_id = ?
    ORDER BY expense_date ASC, supplier ASC`)
    .all(userId) as ExpenseResultRow[];
}

export async function getProfitLoss(userId: string, year = new Date().getFullYear()): Promise<ProfitLossSummary> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [invoiceRows, expenseRows] = await Promise.all([getInvoiceRows(userId, start, end), getExpenseRows(userId)]);

  const revenueCents = invoiceRows.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents), 0);
  const regularExpensesCents = expenseRows
    .filter((expense) => expense.depreciationYears <= 1 && expense.expenseDate >= start && expense.expenseDate <= end)
    .reduce((sum, expense) => sum + calculateExpense(expense.amountInclCents, expense.vatRate).amountExclCents, 0);

  const investmentRows = expenseRows.filter((expense) => expense.depreciationYears > 1);
  const depreciationRows = investmentRows.map((expense): DepreciationRow => {
    const purchaseYear = Number(expense.expenseDate.slice(0, 4));
    const purchaseAmountExclCents = calculateExpense(expense.amountInclCents, expense.vatRate).amountExclCents;
    const yearlyDepreciationCents = Math.round(purchaseAmountExclCents / expense.depreciationYears);
    const active = year >= purchaseYear && year < purchaseYear + expense.depreciationYears;
    return {
      id: expense.id,
      supplier: expense.supplier,
      description: `${expense.description} (${expense.category})`,
      purchaseYear,
      depreciationYears: expense.depreciationYears,
      purchaseAmountExclCents,
      yearlyDepreciationCents,
      currentYearDepreciationCents: active ? yearlyDepreciationCents : 0,
      remainingYears: active ? purchaseYear + expense.depreciationYears - year - 1 : 0,
    };
  });

  const depreciationCents = depreciationRows.reduce((sum, row) => sum + row.currentYearDepreciationCents, 0);
  const investmentPurchasesCents = investmentRows
    .filter((expense) => expense.expenseDate >= start && expense.expenseDate <= end)
    .reduce((sum, expense) => sum + calculateExpense(expense.amountInclCents, expense.vatRate).amountExclCents, 0);

  return {
    year,
    revenueCents,
    regularExpensesCents,
    depreciationCents,
    profitCents: revenueCents - regularExpensesCents - depreciationCents,
    investmentPurchasesCents,
    depreciationRows,
  };
}
