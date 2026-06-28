import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { supabaseInsert, supabaseSelect, usesSupabaseStorage } from "@/lib/supabase";
import { isValidEmail } from "@/lib/validation";

export const runtime = "nodejs";

type CustomerInput = { name?: string; contact?: string; email?: string; street?: string; postalCode?: string; city?: string };
type CustomerRow = {
  id: string;
  name: string;
  contact: string;
  email: string;
  street: string;
  postal_code: string;
  city: string;
  revenue_cents: number;
  initials: string;
  color: string;
};

function validate(input: CustomerInput) {
  const fields = [input.name, input.email, input.street, input.postalCode, input.city];
  if (fields.some((value) => !value?.trim())) return "Vul alle klantgegevens in.";
  if (!isValidEmail(input.email)) return "Vul een geldig e-mailadres in.";
  return null;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function toCustomer(row: CustomerRow) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    email: row.email,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    revenueCents: row.revenue_cents,
    initials: row.initials,
    color: row.color,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const customers = usesSupabaseStorage()
    ? (await supabaseSelect<CustomerRow>("customers", {
      select: "id,name,contact,email,street,postal_code,city,revenue_cents,initials,color",
      filters: { user_id: user.id },
      order: "name.asc",
    })).map(toCustomer)
    : await import("@/lib/db").then(({ db }) => db.prepare(`
      SELECT id, name, contact, email, street, postal_code AS postalCode, city,
        revenue_cents AS revenueCents, initials, color
      FROM customers WHERE user_id = ? ORDER BY name
    `).all(user.id));
  return NextResponse.json({ customers });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const input = await request.json() as CustomerInput;
  const error = validate(input);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const id = `customer-${randomUUID()}`;
  const colors = ["mint", "sand", "lilac", "blue"];
  const count = usesSupabaseStorage()
    ? (await supabaseSelect<{ id: string }>("customers", { select: "id", filters: { user_id: user.id } })).length
    : await import("@/lib/db").then(({ db }) => (db.prepare("SELECT COUNT(*) AS count FROM customers WHERE user_id = ?").get(user.id) as { count: number }).count);
  const customer = {
    id,
    name: input.name!.trim(),
    contact: input.contact?.trim() ?? "",
    email: input.email!.trim().toLowerCase(),
    street: input.street!.trim(),
    postalCode: input.postalCode!.trim().toUpperCase(),
    city: input.city!.trim(),
    revenueCents: 0,
    initials: initials(input.name!),
    color: colors[count % colors.length],
  };
  if (usesSupabaseStorage()) {
    await supabaseInsert("customers", {
      id: customer.id,
      user_id: user.id,
      name: customer.name,
      contact: customer.contact,
      email: customer.email,
      street: customer.street,
      postal_code: customer.postalCode,
      city: customer.city,
      revenue_cents: customer.revenueCents,
      initials: customer.initials,
      color: customer.color,
    });
  } else {
    const { db } = await import("@/lib/db");
    db.prepare(`INSERT INTO customers
      (id, user_id, name, contact, email, street, postal_code, city, revenue_cents, initials, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(customer.id, user.id, customer.name, customer.contact, customer.email, customer.street, customer.postalCode, customer.city, customer.revenueCents, customer.initials, customer.color);
  }
  return NextResponse.json({ customer }, { status: 201 });
}
