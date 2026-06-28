import { NextResponse } from "next/server";
import { supabaseHealthCheck, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (usesSupabaseStorage()) {
      const health = await supabaseHealthCheck();
      return NextResponse.json({
        ok: health.ok,
        storage: "supabase",
        database: health.database,
        fileStorage: health.fileStorage,
        bucket: health.bucket || null,
        configured: health.configured,
        message: health.message,
        checkedAt: new Date().toISOString(),
      }, { status: health.ok ? 200 : 503 });
    }

    const { db } = await import("@/lib/db");
    db.prepare("SELECT 1").get();
    return NextResponse.json({
      ok: true,
      storage: "local",
      database: "bereikbaar",
      fileStorage: "lokale computer",
      configured: true,
      message: "Helder gebruikt lokale opslag op deze computer. Dat is prima voor bouwen en testen.",
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      ok: false,
      storage: usesSupabaseStorage() ? "supabase" : "local",
      database: "niet bereikbaar",
      fileStorage: "niet bereikbaar",
      configured: false,
      message: "De opslagcontrole kon niet worden uitgevoerd.",
      checkedAt: new Date().toISOString(),
    }, { status: 503 });
  }
}
