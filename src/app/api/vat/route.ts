import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getVatSummary } from "@/lib/vat";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  return NextResponse.json({ vat: await getVatSummary(user.id) });
}
