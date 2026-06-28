import { getSessionUser } from "@/lib/auth";
import { getEntrepreneurReport } from "@/lib/entrepreneur-report";
import { generateEntrepreneurReportPdf } from "@/lib/entrepreneur-report-pdf";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Niet ingelogd" }, { status: 401 });
  const report = await getEntrepreneurReport(user.id);
  const pdf = generateEntrepreneurReportPdf(report);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ondernemersrapport-${report.year}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
