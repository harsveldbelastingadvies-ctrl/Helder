import { NextResponse } from "next/server";
import { createMollieSubscription, getMolliePayment, getPublicAppUrl } from "@/lib/mollie";
import { getPlan, isPlanId } from "@/lib/plans";
import { supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

type BillingStatus = "active" | "past_due";
type BillingUser = {
  id: string;
  planType: string;
  mollieCustomerId: string | null;
  mollieSubscriptionId: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function statusFromPayment(paymentStatus: string): BillingStatus | null {
  if (paymentStatus === "paid" || paymentStatus === "authorized") return "active";
  if (["failed", "canceled", "expired"].includes(paymentStatus)) return "past_due";
  return null;
}

function nextMonthStartDate(now = new Date()) {
  const start = new Date(now);
  start.setMonth(start.getMonth() + 1);
  return start.toISOString().slice(0, 10);
}

async function getBillingUser(input: { userId?: string; paymentId: string; subscriptionId?: string }) {
  if (usesSupabaseStorage()) {
    if (input.userId) {
      const row = await supabaseSingle<{ id: string; plan_type: string; mollie_customer_id: string | null; mollie_subscription_id: string | null }>("users", {
        select: "id,plan_type,mollie_customer_id,mollie_subscription_id",
        filters: { id: input.userId },
      });
      return row ? { id: row.id, planType: row.plan_type, mollieCustomerId: row.mollie_customer_id, mollieSubscriptionId: row.mollie_subscription_id } : null;
    }
    if (input.subscriptionId) {
      const row = await supabaseSingle<{ id: string; plan_type: string; mollie_customer_id: string | null; mollie_subscription_id: string | null }>("users", {
        select: "id,plan_type,mollie_customer_id,mollie_subscription_id",
        filters: { mollie_subscription_id: input.subscriptionId },
      });
      return row ? { id: row.id, planType: row.plan_type, mollieCustomerId: row.mollie_customer_id, mollieSubscriptionId: row.mollie_subscription_id } : null;
    }
    const row = await supabaseSingle<{ id: string; plan_type: string; mollie_customer_id: string | null; mollie_subscription_id: string | null }>("users", {
      select: "id,plan_type,mollie_customer_id,mollie_subscription_id",
      filters: { mollie_last_payment_id: input.paymentId },
    });
    return row ? { id: row.id, planType: row.plan_type, mollieCustomerId: row.mollie_customer_id, mollieSubscriptionId: row.mollie_subscription_id } : null;
  }

  const { db } = await import("@/lib/db");
  const where = input.userId
    ? { sql: "id = ?", value: input.userId }
    : input.subscriptionId
      ? { sql: "mollie_subscription_id = ?", value: input.subscriptionId }
      : { sql: "mollie_last_payment_id = ?", value: input.paymentId };
  const row = db.prepare(`SELECT id, plan_type AS planType, mollie_customer_id AS mollieCustomerId,
    mollie_subscription_id AS mollieSubscriptionId FROM users WHERE ${where.sql}`).get(where.value) as BillingUser | undefined;
  return row ?? null;
}

async function updateSubscription(input: { userId?: string; paymentId: string; status: BillingStatus; planType?: string; mollieSubscriptionId?: string }) {
  const patch = {
    subscription_status: input.status,
    ...(input.planType && isPlanId(input.planType) ? { plan_type: input.planType } : {}),
    mollie_last_payment_id: input.paymentId,
    ...(input.mollieSubscriptionId ? { mollie_subscription_id: input.mollieSubscriptionId } : {}),
    ...(input.status === "active" ? { subscription_activated_at: new Date().toISOString() } : {}),
  };

  if (usesSupabaseStorage()) {
    if (input.userId) await supabaseUpdate("users", { id: input.userId }, patch);
    else await supabaseUpdate("users", { mollie_last_payment_id: input.paymentId }, patch);
    return;
  }

  const { db } = await import("@/lib/db");
  if (input.userId) {
    db.prepare(`UPDATE users SET subscription_status = ?, plan_type = COALESCE(?, plan_type),
      mollie_last_payment_id = ?, mollie_subscription_id = COALESCE(?, mollie_subscription_id),
      subscription_activated_at = CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE subscription_activated_at END WHERE id = ?`)
      .run(input.status, input.planType && isPlanId(input.planType) ? input.planType : null, input.paymentId, input.mollieSubscriptionId ?? null, input.status, input.userId);
  } else {
    db.prepare(`UPDATE users SET subscription_status = ?, plan_type = COALESCE(?, plan_type),
      mollie_subscription_id = COALESCE(?, mollie_subscription_id),
      subscription_activated_at = CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE subscription_activated_at END
      WHERE mollie_last_payment_id = ?`)
      .run(input.status, input.planType && isPlanId(input.planType) ? input.planType : null, input.mollieSubscriptionId ?? null, input.status, input.paymentId);
  }
}

async function ensureMonthlySubscription(input: { request: Request; user: BillingUser; paymentCustomerId?: string; planType?: string }) {
  if (input.user.mollieSubscriptionId) return input.user.mollieSubscriptionId;
  const customerId = input.user.mollieCustomerId ?? input.paymentCustomerId;
  if (!customerId) return undefined;
  const plan = getPlan(input.planType && isPlanId(input.planType) ? input.planType : input.user.planType);
  const appUrl = getPublicAppUrl(input.request);
  const subscription = await createMollieSubscription({
    customerId,
    amountCents: plan.monthlyPriceCents,
    description: `Rekenrust ${plan.name} - maandabonnement`,
    webhookUrl: `${appUrl}/api/billing/mollie/webhook`,
    startDate: nextMonthStartDate(),
  });
  return subscription.id;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const paymentId = text(form.get("id"));
  if (!paymentId) return NextResponse.json({ error: "Mollie betaal-ID ontbreekt." }, { status: 400 });

  const payment = await getMolliePayment(paymentId);
  const nextStatus = statusFromPayment(payment.status);
  if (!nextStatus) return NextResponse.json({ ok: true, status: payment.status });

  const userId = text(payment.metadata?.userId);
  const planType = text(payment.metadata?.planType);
  const paymentSubscriptionId = text(payment.subscriptionId);
  const billingUser = await getBillingUser({ userId: userId || undefined, paymentId, subscriptionId: paymentSubscriptionId || undefined });
  const mollieSubscriptionId = nextStatus === "active" && billingUser
    ? paymentSubscriptionId || await ensureMonthlySubscription({ request, user: billingUser, paymentCustomerId: text(payment.customerId), planType })
    : paymentSubscriptionId || undefined;
  await updateSubscription({ userId: billingUser?.id ?? (userId || undefined), paymentId, status: nextStatus, planType, mollieSubscriptionId });

  return NextResponse.json({ ok: true, status: nextStatus, subscriptionId: mollieSubscriptionId ?? null });
}
