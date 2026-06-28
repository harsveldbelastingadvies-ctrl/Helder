import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getProfitLoss } from "@/lib/profit-loss";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  return NextResponse.json({ profitLoss: await getProfitLoss(user.id) });
}
