import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const input = await request.json() as { currentPassword?: string; newPassword?: string };
  const currentPassword = input.currentPassword ?? "";
  const newPassword = input.newPassword ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Vul je huidige en nieuwe wachtwoord in." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Kies een nieuw wachtwoord van minimaal 8 tekens." }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "Kies een nieuw wachtwoord dat anders is dan je huidige wachtwoord." }, { status: 400 });
  }

  const account = usesSupabaseStorage()
    ? await supabaseSingle<{ password_hash: string }>("users", { select: "password_hash", filters: { id: user.id } })
      .then((row) => row ? { passwordHash: row.password_hash } : null)
    : await import("@/lib/db").then(({ db }) => db.prepare("SELECT password_hash AS passwordHash FROM users WHERE id = ?")
      .get(user.id) as { passwordHash: string } | undefined);
  if (!account || !verifyPassword(currentPassword, account.passwordHash)) {
    return NextResponse.json({ error: "Je huidige wachtwoord klopt niet." }, { status: 401 });
  }

  if (usesSupabaseStorage()) {
    await supabaseUpdate("users", { id: user.id }, { password_hash: hashPassword(newPassword) });
  } else {
    const { db } = await import("@/lib/db");
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), user.id);
  }
  return NextResponse.json({ ok: true });
}
