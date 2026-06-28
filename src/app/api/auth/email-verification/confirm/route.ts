import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hashAccountToken } from "@/lib/account-tokens";
import { supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const input = await request.json() as { code?: string };
  const code = input.code?.trim();
  if (!code) return NextResponse.json({ error: "Vul de bevestigingscode in." }, { status: 400 });

  const match = usesSupabaseStorage()
    ? await supabaseSingle<{ id: string }>("users", {
      select: "id",
      filters: {
        id: user.id,
        email_verification_token_hash: hashAccountToken(code),
        email_verification_expires_at: { op: "gt", value: Date.now() },
      },
    })
    : await import("@/lib/db").then(({ db }) => db.prepare(`SELECT id FROM users
      WHERE id = ? AND email_verification_token_hash = ? AND email_verification_expires_at > ?`)
      .get(user.id, hashAccountToken(code), Date.now()) as { id: string } | undefined);
  if (!match) return NextResponse.json({ error: "De bevestigingscode is ongeldig of verlopen." }, { status: 400 });

  if (usesSupabaseStorage()) {
    await supabaseUpdate("users", { id: user.id }, {
      email_verified_at: new Date().toISOString(),
      email_verification_token_hash: null,
      email_verification_expires_at: null,
    });
  } else {
    const { db } = await import("@/lib/db");
    db.prepare(`UPDATE users SET email_verified_at = CURRENT_TIMESTAMP,
      email_verification_token_hash = NULL, email_verification_expires_at = NULL WHERE id = ?`).run(user.id);
  }
  return NextResponse.json({ ok: true });
}
