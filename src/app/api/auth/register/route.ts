import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { createTrialPeriod, isPlanId } from "@/lib/plans";
import { supabaseInsert, supabaseSingle, usesSupabaseStorage } from "@/lib/supabase";
import { isValidEmail } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = await request.json() as { name?: string; companyName?: string; email?: string; password?: string; planType?: string };
  const name = input.name?.trim();
  const companyName = input.companyName?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? "";
  const planType = isPlanId(input.planType) ? input.planType : "basis";

  if (!name || !companyName || !email || !password) {
    return NextResponse.json({ error: "Vul je naam, bedrijfsnaam, e-mailadres en wachtwoord in." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Vul een geldig e-mailadres in." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Kies een wachtwoord van minimaal 8 tekens." }, { status: 400 });
  }

  const existing = usesSupabaseStorage()
    ? await supabaseSingle<{ id: string }>("users", { select: "id", filters: { email } })
    : await import("@/lib/db").then(({ db }) => db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined);
  if (existing) {
    return NextResponse.json({ error: "Er bestaat al een account met dit e-mailadres." }, { status: 409 });
  }

  const id = `user-${randomUUID()}`;
  const trial = createTrialPeriod();
  if (usesSupabaseStorage()) {
    await supabaseInsert("users", {
      id,
      name,
      email,
      password_hash: hashPassword(password),
      company_name: companyName,
      plan_type: planType,
      subscription_status: "trialing",
      trial_started_at: trial.trialStartedAt,
      trial_ends_at: trial.trialEndsAt,
    });
  } else {
    const { db } = await import("@/lib/db");
    db.prepare(`INSERT INTO users
      (id, name, email, password_hash, company_name, plan_type, subscription_status, trial_started_at, trial_ends_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name, email, hashPassword(password), companyName, planType, "trialing", trial.trialStartedAt, trial.trialEndsAt);
  }

  await createSession(id);
  return NextResponse.json({ ok: true }, { status: 201 });
}
