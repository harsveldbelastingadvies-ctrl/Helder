import { NextResponse } from "next/server";
import { hashAccountToken } from "@/lib/account-tokens";
import { hashPassword } from "@/lib/password";
import { supabaseDelete, supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = await request.json() as { email?: string; code?: string; password?: string };
  const email = input.email?.trim().toLowerCase();
  const code = input.code?.trim();
  const password = input.password ?? "";
  if (!email || !code || !password) return NextResponse.json({ error: "Vul e-mailadres, herstelcode en nieuw wachtwoord in." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Kies een wachtwoord van minimaal 8 tekens." }, { status: 400 });

  const user = usesSupabaseStorage()
    ? await supabaseSingle<{ id: string }>("users", {
      select: "id",
      filters: {
        email,
        password_reset_token_hash: hashAccountToken(code),
        password_reset_expires_at: { op: "gt", value: Date.now() },
      },
    })
    : await import("@/lib/db").then(({ db }) => db.prepare(`SELECT id FROM users
      WHERE email = ? AND password_reset_token_hash = ? AND password_reset_expires_at > ?`)
      .get(email, hashAccountToken(code), Date.now()) as { id: string } | undefined);
  if (!user) return NextResponse.json({ error: "De herstelcode is ongeldig of verlopen." }, { status: 400 });

  if (usesSupabaseStorage()) {
    await supabaseUpdate("users", { id: user.id }, {
      password_hash: hashPassword(password),
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    });
    await supabaseDelete("sessions", { user_id: user.id });
  } else {
    const { db } = await import("@/lib/db");
    db.prepare(`UPDATE users SET password_hash = ?, password_reset_token_hash = NULL, password_reset_expires_at = NULL
      WHERE id = ?`).run(hashPassword(password), user.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  }
  return NextResponse.json({ ok: true });
}
