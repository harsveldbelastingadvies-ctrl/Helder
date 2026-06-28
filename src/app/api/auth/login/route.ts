import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { supabaseSingle, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { email, password } = await request.json() as { email?: string; password?: string };
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return NextResponse.json({ error: "Vul je e-mailadres en wachtwoord in." }, { status: 400 });
  }

  const user = usesSupabaseStorage()
    ? await supabaseSingle<{ id: string; password_hash: string }>("users", {
      select: "id,password_hash",
      filters: { email: normalizedEmail },
    }).then((row) => row ? { id: row.id, passwordHash: row.password_hash } : null)
    : await import("@/lib/db").then(({ db }) => db.prepare("SELECT id, password_hash AS passwordHash FROM users WHERE email = ?")
      .get(normalizedEmail) as { id: string; passwordHash: string } | undefined);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "De combinatie van e-mailadres en wachtwoord klopt niet." }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
