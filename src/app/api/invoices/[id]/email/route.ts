import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoice-data";
import { createInvoiceEmail } from "@/lib/invoice-email";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await context.params;
  const invoice = await getInvoiceDetail(user.id, id);
  if (!invoice) return NextResponse.json({ error: "Deze factuur bestaat niet." }, { status: 404 });
  try {
    const email = createInvoiceEmail(invoice, "invoice");
    return new Response(email.message, { headers: { "Content-Type": "message/rfc822", "Content-Disposition": `attachment; filename="${email.filename}"`, "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "De e-mail kon niet worden klaargezet." }, { status: 500 });
  }
}
