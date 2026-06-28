import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { supabaseSelect, supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";
import { isValidEmail } from "@/lib/validation";

export const runtime = "nodejs";

type SettingsInput = {
  companyName?: string;
  owner?: string;
  email?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  kvkNumber?: string;
  vatNumber?: string;
  iban?: string;
  invoicePaymentTerm?: number;
  defaultVatRate?: number;
  invoiceFooter?: string;
  invoiceLogo?: string;
};

type SupabaseSettingsRow = {
  company_name: string;
  name: string;
  email: string;
  street: string;
  postal_code: string;
  city: string;
  kvk_number: string;
  vat_number: string;
  iban: string;
  invoice_payment_term: number;
  default_vat_rate: number;
  invoice_footer: string;
  invoice_logo: string;
};

function toSettings(row: SupabaseSettingsRow) {
  return {
    companyName: row.company_name,
    owner: row.name,
    email: row.email,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    kvkNumber: row.kvk_number,
    vatNumber: row.vat_number,
    iban: row.iban,
    invoicePaymentTerm: row.invoice_payment_term,
    defaultVatRate: row.default_vat_rate,
    invoiceFooter: row.invoice_footer,
    invoiceLogo: row.invoice_logo,
  };
}

async function getSettings(userId: string) {
  if (usesSupabaseStorage()) {
    const row = await supabaseSingle<SupabaseSettingsRow>("users", {
      select: "company_name,name,email,street,postal_code,city,kvk_number,vat_number,iban,invoice_payment_term,default_vat_rate,invoice_footer,invoice_logo",
      filters: { id: userId },
    });
    return row ? toSettings(row) : null;
  }
  const { db } = await import("@/lib/db");
  return db.prepare(`SELECT company_name AS companyName, name AS owner, email, street,
    postal_code AS postalCode, city, kvk_number AS kvkNumber, vat_number AS vatNumber, iban,
    invoice_payment_term AS invoicePaymentTerm, default_vat_rate AS defaultVatRate, invoice_footer AS invoiceFooter,
    invoice_logo AS invoiceLogo
    FROM users WHERE id = ?`).get(userId);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  return NextResponse.json({ settings: await getSettings(user.id) });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const input = await request.json() as SettingsInput;
  const required = [input.companyName, input.owner, input.email, input.street, input.postalCode, input.city, input.kvkNumber, input.vatNumber, input.iban];
  if (required.some((value) => !value?.trim())) return NextResponse.json({ error: "Vul alle bedrijfsgegevens in." }, { status: 400 });
  if (!isValidEmail(input.email)) return NextResponse.json({ error: "Vul een geldig e-mailadres in." }, { status: 400 });
  if (!/^\d{8}$/.test(input.kvkNumber!.replace(/\s/g, ""))) return NextResponse.json({ error: "Een KvK-nummer bestaat uit 8 cijfers." }, { status: 400 });
  if (!/^NL\d{9}B\d{2}$/i.test(input.vatNumber!.replace(/\s/g, ""))) return NextResponse.json({ error: "Controleer het btw-id, bijvoorbeeld NL123456789B01." }, { status: 400 });
  if (!/^NL\d{2}[A-Z]{4}\d{10}$/i.test(input.iban!.replace(/\s/g, ""))) return NextResponse.json({ error: "Controleer het Nederlandse IBAN." }, { status: 400 });
  const invoicePaymentTerm = Number(input.invoicePaymentTerm ?? 14);
  const defaultVatRate = Number(input.defaultVatRate ?? 21);
  const invoiceFooter = input.invoiceFooter?.trim() || "Bedankt voor de fijne samenwerking.";
  const invoiceLogo = input.invoiceLogo?.trim() ?? "";
  if (![7, 14, 30, 60].includes(invoicePaymentTerm)) return NextResponse.json({ error: "Kies een betaaltermijn van 7, 14, 30 of 60 dagen." }, { status: 400 });
  if (![0, 9, 21].includes(defaultVatRate)) return NextResponse.json({ error: "Kies een standaard btw-tarief van 0%, 9% of 21%." }, { status: 400 });
  if (invoiceFooter.length > 240) return NextResponse.json({ error: "Houd de standaard factuurtekst korter dan 240 tekens." }, { status: 400 });
  if (invoiceLogo && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(invoiceLogo)) return NextResponse.json({ error: "Kies een png- of jpg-logo." }, { status: 400 });
  if (invoiceLogo.length > 700_000) return NextResponse.json({ error: "Het logo is te groot. Kies een kleiner png- of jpg-bestand." }, { status: 400 });

  const email = input.email!.trim().toLowerCase();
  const existingEmail = usesSupabaseStorage()
    ? (await supabaseSelect<{ id: string }>("users", { select: "id", filters: { email } })).find((row) => row.id !== user.id)
    : await import("@/lib/db").then(({ db }) => db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, user.id) as { id: string } | undefined);
  if (existingEmail) return NextResponse.json({ error: "Dit e-mailadres hoort al bij een ander account." }, { status: 409 });

  const patch = {
    company_name: input.companyName!.trim(),
    name: input.owner!.trim(),
    email,
    street: input.street!.trim(),
    postal_code: input.postalCode!.trim().toUpperCase(),
    city: input.city!.trim(),
    kvk_number: input.kvkNumber!.replace(/\s/g, ""),
    vat_number: input.vatNumber!.replace(/\s/g, "").toUpperCase(),
    iban: input.iban!.replace(/(.{4})/g, "$1 ").trim().toUpperCase(),
    invoice_payment_term: invoicePaymentTerm,
    default_vat_rate: defaultVatRate,
    invoice_footer: invoiceFooter,
    invoice_logo: invoiceLogo,
  };

  try {
    if (usesSupabaseStorage()) {
      const rows = await supabaseUpdate<SupabaseSettingsRow>("users", { id: user.id }, patch);
      if (!rows.length) return NextResponse.json({ error: "De bedrijfsgegevens konden niet worden opgeslagen." }, { status: 404 });
    } else {
      const { db } = await import("@/lib/db");
      db.prepare(`UPDATE users SET company_name = ?, name = ?, email = ?, street = ?, postal_code = ?, city = ?,
        kvk_number = ?, vat_number = ?, iban = ?, invoice_payment_term = ?, default_vat_rate = ?, invoice_footer = ?, invoice_logo = ? WHERE id = ?`)
        .run(patch.company_name, patch.name, patch.email, patch.street, patch.postal_code, patch.city,
          patch.kvk_number, patch.vat_number, patch.iban, patch.invoice_payment_term, patch.default_vat_rate, patch.invoice_footer, patch.invoice_logo, user.id);
    }
  } catch {
    return NextResponse.json({ error: "De bedrijfsgegevens konden niet worden opgeslagen. Controleer vooral het e-mailadres." }, { status: 400 });
  }
  return NextResponse.json({ settings: await getSettings(user.id) });
}
