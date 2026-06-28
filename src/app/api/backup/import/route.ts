import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { restoreAdministrationBackup } from "@/lib/backup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  try {
    const backup = await request.json();
    await restoreAdministrationBackup(user.id, backup);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "De back-up kon niet worden teruggezet.",
    }, { status: 400 });
  }
}
