import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { inspectAdministrationBackup } from "@/lib/backup";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  try {
    const status = await inspectAdministrationBackup(user.id);
    return NextResponse.json({ status });
  } catch {
    return NextResponse.json({
      error: "De back-upcontrole kon niet worden uitgevoerd.",
    }, { status: 500 });
  }
}
