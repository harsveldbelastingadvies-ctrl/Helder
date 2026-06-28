import "server-only";

import { calculateExpense, type VatRate } from "./expense";
import { supabaseSelect, usesSupabaseStorage } from "./supabase";

export type VatPeriod = {
  quarter: number;
  year: number;
  start: string;
  end: string;
  label: string;
};

export type VatSummary = {
  period: string;
  receivedVatCents: number;
  paidVatCents: number;
  payableVatCents: number;
  expenseTotalCents: number;
};

type InvoiceVatRow = {
  invoiceId: string;
  issueDate: string;
  customerName: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: VatRate;
};

type ExpenseVatRow = {
  id: string;
  expenseDate: string;
  supplier: string;
  description: string;
  category: string;
  amountInclCents: number;
  vatRate: VatRate;
};

type SupabaseInvoiceLineRow = {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: VatRate;
  invoices: {
    id: string;
    issue_date: string;
    status: string;
    customers: { name: string } | null;
  } | null;
};

type SupabaseExpenseRow = {
  id: string;
  expense_date: string;
  supplier: string;
  description: string;
  category: string;
  amount_incl_cents: number;
  vat_rate: VatRate;
};

export type VatExportRow = {
  type: "Verkoopfactuur" | "Kosten";
  date: string;
  document: string;
  name: string;
  description: string;
  vatRate: VatRate;
  amountExclCents: number;
  vatCents: number;
  amountInclCents: number;
};

export function currentQuarter(now = new Date()): VatPeriod {
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const startMonth = (quarter - 1) * 3;
  const start = `${now.getFullYear()}-${String(startMonth + 1).padStart(2, "0")}-01`;
  const endDate = new Date(now.getFullYear(), startMonth + 3, 0);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { quarter, year: now.getFullYear(), start, end, label: `Q${quarter} ${now.getFullYear()}` };
}

async function getInvoiceRows(userId: string, period: VatPeriod) {
  if (usesSupabaseStorage()) {
    const rows = await supabaseSelect<SupabaseInvoiceLineRow>("invoice_lines", {
      select: "id,description,quantity,unit_price_cents,vat_rate,invoices!inner(id,issue_date,status,user_id,customers(name))",
      filters: {
        "invoices.user_id": userId,
        "invoices.status": { op: "neq", value: "Concept" },
        "invoices.issue_date": { op: "gte", value: period.start },
      },
      order: "invoices.issue_date.asc,invoices.id.asc,created_at.asc",
    });
    return rows
      .filter((row) => row.invoices && row.invoices.issue_date <= period.end)
      .map((row): InvoiceVatRow => ({
        invoiceId: row.invoices!.id,
        issueDate: row.invoices!.issue_date,
        customerName: row.invoices!.customers?.name ?? "Klant",
        description: row.description,
        quantity: Number(row.quantity),
        unitPriceCents: row.unit_price_cents,
        vatRate: row.vat_rate,
      }));
  }
  const { db } = await import("./db");
  return db.prepare(`SELECT invoices.id AS invoiceId, invoices.issue_date AS issueDate,
      customers.name AS customerName, invoice_lines.description, invoice_lines.quantity,
      invoice_lines.unit_price_cents AS unitPriceCents, invoice_lines.vat_rate AS vatRate
    FROM invoice_lines
    JOIN invoices ON invoices.id = invoice_lines.invoice_id
    JOIN customers ON customers.id = invoices.customer_id
    WHERE invoices.user_id = ? AND invoices.issue_date BETWEEN ? AND ? AND invoices.status != 'Concept'
    ORDER BY invoices.issue_date ASC, invoices.id ASC, invoice_lines.rowid ASC`)
    .all(userId, period.start, period.end) as InvoiceVatRow[];
}

async function getExpenseRows(userId: string, period: VatPeriod) {
  if (usesSupabaseStorage()) {
    const rows = await supabaseSelect<SupabaseExpenseRow>("expenses", {
      select: "id,expense_date,supplier,description,category,amount_incl_cents,vat_rate",
      filters: {
        user_id: userId,
        expense_date: { op: "gte", value: period.start },
      },
      order: "expense_date.asc,supplier.asc",
    });
    return rows
      .filter((row) => row.expense_date <= period.end)
      .map((row): ExpenseVatRow => ({
        id: row.id,
        expenseDate: row.expense_date,
        supplier: row.supplier,
        description: row.description,
        category: row.category,
        amountInclCents: row.amount_incl_cents,
        vatRate: row.vat_rate,
      }));
  }
  const { db } = await import("./db");
  return db.prepare(`SELECT id, expense_date AS expenseDate, supplier, description, category,
      amount_incl_cents AS amountInclCents, vat_rate AS vatRate
    FROM expenses
    WHERE user_id = ? AND expense_date BETWEEN ? AND ?
    ORDER BY expense_date ASC, supplier ASC`)
    .all(userId, period.start, period.end) as ExpenseVatRow[];
}

function summarize(period: VatPeriod, invoiceRows: InvoiceVatRow[], expenseRows: ExpenseVatRow[]): VatSummary {
  const receivedVatCents = invoiceRows.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents * line.vatRate / 100), 0);
  const paidVatCents = expenseRows.reduce((sum, expense) => sum + calculateExpense(expense.amountInclCents, expense.vatRate).vatCents, 0);
  const expenseTotalCents = expenseRows.reduce((sum, expense) => sum + expense.amountInclCents, 0);
  return {
    period: period.label,
    receivedVatCents,
    paidVatCents,
    payableVatCents: receivedVatCents - paidVatCents,
    expenseTotalCents,
  };
}

export async function getVatSummary(userId: string): Promise<VatSummary> {
  const period = currentQuarter();
  return summarize(period, await getInvoiceRows(userId, period), await getExpenseRows(userId, period));
}

export async function getVatExport(userId: string) {
  const period = currentQuarter();
  const invoiceRows = await getInvoiceRows(userId, period);
  const expenseRows = await getExpenseRows(userId, period);
  const salesRows = invoiceRows.map((line): VatExportRow => {
    const amountExclCents = Math.round(line.quantity * line.unitPriceCents);
    const vatCents = Math.round(amountExclCents * line.vatRate / 100);
    return {
      type: "Verkoopfactuur",
      date: line.issueDate,
      document: line.invoiceId,
      name: line.customerName,
      description: line.description,
      vatRate: line.vatRate,
      amountExclCents,
      vatCents,
      amountInclCents: amountExclCents + vatCents,
    };
  });
  const costRows = expenseRows.map((expense): VatExportRow => {
    const calculated = calculateExpense(expense.amountInclCents, expense.vatRate);
    return {
      type: "Kosten",
      date: expense.expenseDate,
      document: expense.id,
      name: expense.supplier,
      description: `${expense.description} (${expense.category})`,
      vatRate: expense.vatRate,
      amountExclCents: calculated.amountExclCents,
      vatCents: calculated.vatCents,
      amountInclCents: calculated.amountInclCents,
    };
  });
  return {
    period,
    summary: summarize(period, invoiceRows, expenseRows),
    rows: [...salesRows, ...costRows].sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type, "nl")),
  };
}

