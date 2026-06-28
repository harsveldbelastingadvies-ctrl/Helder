import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoice-data";
import { calculateInvoice, type InvoiceLine } from "@/lib/invoice";
import { supabaseDelete, supabaseInsert, supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";
import { isValidIsoDate, validateInvoiceLines } from "@/lib/validation";

export const runtime = "nodejs";

async function getInvoiceStatus(id: string, userId: string) {
  if (usesSupabaseStorage()) {
    return await supabaseSingle<{ status: string }>("invoices", { select: "status", filters: { id, user_id: userId } });
  }
  const { db } = await import("@/lib/db");
  return db.prepare("SELECT status FROM invoices WHERE id = ? AND user_id = ?")
    .get(id, userId) as { status: string } | undefined;
}

async function customerExists(customerId: string, userId: string) {
  if (usesSupabaseStorage()) {
    return Boolean(await supabaseSingle<{ id: string }>("customers", { select: "id", filters: { id: customerId, user_id: userId } }));
  }
  const { db } = await import("@/lib/db");
  return Boolean(db.prepare("SELECT id FROM customers WHERE id = ? AND user_id = ?").get(customerId, userId));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await context.params;
  const invoice = await getInvoiceDetail(user.id, id);
  if (!invoice) return NextResponse.json({ error: "Deze factuur bestaat niet." }, { status: 404 });
  return NextResponse.json({ invoice });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json() as { status?: string; customerId?: string; issueDate?: string; dueDate?: string; lines?: InvoiceLine[]; invoiceFooter?: string };

  if (body.lines) {
    if (!body.customerId || !body.issueDate || !body.dueDate || !body.lines.length) {
      return NextResponse.json({ error: "De factuur is nog niet compleet." }, { status: 400 });
    }
    if (!isValidIsoDate(body.issueDate) || !isValidIsoDate(body.dueDate)) {
      return NextResponse.json({ error: "Controleer de factuurdatum en vervaldatum." }, { status: 400 });
    }
    const invoice = await getInvoiceStatus(id, user.id);
    if (!invoice) return NextResponse.json({ error: "Deze factuur bestaat niet." }, { status: 404 });
    if (invoice.status !== "Concept") {
      return NextResponse.json({ error: "Alleen conceptfacturen kunnen worden aangepast." }, { status: 400 });
    }
    if (!await customerExists(body.customerId, user.id)) return NextResponse.json({ error: "Deze klant bestaat niet." }, { status: 404 });
    const lineError = validateInvoiceLines(body.lines);
    if (lineError) return NextResponse.json({ error: lineError }, { status: 400 });
    const invoiceFooter = body.invoiceFooter?.trim() || "Bedankt voor de fijne samenwerking.";
    if (invoiceFooter.length > 240) return NextResponse.json({ error: "Houd de standaard factuurtekst korter dan 240 tekens." }, { status: 400 });

    const totals = calculateInvoice(body.lines);
    if (usesSupabaseStorage()) {
      const updated = await supabaseUpdate("invoices", { id, user_id: user.id }, {
        customer_id: body.customerId,
        issue_date: body.issueDate,
        due_date: body.dueDate,
        total_cents: totals.totalCents,
        invoice_footer: invoiceFooter,
      });
      if (!updated.length) return NextResponse.json({ error: "Deze factuur bestaat niet." }, { status: 404 });
      await supabaseDelete("invoice_lines", { invoice_id: id });
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
      const updateInvoice = db.transaction(() => {
        db.prepare(`UPDATE invoices SET customer_id = ?, issue_date = ?, due_date = ?, total_cents = ?, invoice_footer = ?
          WHERE id = ? AND user_id = ? AND status = 'Concept'`)
          .run(body.customerId, body.issueDate, body.dueDate, totals.totalCents, invoiceFooter, id, user.id);
        db.prepare("DELETE FROM invoice_lines WHERE invoice_id = ?").run(id);
        const insertLine = db.prepare(`INSERT INTO invoice_lines
          (id, invoice_id, description, quantity, unit_price_cents, vat_rate) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const line of body.lines!) {
          insertLine.run(line.id || randomUUID(), id, line.description.trim(), line.quantity, line.unitPriceCents, line.vatRate);
        }
      });
      updateInvoice();
    }
    return NextResponse.json({ invoice: await getInvoiceDetail(user.id, id) });
  }

  const { status } = body;
  if (!status || !["Concept", "Openstaand", "Betaald", "Te laat"].includes(status)) {
    return NextResponse.json({ error: "Kies een geldige factuurstatus." }, { status: 400 });
  }
  if (usesSupabaseStorage()) {
    const rows = await supabaseUpdate("invoices", { id, user_id: user.id }, { status });
    if (!rows.length) return NextResponse.json({ error: "Deze factuur bestaat niet." }, { status: 404 });
  } else {
    const { db } = await import("@/lib/db");
    const result = db.prepare("UPDATE invoices SET status = ? WHERE id = ? AND user_id = ?").run(status, id, user.id);
    if (!result.changes) return NextResponse.json({ error: "Deze factuur bestaat niet." }, { status: 404 });
  }
  return NextResponse.json({ invoice: await getInvoiceDetail(user.id, id) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await context.params;
  const invoice = await getInvoiceStatus(id, user.id);
  if (!invoice) return NextResponse.json({ error: "Deze factuur bestaat niet." }, { status: 404 });
  if (invoice.status !== "Concept") {
    return NextResponse.json({ error: "Alleen conceptfacturen kunnen worden verwijderd." }, { status: 400 });
  }
  if (usesSupabaseStorage()) {
    await supabaseDelete("invoices", { id, user_id: user.id });
  } else {
    const { db } = await import("@/lib/db");
    db.prepare("DELETE FROM invoices WHERE id = ? AND user_id = ? AND status = 'Concept'").run(id, user.id);
  }
  return NextResponse.json({ ok: true });
}
