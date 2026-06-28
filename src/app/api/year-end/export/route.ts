import { getSessionUser } from "@/lib/auth";
import { generateYearEndPdf } from "@/lib/year-end-pdf";
import { getYearEndSummary } from "@/lib/year-end";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Niet ingelogd" }, { status: 401 });

  const summary = await getYearEndSummary(user.id);
  const filename = `concept-jaarcheck-${summary.year}.pdf`;
  const pdf = generateYearEndPdf(summary);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
