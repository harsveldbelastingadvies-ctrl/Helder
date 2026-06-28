import { getSessionUser } from "@/lib/auth";
import { getAdministrationBackup } from "@/lib/backup";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Niet ingelogd" }, { status: 401 });

  const backup = await getAdministrationBackup(user.id);
  const date = new Date().toISOString().slice(0, 10);
  const safeCompany = user.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "administratie";
  const filename = `helder-backup-${safeCompany}-${date}.json`;

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
