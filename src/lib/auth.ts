import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { PlanId, SubscriptionStatus } from "./plans";
import { supabaseDelete, supabaseInsert, supabaseSelect, supabaseSingle, usesSupabaseStorage } from "./supabase";

const COOKIE_NAME = "helder_session";
const SESSION_LENGTH = 7 * 24 * 60 * 60 * 1000;

type SessionUser = {
  id: string;
  name: string;
  email: string;
  companyName: string;
  emailVerified: boolean;
  planType: PlanId;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
};
export type SessionOverview = { activeSessions: number; currentSessionExpiresAt: string | null };

type SupabaseSessionRow = { token_hash: string; user_id: string; expires_at: number };
type SupabaseUserRow = {
  id: string;
  name: string;
  email: string;
  company_name: string;
  email_verified_at: string | null;
  plan_type?: PlanId;
  subscription_status?: SubscriptionStatus;
  trial_ends_at?: string | null;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_LENGTH;
  if (usesSupabaseStorage()) {
    await supabaseDelete("sessions", { expires_at: { op: "lt", value: Date.now() } });
    await supabaseInsert("sessions", { token_hash: tokenHash(token), user_id: userId, expires_at: expiresAt });
  } else {
    const { db } = await import("./db");
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash(token), userId, expiresAt);
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.HELDER_LOCAL !== "true",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  if (usesSupabaseStorage()) {
    const session = await supabaseSingle<SupabaseSessionRow>("sessions", {
      select: "token_hash,user_id,expires_at",
      filters: { token_hash: tokenHash(token), expires_at: { op: "gt", value: Date.now() } },
    });
    if (!session) return null;
    let user: SupabaseUserRow | null;
    try {
      user = await supabaseSingle<SupabaseUserRow>("users", {
        select: "id,name,email,company_name,email_verified_at,plan_type,subscription_status,trial_ends_at",
        filters: { id: session.user_id },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("plan_type") && !message.includes("subscription_status") && !message.includes("trial_ends_at")) throw error;
      user = await supabaseSingle<SupabaseUserRow>("users", {
        select: "id,name,email,company_name,email_verified_at",
        filters: { id: session.user_id },
      });
    }
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      companyName: user.company_name,
      emailVerified: Boolean(user.email_verified_at),
      planType: user.plan_type ?? "basis",
      subscriptionStatus: user.subscription_status ?? "trialing",
      trialEndsAt: user.trial_ends_at ?? null,
    };
  } else {
    const { db } = await import("./db");
    const row = db.prepare(`
      SELECT users.id, users.name, users.email, users.company_name AS companyName,
        users.plan_type AS planType, users.subscription_status AS subscriptionStatus, users.trial_ends_at AS trialEndsAt,
        CASE WHEN users.email_verified_at IS NULL THEN 0 ELSE 1 END AS emailVerified
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash(token), Date.now()) as SessionUser | undefined;
    return row ? { ...row, emailVerified: Boolean(row.emailVerified), planType: row.planType ?? "basis", subscriptionStatus: row.subscriptionStatus ?? "trialing", trialEndsAt: row.trialEndsAt ?? null } : null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    if (usesSupabaseStorage()) await supabaseDelete("sessions", { token_hash: tokenHash(token) });
    else {
      const { db } = await import("./db");
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
    }
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionOverview(userId: string): Promise<SessionOverview> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (usesSupabaseStorage()) {
    await supabaseDelete("sessions", { expires_at: { op: "lt", value: Date.now() } });
    const active = await supabaseSelect<SupabaseSessionRow>("sessions", {
      select: "token_hash,user_id,expires_at",
      filters: { user_id: userId, expires_at: { op: "gt", value: Date.now() } },
    });
    const current = token ? active.find((session) => session.token_hash === tokenHash(token)) : undefined;
    return { activeSessions: active.length, currentSessionExpiresAt: current ? new Date(current.expires_at).toISOString() : null };
  } else {
    const { db } = await import("./db");
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    const activeSessions = (db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND expires_at > ?")
      .get(userId, Date.now()) as { count: number }).count;
    const current = token ? db.prepare("SELECT expires_at AS expiresAt FROM sessions WHERE token_hash = ? AND user_id = ? AND expires_at > ?")
      .get(tokenHash(token), userId, Date.now()) as { expiresAt: number } | undefined : undefined;
    return { activeSessions, currentSessionExpiresAt: current ? new Date(current.expiresAt).toISOString() : null };
  }
}

export async function destroyAllSessions(userId: string) {
  if (usesSupabaseStorage()) await supabaseDelete("sessions", { user_id: userId });
  else {
    const { db } = await import("./db");
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }
  (await cookies()).delete(COOKIE_NAME);
}
