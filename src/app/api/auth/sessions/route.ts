import { NextResponse } from "next/server";
import { destroyAllSessions, getSessionOverview, getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  return NextResponse.json({ sessions: await getSessionOverview(user.id) });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  await destroyAllSessions(user.id);
  return NextResponse.json({ ok: true });
}
