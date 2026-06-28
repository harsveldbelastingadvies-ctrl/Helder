import "server-only";

import { effectiveInvoiceStatus, type InvoiceLine, type InvoiceStatus } from "./invoice";
import { supabaseSelect, supabaseSingle, usesSupabaseStorage } from "./supabase";

export type InvoiceDetail = {
  id: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  totalCents: number;
  customer: {
    id: string;
    name: string;
    contact: string;
    email: string;
    street: string;
    postalCode: string;
    city: string;
  };
  company: { name: string; owner: string; email: string; street: string; postalCode: string; city: string; kvkNumber: string; vatNumber: string; iban: string; invoiceFooter: string; invoiceLogo: string };
  lines: InvoiceLine[];
};

type SupabaseInvoiceRow = {
  id: string;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  total_cents: number;
  customer_id: string;
  invoice_footer: string;
};

type SupabaseCustomerRow = {
  id: string;
  name: string;
  contact: string;
  email: string;
  street: string;
  postal_code: string;
  city: string;
};

type SupabaseCompanyRow = {
  company_name: string;
  name: string;
  email: string;
  street: string;
  postal_code: string;
  city: string;
  kvk_number: string;
  vat_number: string;
  iban: string;
  invoice_logo: string;
};

type SupabaseLineRow = {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: 0 | 9 | 21;
};

export async function getInvoiceDetail(userId: string, invoiceId: string): Promise<InvoiceDetail | null> {
  if (usesSupabaseStorage()) {
    const invoice = await supabaseSingle<SupabaseInvoiceRow>("invoices", {
      select: "id,issue_date,due_date,status,total_cents,customer_id,invoice_footer",
      filters: { id: invoiceId, user_id: userId },
    });
    if (!invoice) return null;

    const [customer, company, lines] = await Promise.all([
      supabaseSingle<SupabaseCustomerRow>("customers", {
        select: "id,name,contact,email,street,postal_code,city",
        filters: { id: invoice.customer_id, user_id: userId },
      }),
      supabaseSingle<SupabaseCompanyRow>("users", {
        select: "company_name,name,email,street,postal_code,city,kvk_number,vat_number,iban,invoice_logo",
        filters: { id: userId },
      }),
      supabaseSelect<SupabaseLineRow>("invoice_lines", {
        select: "id,description,quantity,unit_price_cents,vat_rate",
        filters: { invoice_id: invoiceId },
        order: "created_at.asc,id.asc",
      }),
    ]);
    if (!customer || !company) return null;

    return {
      id: invoice.id,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      status: effectiveInvoiceStatus(invoice.status, invoice.due_date),
      totalCents: invoice.total_cents,
      customer: {
        id: customer.id,
        name: customer.name,
        contact: customer.contact,
        email: customer.email,
        street: customer.street,
        postalCode: customer.postal_code,
        city: customer.city,
      },
      company: {
        name: company.company_name,
        owner: company.name,
        email: company.email,
        street: company.street,
        postalCode: company.postal_code,
        city: company.city,
        kvkNumber: company.kvk_number,
        vatNumber: company.vat_number,
        iban: company.iban,
        invoiceFooter: invoice.invoice_footer,
        invoiceLogo: company.invoice_logo,
      },
      lines: lines.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: Number(line.quantity),
        unitPriceCents: line.unit_price_cents,
        vatRate: line.vat_rate,
      })),
    };
  }

  const { db } = await import("./db");
  const invoice = db.prepare(`SELECT invoices.id, invoices.issue_date AS issueDate, invoices.due_date AS dueDate,
      invoices.status, invoices.total_cents AS totalCents, customers.id AS customerId, customers.name AS customerName,
      customers.contact, customers.email AS customerEmail, customers.street, customers.postal_code AS postalCode,
      customers.city, users.company_name AS companyName, users.name AS owner, users.email AS companyEmail,
      users.street AS companyStreet, users.postal_code AS companyPostalCode, users.city AS companyCity,
      users.kvk_number AS kvkNumber, users.vat_number AS vatNumber, users.iban,
      invoices.invoice_footer AS invoiceFooter, users.invoice_logo AS invoiceLogo
    FROM invoices
    JOIN customers ON customers.id = invoices.customer_id
    JOIN users ON users.id = invoices.user_id
    WHERE invoices.id = ? AND invoices.user_id = ?`)
    .get(invoiceId, userId) as {
      id: string; issueDate: string; dueDate: string; status: InvoiceStatus; totalCents: number;
      customerId: string; customerName: string; contact: string; customerEmail: string; street: string; postalCode: string; city: string;
      companyName: string; owner: string; companyEmail: string; companyStreet: string; companyPostalCode: string;
      companyCity: string; kvkNumber: string; vatNumber: string; iban: string; invoiceFooter: string; invoiceLogo: string;
    } | undefined;
  if (!invoice) return null;

  const lines = db.prepare(`SELECT id, description, quantity, unit_price_cents AS unitPriceCents, vat_rate AS vatRate
    FROM invoice_lines WHERE invoice_id = ? ORDER BY rowid`)
    .all(invoiceId) as InvoiceLine[];
  return {
    id: invoice.id,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    status: effectiveInvoiceStatus(invoice.status, invoice.dueDate),
    totalCents: invoice.totalCents,
    customer: {
      id: invoice.customerId,
      name: invoice.customerName,
      contact: invoice.contact,
      email: invoice.customerEmail,
      street: invoice.street,
      postalCode: invoice.postalCode,
      city: invoice.city,
    },
    company: {
      name: invoice.companyName,
      owner: invoice.owner,
      email: invoice.companyEmail,
      street: invoice.companyStreet,
      postalCode: invoice.companyPostalCode,
      city: invoice.companyCity,
      kvkNumber: invoice.kvkNumber,
      vatNumber: invoice.vatNumber,
      iban: invoice.iban,
      invoiceFooter: invoice.invoiceFooter,
      invoiceLogo: invoice.invoiceLogo,
    },
    lines,
  };
}
