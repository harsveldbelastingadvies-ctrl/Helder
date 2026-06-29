import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  // Stap 4: hier verwerken we straks de definitieve Mollie-betaalstatus.
  // Voor stap 1 en 2 bestaat de route alvast, zodat Mollie geen 404 krijgt.
  return NextResponse.json({ ok: true });
}
