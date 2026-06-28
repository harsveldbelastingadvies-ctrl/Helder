import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoice-data";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await context.params;
  const invoice = await getInvoiceDetail(user.id, id);
  if (!invoice) return NextResponse.json({ error: "Deze factuur bestaat niet." }, { status: 404 });

  let pdf: Buffer;
  try {
    pdf = generateInvoicePdf(invoice);
  } catch {
    return NextResponse.json({ error: "De pdf kon niet worden gemaakt." }, { status: 500 });
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="factuur-${invoice.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
