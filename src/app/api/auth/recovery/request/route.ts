import { NextResponse } from "next/server";
import { createAccountToken, hashAccountToken, tokenExpiry } from "@/lib/account-tokens";
import { sendAccountEmail, usesOnlineEmail } from "@/lib/email";
import { supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = await request.json() as { email?: string };
  const email = input.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Vul je e-mailadres in." }, { status: 400 });

  const user = usesSupabaseStorage()
    ? await supabaseSingle<{ id: string }>("users", { select: "id", filters: { email } })
    : await import("@/lib/db").then(({ db }) => db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined);
  let recoveryCode: string | undefined;
  if (user) {
    recoveryCode = createAccountToken();
    if (usesSupabaseStorage()) {
      await supabaseUpdate("users", { id: user.id }, {
        password_reset_token_hash: hashAccountToken(recoveryCode),
        password_reset_expires_at: tokenExpiry(30),
      });
    } else {
      const { db } = await import("@/lib/db");
      db.prepare("UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ? WHERE id = ?")
        .run(hashAccountToken(recoveryCode), tokenExpiry(30), user.id);
    }

    const emailResult = await sendAccountEmail({
      to: email,
      subject: "Je herstelcode voor Helder",
      text: `Je herstelcode voor Helder is: ${recoveryCode}\n\nDeze code is 30 minuten geldig. Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.`,
    });

    if (usesOnlineEmail() && !emailResult.sent) {
      return NextResponse.json({ error: "De herstelmail kon nog niet worden verstuurd. Controleer de Resend-instellingen." }, { status: 503 });
    }
  }

  return NextResponse.json({
    ok: true,
    message: usesOnlineEmail() ? "Als dit e-mailadres bekend is, is er een herstelmail verstuurd." : "Als dit e-mailadres bekend is, is er een herstelcode klaargezet.",
    recoveryCode: usesOnlineEmail() ? undefined : recoveryCode,
  });
}
