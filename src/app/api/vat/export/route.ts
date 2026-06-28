import { getSessionUser } from "@/lib/auth";
import { generateVatPdf } from "@/lib/vat-pdf";
import { getVatExport } from "@/lib/vat";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Niet ingelogd" }, { status: 401 });

  const exportData = await getVatExport(user.id);
  const filename = `concept-btw-overzicht-${exportData.period.label.toLowerCase().replace(/\s+/g, "-")}.pdf`;
  const pdf = generateVatPdf(exportData);

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
