import { getSessionUser } from "@/lib/auth";
import { generateProfitLossPdf } from "@/lib/profit-loss-pdf";
import { getProfitLoss } from "@/lib/profit-loss";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Niet ingelogd" }, { status: 401 });

  const summary = await getProfitLoss(user.id);
  const filename = `concept-winst-en-verlies-${summary.year}.pdf`;
  const pdf = generateProfitLossPdf(summary);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
