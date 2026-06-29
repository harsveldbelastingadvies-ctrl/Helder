import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createMollieCustomer, createMollieFirstPayment, getPublicAppUrl } from "@/lib/mollie";
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
  mollie_customer_id?: string | null;
  mollieCustomerId?: string | null;
};

async function getBillingUser(userId: string) {
  if (usesSupabaseStorage()) {
    return await supabaseSingle<BillingUserRow>("users", {
      select: "id,name,email,company_name,plan_type,mollie_customer_id",
      filters: { id: userId },
    });
  }

  const { db } = await import("@/lib/db");
  return db.prepare(`SELECT id, name, email, company_name AS companyName, plan_type AS planType,
    mollie_customer_id AS mollieCustomerId FROM users WHERE id = ?`).get(userId) as BillingUserRow | undefined;
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

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const billingUser = await getBillingUser(sessionUser.id);
  if (!billingUser) return NextResponse.json({ error: "Account niet gevonden." }, { status: 404 });

  const plan = getPlan(billingUser.plan_type ?? billingUser.planType ?? sessionUser.planType);
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
}
