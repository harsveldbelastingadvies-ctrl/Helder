import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createMollieCustomer, createMollieFirstPayment, getMollieApiKey, getMolliePayment, getPublicAppUrl, type MolliePayment } from "@/lib/mollie";
import { getPlan } from "@/lib/plans";
import { supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

type BillingUserRow = {
  id: string;
  name: string;
  email: string;
  company_name?: string;
  companyName?: string;
  plan_type?: string;
  planType?: string;
  subscription_status?: string;
  subscriptionStatus?: string;
  mollie_customer_id?: string | null;
  mollieCustomerId?: string | null;
  mollie_last_payment_id?: string | null;
  mollieLastPaymentId?: string | null;
  mollie_subscription_id?: string | null;
  mollieSubscriptionId?: string | null;
};

async function getBillingUser(userId: string) {
  if (usesSupabaseStorage()) {
    return await supabaseSingle<BillingUserRow>("users", {
      select: "id,name,email,company_name,plan_type,subscription_status,mollie_customer_id,mollie_last_payment_id,mollie_subscription_id",
      filters: { id: userId },
    });
  }

  const { db } = await import("@/lib/db");
  return db.prepare(`SELECT id, name, email, company_name AS companyName, plan_type AS planType,
    subscription_status AS subscriptionStatus, mollie_customer_id AS mollieCustomerId,
    mollie_last_payment_id AS mollieLastPaymentId, mollie_subscription_id AS mollieSubscriptionId
    FROM users WHERE id = ?`).get(userId) as BillingUserRow | undefined;
}

async function updateBillingUser(userId: string, patch: { mollieCustomerId?: string; mollieLastPaymentId?: string }) {
  if (usesSupabaseStorage()) {
    await supabaseUpdate("users", { id: userId }, {
      ...(patch.mollieCustomerId ? { mollie_customer_id: patch.mollieCustomerId } : {}),
      ...(patch.mollieLastPaymentId ? { mollie_last_payment_id: patch.mollieLastPaymentId } : {}),
    });
    return;
  }

  const { db } = await import("@/lib/db");
  if (patch.mollieCustomerId) {
    db.prepare("UPDATE users SET mollie_customer_id = ? WHERE id = ?").run(patch.mollieCustomerId, userId);
  }
  if (patch.mollieLastPaymentId) {
    db.prepare("UPDATE users SET mollie_last_payment_id = ? WHERE id = ?").run(patch.mollieLastPaymentId, userId);
  }
}

function isLocalUrl(url: string) {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

function checkoutUrlFrom(payment: MolliePayment) {
  return payment._links?.checkout?.href ?? null;
}

function paymentCanBeReused(status: string) {
  return status === "open" || status === "pending";
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const billingUser = await getBillingUser(sessionUser.id);
  if (!billingUser) return NextResponse.json({ error: "Account niet gevonden." }, { status: 404 });

  const plan = getPlan(billingUser.plan_type ?? billingUser.planType ?? sessionUser.planType);
  const subscriptionStatus = billingUser.subscription_status ?? billingUser.subscriptionStatus ?? sessionUser.subscriptionStatus;
  const mollieSubscriptionId = billingUser.mollie_subscription_id ?? billingUser.mollieSubscriptionId;
  const mollieLastPaymentId = billingUser.mollie_last_payment_id ?? billingUser.mollieLastPaymentId;

  if (subscriptionStatus === "active" && mollieSubscriptionId) {
    return NextResponse.json({ error: "Je pakket is al actief. Je hoeft niet opnieuw te betalen." }, { status: 409 });
  }

  if (!getMollieApiKey()) {
    return NextResponse.json({ error: "Mollie is nog niet ingesteld. Vul in Vercel de Mollie API-key in voordat ondernemers kunnen betalen." }, { status: 503 });
  }

  if (mollieLastPaymentId) {
    try {
      const previousPayment = await getMolliePayment(mollieLastPaymentId);
      const previousCheckoutUrl = checkoutUrlFrom(previousPayment);
      if (paymentCanBeReused(previousPayment.status) && previousCheckoutUrl) {
        return NextResponse.json({
          checkoutUrl: previousCheckoutUrl,
          paymentId: previousPayment.id,
          reusedPayment: true,
        });
      }
      if (previousPayment.status === "paid" || previousPayment.status === "authorized") {
        return NextResponse.json({
          error: "Mollie heeft de vorige betaling al ontvangen. Controleer de abonnementsstatus of ververs Helder even.",
        }, { status: 409 });
      }
      if (paymentCanBeReused(previousPayment.status)) {
        return NextResponse.json({
          error: "Er loopt al een betaling bij Mollie. Wacht even of controleer de abonnementsstatus.",
        }, { status: 409 });
      }
    } catch {
      // Als de oude Mollie-betaling niet meer kan worden opgehaald, maken we hieronder veilig een nieuwe betaalpoging.
    }
  }

  try {
    const appUrl = getPublicAppUrl(request);
    const mollieCustomerId = billingUser.mollie_customer_id ?? billingUser.mollieCustomerId
      ?? (await createMollieCustomer({
        name: billingUser.company_name ?? billingUser.companyName ?? billingUser.name,
        email: billingUser.email,
      })).id;

    await updateBillingUser(sessionUser.id, { mollieCustomerId });

    const payment = await createMollieFirstPayment({
      customerId: mollieCustomerId,
      amountCents: plan.monthlyPriceCents,
      description: `Helder ${plan.name} - eerste maand`,
      redirectUrl: `${appUrl}/?betaling=terug`,
      webhookUrl: isLocalUrl(appUrl) ? undefined : `${appUrl}/api/billing/mollie/webhook`,
      metadata: {
        userId: sessionUser.id,
        planType: plan.id,
        product: "Helder",
      },
    });

    await updateBillingUser(sessionUser.id, { mollieLastPaymentId: payment.id });

    return NextResponse.json({
      checkoutUrl: payment.checkoutUrl,
      paymentId: payment.id,
    });
  } catch (caught) {
    return NextResponse.json({
      error: caught instanceof Error ? caught.message : "Mollie-betaalpagina kon niet worden geopend.",
    }, { status: 502 });
  }
}
