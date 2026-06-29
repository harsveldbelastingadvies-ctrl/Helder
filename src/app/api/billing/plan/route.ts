import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getMollieApiKey, getMolliePayment } from "@/lib/mollie";
import { getPlan, isPlanId } from "@/lib/plans";
import { supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

type BillingPlanRow = {
  id: string;
  plan_type?: string;
  planType?: string;
  subscription_status?: string;
  subscriptionStatus?: string;
  mollie_last_payment_id?: string | null;
  mollieLastPaymentId?: string | null;
  mollie_subscription_id?: string | null;
  mollieSubscriptionId?: string | null;
};

async function getBillingPlanRow(userId: string) {
  if (usesSupabaseStorage()) {
    return await supabaseSingle<BillingPlanRow>("users", {
      select: "id,plan_type,subscription_status,mollie_last_payment_id,mollie_subscription_id",
      filters: { id: userId },
    });
  }

  const { db } = await import("@/lib/db");
  return db.prepare(`SELECT id, plan_type AS planType, subscription_status AS subscriptionStatus,
    mollie_last_payment_id AS mollieLastPaymentId, mollie_subscription_id AS mollieSubscriptionId
    FROM users WHERE id = ?`).get(userId) as BillingPlanRow | undefined;
}

async function updatePlan(userId: string, planType: string, clearLastPayment: boolean) {
  if (usesSupabaseStorage()) {
    await supabaseUpdate("users", { id: userId }, {
      plan_type: planType,
      ...(clearLastPayment ? { mollie_last_payment_id: null } : {}),
    });
    return;
  }

  const { db } = await import("@/lib/db");
  db.prepare(`UPDATE users SET plan_type = ?, mollie_last_payment_id = CASE WHEN ? THEN NULL ELSE mollie_last_payment_id END WHERE id = ?`)
    .run(planType, clearLastPayment ? 1 : 0, userId);
}

function paymentIsStillOpen(status: string) {
  return status === "open" || status === "pending";
}

function paymentIsFinished(status: string) {
  return status === "paid" || status === "authorized";
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const input = await request.json() as { planType?: string };
  if (!isPlanId(input.planType)) {
    return NextResponse.json({ error: "Kies een geldig pakket." }, { status: 400 });
  }

  const row = await getBillingPlanRow(user.id);
  if (!row) return NextResponse.json({ error: "Account niet gevonden." }, { status: 404 });

  const subscriptionStatus = row.subscription_status ?? row.subscriptionStatus ?? user.subscriptionStatus;
  const currentPlan = getPlan(row.plan_type ?? row.planType ?? user.planType);
  const nextPlan = getPlan(input.planType);
  const mollieLastPaymentId = row.mollie_last_payment_id ?? row.mollieLastPaymentId ?? null;
  const mollieSubscriptionId = row.mollie_subscription_id ?? row.mollieSubscriptionId ?? null;

  if (subscriptionStatus === "active" || mollieSubscriptionId) {
    return NextResponse.json({ error: "Je abonnement is al actief. Neem contact op om veilig van pakket te wisselen." }, { status: 409 });
  }

  if (currentPlan.id === nextPlan.id) {
    return NextResponse.json({ ok: true, planType: currentPlan.id, message: "Dit pakket stond al ingesteld." });
  }

  let clearLastPayment = false;
  if (mollieLastPaymentId) {
    if (!getMollieApiKey()) {
      return NextResponse.json({ error: "Er bestaat al een Mollie-betaalpoging. Controleer eerst de betaalstatus voordat je van pakket wisselt." }, { status: 409 });
    }
    const payment = await getMolliePayment(mollieLastPaymentId);
    if (paymentIsStillOpen(payment.status)) {
      return NextResponse.json({ error: "Er staat nog een betaling open bij Mollie. Rond die betaling af of wacht tot deze vervalt voordat je het pakket wijzigt." }, { status: 409 });
    }
    if (paymentIsFinished(payment.status)) {
      return NextResponse.json({ error: "Mollie heeft al een betaling ontvangen. Controleer eerst de abonnementsstatus." }, { status: 409 });
    }
    clearLastPayment = true;
  }

  await updatePlan(user.id, nextPlan.id, clearLastPayment);

  return NextResponse.json({
    ok: true,
    planType: nextPlan.id,
    message: `Pakket gewijzigd naar ${nextPlan.name} (${nextPlan.priceLabel}).`,
  });
}
