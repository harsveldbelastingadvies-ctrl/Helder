import { NextResponse } from "next/server";
import { getMolliePayment } from "@/lib/mollie";
import { isPlanId } from "@/lib/plans";
import { supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

type BillingStatus = "active" | "past_due";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function statusFromPayment(paymentStatus: string): BillingStatus | null {
  if (paymentStatus === "paid" || paymentStatus === "authorized") return "active";
  if (["failed", "canceled", "expired"].includes(paymentStatus)) return "past_due";
  return null;
}

async function updateSubscription(input: { userId?: string; paymentId: string; status: BillingStatus; planType?: string }) {
  const patch = {
    subscription_status: input.status,
    ...(input.planType && isPlanId(input.planType) ? { plan_type: input.planType } : {}),
    mollie_last_payment_id: input.paymentId,
  };

  if (usesSupabaseStorage()) {
    if (input.userId) await supabaseUpdate("users", { id: input.userId }, patch);
    else await supabaseUpdate("users", { mollie_last_payment_id: input.paymentId }, patch);
    return;
  }

  const { db } = await import("@/lib/db");
  if (input.userId) {
    db.prepare(`UPDATE users SET subscription_status = ?, plan_type = COALESCE(?, plan_type),
      mollie_last_payment_id = ? WHERE id = ?`)
      .run(input.status, input.planType && isPlanId(input.planType) ? input.planType : null, input.paymentId, input.userId);
  } else {
    db.prepare(`UPDATE users SET subscription_status = ?, plan_type = COALESCE(?, plan_type)
      WHERE mollie_last_payment_id = ?`)
      .run(input.status, input.planType && isPlanId(input.planType) ? input.planType : null, input.paymentId);
  }
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
  await updateSubscription({ userId: userId || undefined, paymentId, status: nextStatus, planType });

  return NextResponse.json({ ok: true, status: nextStatus });
}
