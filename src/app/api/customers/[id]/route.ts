import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";
import { isValidEmail } from "@/lib/validation";

export const runtime = "nodejs";

type CustomerInput = { name?: string; contact?: string; email?: string; street?: string; postalCode?: string; city?: string };
type ExistingCustomer = { id: string; revenueCents: number; color: string };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

async function getExistingCustomer(id: string, userId: string): Promise<ExistingCustomer | null> {
  if (usesSupabaseStorage()) {
    const row = await supabaseSingle<{ id: string; revenue_cents: number; color: string }>("customers", {
      select: "id,revenue_cents,color",
      filters: { id, user_id: userId },
    });
    return row ? { id: row.id, revenueCents: row.revenue_cents, color: row.color } : null;
  }
  const { db } = await import("@/lib/db");
  const row = db.prepare("SELECT id, revenue_cents AS revenueCents, color FROM customers WHERE id = ? AND user_id = ?")
    .get(id, userId) as ExistingCustomer | undefined;
  return row ?? null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await context.params;
  const input = await request.json() as CustomerInput;
  const fields = [input.name, input.email, input.street, input.postalCode, input.city];
  if (fields.some((value) => !value?.trim())) return NextResponse.json({ error: "Vul alle klantgegevens in." }, { status: 400 });
  if (!isValidEmail(input.email)) return NextResponse.json({ error: "Vul een geldig e-mailadres in." }, { status: 400 });

  const existing = await getExistingCustomer(id, user.id);
  if (!existing) return NextResponse.json({ error: "Deze klant bestaat niet." }, { status: 404 });

  const customer = {
    id,
    name: input.name!.trim(),
    contact: input.contact?.trim() ?? "",
    email: input.email!.trim().toLowerCase(),
    street: input.street!.trim(),
    postalCode: input.postalCode!.trim().toUpperCase(),
    city: input.city!.trim(),
    revenueCents: existing.revenueCents,
    initials: initials(input.name!),
    color: existing.color,
  };
  if (usesSupabaseStorage()) {
    await supabaseUpdate("customers", { id, user_id: user.id }, {
      name: customer.name,
      contact: customer.contact,
      email: customer.email,
      street: customer.street,
      postal_code: customer.postalCode,
      city: customer.city,
      initials: customer.initials,
    });
  } else {
    const { db } = await import("@/lib/db");
    db.prepare(`UPDATE customers SET name = ?, contact = ?, email = ?, street = ?, postal_code = ?, city = ?, initials = ?
      WHERE id = ? AND user_id = ?`)
      .run(customer.name, customer.contact, customer.email, customer.street, customer.postalCode, customer.city, customer.initials, id, user.id);
  }
  return NextResponse.json({ customer });
}
