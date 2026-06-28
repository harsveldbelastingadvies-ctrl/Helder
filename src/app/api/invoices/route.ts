import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { calculateInvoice, effectiveInvoiceStatus, type InvoiceLine, type InvoiceStatus } from "@/lib/invoice";
import { supabaseInsert, supabaseSelect, supabaseSingle, usesSupabaseStorage } from "@/lib/supabase";
import { isValidIsoDate, validateInvoiceLines } from "@/lib/validation";

export const runtime = "nodejs";

type InvoiceRow = {
  id: string;
  issue_date: string;
  due_date: string;
  total_cents: number;
  status: InvoiceStatus;
  customer_id: string;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

function toInvoice(row: InvoiceRow, customerName: string) {
  return {
    id: row.id,
    customer: customerName,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    totalCents: row.total_cents,
    status: effectiveInvoiceStatus(row.status, row.due_date),
    date: formatDate(row.issue_date),
    due: formatDate(row.due_date),
  };
}

async function nextInvoiceId(userId: string, issueDate: string) {
  const year = issueDate.slice(0, 4);
  if (usesSupabaseStorage()) {
    const rows = await supabaseSelect<{ id: string }>("invoices", { select: "id", filters: { user_id: userId } });
    const latest = rows
      .map((row) => row.id)
      .filter((id) => id.startsWith(`${year}-`))
      .sort((a, b) => b.localeCompare(a))[0];
    const nextNumber = latest ? Number(latest.split("-")[1]) + 1 : 1;
    return `${year}-${String(nextNumber).padStart(4, "0")}`;
  }
  const { db } = await import("@/lib/db");
  const latest = db.prepare("SELECT id FROM invoices WHERE user_id = ? AND id LIKE ? ORDER BY id DESC LIMIT 1")
    .get(userId, `${year}-%`) as { id: string } | undefined;
  const nextNumber = latest ? Number(latest.id.split("-")[1]) + 1 : 1;
  return `${year}-${String(nextNumber).padStart(4, "0")}`;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const invoices = usesSupabaseStorage()
    ? await Promise.all([
      supabaseSelect<InvoiceRow>("invoices", {
        select: "id,customer_id,issue_date,due_date,total_cents,status",
        filters: { user_id: user.id },
        order: "issue_date.desc,id.desc",
      }),
      supabaseSelect<{ id: string; name: string }>("customers", {
        select: "id,name",
        filters: { user_id: user.id },
      }),
    ]).then(([rows, customers]) => {
      const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
      return rows.map((row) => toInvoice(row, customerNames.get(row.customer_id) ?? "Klant"));
    })
    : await import("@/lib/db").then(({ db }) => {
      const rows = db.prepare(`
        SELECT invoices.id, customers.name AS customer, invoices.issue_date AS issueDate,
          invoices.due_date AS dueDate, invoices.total_cents AS totalCents, invoices.status
        FROM invoices JOIN customers ON customers.id = invoices.customer_id
        WHERE invoices.user_id = ? ORDER BY invoices.issue_date DESC, invoices.id DESC
      `).all(user.id) as Array<{ id: string; customer: string; issueDate: string; dueDate: string; totalCents: number; status: InvoiceStatus }>;
      return rows.map((row) => ({ ...row, status: effectiveInvoiceStatus(row.status, row.dueDate), date: formatDate(row.issueDate), due: formatDate(row.dueDate) }));
    });
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const body = await request.json() as { customerId?: string; issueDate?: string; dueDate?: string; lines?: InvoiceLine[]; invoiceFooter?: string };
  if (!body.customerId || !body.issueDate || !body.dueDate || !body.lines?.length) {
    return NextResponse.json({ error: "De factuur is nog niet compleet." }, { status: 400 });
  }
  if (!isValidIsoDate(body.issueDate) || !isValidIsoDate(body.dueDate)) {
    return NextResponse.json({ error: "Controleer de factuurdatum en vervaldatum." }, { status: 400 });
  }
  const customer = usesSupabaseStorage()
    ? await supabaseSingle<{ id: string; name: string }>("customers", { select: "id,name", filters: { id: body.customerId, user_id: user.id } })
    : await import("@/lib/db").then(({ db }) => db.prepare("SELECT id, name FROM customers WHERE id = ? AND user_id = ?")
      .get(body.customerId, user.id) as { id: string; name: string } | undefined);
  if (!customer) return NextResponse.json({ error: "Deze klant bestaat niet." }, { status: 404 });
  const lineError = validateInvoiceLines(body.lines);
  if (lineError) return NextResponse.json({ error: lineError }, { status: 400 });
  const invoiceFooter = body.invoiceFooter?.trim() || "Bedankt voor de fijne samenwerking.";
  if (invoiceFooter.length > 240) return NextResponse.json({ error: "Houd de standaard factuurtekst korter dan 240 tekens." }, { status: 400 });

  const totals = calculateInvoice(body.lines);
  const id = await nextInvoiceId(user.id, body.issueDate);

  if (usesSupabaseStorage()) {
    await supabaseInsert("invoices", {
      id,
      user_id: user.id,
      customer_id: customer.id,
      issue_date: body.issueDate,
      due_date: body.dueDate,
      total_cents: totals.totalCents,
      status: "Concept",
      invoice_footer: invoiceFooter,
    });
    for (const line of body.lines) {
      await supabaseInsert("invoice_lines", {
        id: line.id || randomUUID(),
        invoice_id: id,
        description: line.description.trim(),
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents,
        vat_rate: line.vatRate,
      });
    }
  } else {
    const { db } = await import("@/lib/db");
    const saveInvoice = db.transaction(() => {
      db.prepare(`INSERT INTO invoices (id, user_id, customer_id, issue_date, due_date, total_cents, status, invoice_footer)
        VALUES (?, ?, ?, ?, ?, ?, 'Concept', ?)`)
        .run(id, user.id, customer.id, body.issueDate, body.dueDate, totals.totalCents, invoiceFooter);
      const insertLine = db.prepare(`INSERT INTO invoice_lines
        (id, invoice_id, description, quantity, unit_price_cents, vat_rate) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const line of body.lines!) {
        insertLine.run(line.id || randomUUID(), id, line.description.trim(), line.quantity, line.unitPriceCents, line.vatRate);
      }
    });
    saveInvoice();
  }

  return NextResponse.json({ invoice: {
    id, customer: customer.name, date: formatDate(body.issueDate), due: formatDate(body.dueDate),
    issueDate: body.issueDate, dueDate: body.dueDate, totalCents: totals.totalCents, status: "Concept",
  } }, { status: 201 });
}
