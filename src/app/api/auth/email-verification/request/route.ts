import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAccountToken, hashAccountToken, tokenExpiry } from "@/lib/account-tokens";
import { sendAccountEmail, usesOnlineEmail } from "@/lib/email";
import { supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const verificationCode = createAccountToken();
  if (usesSupabaseStorage()) {
    await supabaseUpdate("users", { id: user.id }, {
      email_verification_token_hash: hashAccountToken(verificationCode),
      email_verification_expires_at: tokenExpiry(60),
    });
  } else {
    const { db } = await import("@/lib/db");
    db.prepare("UPDATE users SET email_verification_token_hash = ?, email_verification_expires_at = ? WHERE id = ?")
      .run(hashAccountToken(verificationCode), tokenExpiry(60), user.id);
  }

  const emailResult = await sendAccountEmail({
    to: user.email,
    subject: "Bevestig je e-mailadres voor Rekenrust",
    text: `Hallo ${user.name},\n\nJe bevestigingscode voor Rekenrust is: ${verificationCode}\n\nDeze code is 60 minuten geldig.`,
  });

  if (usesOnlineEmail() && !emailResult.sent) {
    return NextResponse.json({ error: "De bevestigingsmail kon nog niet worden verstuurd. Controleer de Resend-instellingen." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    message: usesOnlineEmail() ? "Er is een bevestigingsmail verstuurd." : "Er is een bevestigingscode klaargezet.",
    verificationCode: usesOnlineEmail() ? undefined : verificationCode,
  });
}
