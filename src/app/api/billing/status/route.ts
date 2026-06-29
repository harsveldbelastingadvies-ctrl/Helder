import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createMollieSubscription, getMollieApiKey, getMolliePayment, getPublicAppUrl } from "@/lib/mollie";
import { getPlan } from "@/lib/plans";
import { supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

type BillingRow = {
  id: string;
  plan_type: string;
  subscription_status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_activated_at: string | null;
  mollie_customer_id: string | null;
  mollie_last_payment_id: string | null;
  mollie_subscription_id: string | null;
};

type LocalBillingRow = {
  id: string;
  planType: string;
  subscriptionStatus: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  subscriptionActivatedAt: string | null;
  mollieCustomerId: string | null;
  mollieLastPaymentId: string | null;
  mollieSubscriptionId: string | null;
};

function nextMonthStartDate(now = new Date()) {
  const start = new Date(now);
  start.setMonth(start.getMonth() + 1);
  return start.toISOString().slice(0, 10);
}

function paymentStatusToSubscriptionStatus(status: string) {
  if (status === "paid" || status === "authorized") return "active";
  if (["failed", "canceled", "expired"].includes(status)) return "past_due";
  return null;
}

function toBillingStatus(row: BillingRow | LocalBillingRow, checkedAt = new Date().toISOString()) {
  const planType = "plan_type" in row ? row.plan_type : row.planType;
  const subscriptionStatus = "subscription_status" in row ? row.subscription_status : row.subscriptionStatus;
  const trialStartedAt = "trial_started_at" in row ? row.trial_started_at : row.trialStartedAt;
  const trialEndsAt = "trial_ends_at" in row ? row.trial_ends_at : row.trialEndsAt;
  const subscriptionActivatedAt = "subscription_activated_at" in row ? row.subscription_activated_at : row.subscriptionActivatedAt;
  const mollieCustomerId = "mollie_customer_id" in row ? row.mollie_customer_id : row.mollieCustomerId;
  const mollieLastPaymentId = "mollie_last_payment_id" in row ? row.mollie_last_payment_id : row.mollieLastPaymentId;
  const mollieSubscriptionId = "mollie_subscription_id" in row ? row.mollie_subscription_id : row.mollieSubscriptionId;
  const plan = getPlan(planType);

  return {
    planType: plan.id,
    planName: plan.name,
    priceLabel: plan.priceLabel,
    subscriptionStatus,
    trialStartedAt,
    trialEndsAt,
    subscriptionActivatedAt,
    mollieCustomerId,
    mollieLastPaymentId,
    mollieSubscriptionId,
    mollieConfigured: Boolean(getMollieApiKey()),
    checkedAt,
  };
}

async function getBillingRow(userId: string) {
  if (usesSupabaseStorage()) {
    return await supabaseSingle<BillingRow>("users", {
      select: "id,plan_type,subscription_status,trial_started_at,trial_ends_at,subscription_activated_at,mollie_customer_id,mollie_last_payment_id,mollie_subscription_id",
      filters: { id: userId },
    });
  }

  const { db } = await import("@/lib/db");
  return db.prepare(`SELECT id, plan_type AS planType, subscription_status AS subscriptionStatus,
    trial_started_at AS trialStartedAt, trial_ends_at AS trialEndsAt, subscription_activated_at AS subscriptionActivatedAt,
    mollie_customer_id AS mollieCustomerId, mollie_last_payment_id AS mollieLastPaymentId,
    mollie_subscription_id AS mollieSubscriptionId FROM users WHERE id = ?`).get(userId) as LocalBillingRow | undefined;
}

async function updateBilling(userId: string, patch: { subscriptionStatus?: string; mollieSubscriptionId?: string; mollieLastPaymentId?: string }) {
  if (usesSupabaseStorage()) {
    await supabaseUpdate("users", { id: userId }, {
      ...(patch.subscriptionStatus ? { subscription_status: patch.subscriptionStatus } : {}),
      ...(patch.mollieSubscriptionId ? { mollie_subscription_id: patch.mollieSubscriptionId } : {}),
      ...(patch.mollieLastPaymentId ? { mollie_last_payment_id: patch.mollieLastPaymentId } : {}),
      ...(patch.subscriptionStatus === "active" ? { subscription_activated_at: new Date().toISOString() } : {}),
    });
    return;
  }

  const { db } = await import("@/lib/db");
  db.prepare(`UPDATE users SET
    subscription_status = COALESCE(?, subscription_status),
    mollie_subscription_id = COALESCE(?, mollie_subscription_id),
    mollie_last_payment_id = COALESCE(?, mollie_last_payment_id),
    subscription_activated_at = CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE subscription_activated_at END
    WHERE id = ?`)
    .run(patch.subscriptionStatus ?? null, patch.mollieSubscriptionId ?? null, patch.mollieLastPaymentId ?? null, patch.subscriptionStatus ?? null, userId);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const row = await getBillingRow(user.id);
  if (!row) return NextResponse.json({ error: "Abonnementsstatus kon niet worden gevonden." }, { status: 404 });

  return NextResponse.json({ billing: toBillingStatus(row) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const row = await getBillingRow(user.id);
  if (!row) return NextResponse.json({ error: "Abonnementsstatus kon niet worden gevonden." }, { status: 404 });
  const current = toBillingStatus(row);
  if (!current.mollieLastPaymentId) return NextResponse.json({ billing: current, message: "Er is nog geen Mollie-betaling om te controleren." });
  if (!getMollieApiKey()) return NextResponse.json({ billing: current, message: "Mollie is nog niet ingesteld. Vul MOLLIE_API_KEY in." });

  const payment = await getMolliePayment(current.mollieLastPaymentId);
  const nextStatus = paymentStatusToSubscriptionStatus(payment.status);
  let mollieSubscriptionId = current.mollieSubscriptionId ?? payment.subscriptionId ?? null;

  if (nextStatus === "active" && !mollieSubscriptionId && current.mollieCustomerId) {
    const plan = getPlan(current.planType);
    const appUrl = getPublicAppUrl(request);
    const subscription = await createMollieSubscription({
      customerId: current.mollieCustomerId,
      amountCents: plan.monthlyPriceCents,
      description: `Helder ${plan.name} - maandabonnement`,
      webhookUrl: `${appUrl}/api/billing/mollie/webhook`,
      startDate: nextMonthStartDate(),
    });
    mollieSubscriptionId = subscription.id;
  }

  if (nextStatus) {
    await updateBilling(user.id, { subscriptionStatus: nextStatus, mollieSubscriptionId: mollieSubscriptionId ?? undefined, mollieLastPaymentId: payment.id });
  }

  const refreshed = await getBillingRow(user.id);
  return NextResponse.json({
    billing: refreshed ? toBillingStatus(refreshed) : current,
    message: nextStatus ? "Mollie-status opnieuw gecontroleerd." : `Mollie-betaling staat nog op ${payment.status}.`,
  });
}
