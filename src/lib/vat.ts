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
  expenseExclTotalCents: number;
  expenseCount: number;
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

type SupabaseInvoiceRow = {
  id: string;
  issue_date: string;
  customer_id: string;
};

type SupabaseInvoiceLineRow = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: VatRate;
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
    const invoices = await supabaseSelect<SupabaseInvoiceRow>("invoices", {
      select: "id,issue_date,customer_id",
      filters: {
        user_id: userId,
        status: { op: "neq", value: "Concept" },
        issue_date: { op: "gte", value: period.start },
      },
      order: "issue_date.asc,id.asc",
    });
    const periodInvoices = invoices.filter((invoice) => invoice.issue_date <= period.end);
    if (!periodInvoices.length) return [];

    const invoiceIds = periodInvoices.map((invoice) => invoice.id);
    const customerIds = [...new Set(periodInvoices.map((invoice) => invoice.customer_id))];
    const [lines, customers] = await Promise.all([
      supabaseSelect<SupabaseInvoiceLineRow>("invoice_lines", {
        select: "id,invoice_id,description,quantity,unit_price_cents,vat_rate",
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
    const invoiceById = new Map(periodInvoices.map((invoice) => [invoice.id, invoice]));
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));

    return lines
      .map((row): InvoiceVatRow | null => {
        const invoice = invoiceById.get(row.invoice_id);
        if (!invoice) return null;
        return {
          invoiceId: invoice.id,
          issueDate: invoice.issue_date,
          customerName: customerById.get(invoice.customer_id)?.name ?? "Klant",
          description: row.description,
          quantity: Number(row.quantity),
          unitPriceCents: Number(row.unit_price_cents),
          vatRate: Number(row.vat_rate) as VatRate,
        };
      })
      .filter((row): row is InvoiceVatRow => Boolean(row));
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
        amountInclCents: Number(row.amount_incl_cents),
        vatRate: Number(row.vat_rate) as VatRate,
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

export function summarizeVatPeriod(period: VatPeriod, invoiceRows: InvoiceVatRow[], expenseRows: ExpenseVatRow[]): VatSummary {
  const receivedVatCents = invoiceRows.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents * line.vatRate / 100), 0);
  const paidVatCents = expenseRows.reduce((sum, expense) => sum + calculateExpense(expense.amountInclCents, expense.vatRate).vatCents, 0);
  const expenseTotalCents = expenseRows.reduce((sum, expense) => sum + expense.amountInclCents, 0);
  const expenseExclTotalCents = expenseRows.reduce((sum, expense) => sum + calculateExpense(expense.amountInclCents, expense.vatRate).amountExclCents, 0);
  return {
    period: period.label,
    receivedVatCents,
    paidVatCents,
    payableVatCents: receivedVatCents - paidVatCents,
    expenseTotalCents,
    expenseExclTotalCents,
    expenseCount: expenseRows.length,
  };
}

export async function getVatSummary(userId: string): Promise<VatSummary> {
  const period = currentQuarter();
  return summarizeVatPeriod(period, await getInvoiceRows(userId, period), await getExpenseRows(userId, period));
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
    summary: summarizeVatPeriod(period, invoiceRows, expenseRows),
    rows: [...salesRows, ...costRows].sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type, "nl")),
  };
}
