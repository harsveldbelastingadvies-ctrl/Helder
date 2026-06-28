import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { usesOnlineEmail } from "@/lib/email";
import { checkPdfRuntime } from "@/lib/pdf-runtime";
import { getSupabaseConfig, supabaseHealthCheck, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

type ReadinessItem = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  action: string;
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const items: ReadinessItem[] = [];
  const supabaseConfig = getSupabaseConfig();
  const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  const localMode = process.env.HELDER_LOCAL === "true";
  const demoDataOff = process.env.HELDER_SEED_DEMO === "false";
  const storageMode = usesSupabaseStorage() ? "supabase" : "local";
  const pdfRuntime = checkPdfRuntime();

  let supabaseOk = false;
  if (usesSupabaseStorage()) {
    try {
      const health = await supabaseHealthCheck();
      supabaseOk = health.ok;
    } catch {
      supabaseOk = false;
    }
  }

  items.push({
    key: "storage",
    label: "Online opslag",
    ok: usesSupabaseStorage() && supabaseOk,
    detail: usesSupabaseStorage()
      ? supabaseOk
        ? "Supabase is bereikbaar voor database en bonnenopslag."
        : "Supabase staat aan, maar is nog niet volledig bereikbaar."
      : "Helder gebruikt nu lokale opslag. Prima voor testen, niet voor livegang.",
    action: usesSupabaseStorage()
      ? supabaseOk
        ? "Geen actie nodig. Test straks nog wel klant, factuur, kosten en bon uploaden in de online omgeving."
        : "Controleer in Supabase of de tabellen uit supabase/schema.sql zijn aangemaakt en of de storage bucket helder bestaat."
      : "Zet in Vercel de omgevingsvariabele HELDER_STORAGE op supabase.",
  });

  items.push({
    key: "supabaseConfig",
    label: "Supabase ingesteld",
    ok: Boolean(supabaseConfig),
    detail: supabaseConfig
      ? "Project-URL, geheime sleutel en bucketnaam zijn aanwezig."
      : "Vul de Supabase project-URL, geheime sleutel en bucketnaam in.",
    action: supabaseConfig
      ? "Geen actie nodig. Let erop dat SUPABASE_URL eindigt op .supabase.co en niet op /rest/v1."
      : "Vul in Vercel SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY en SUPABASE_STORAGE_BUCKET in.",
  });

  items.push({
    key: "email",
    label: "E-mail voor accounts",
    ok: usesOnlineEmail() && resendConfigured,
    detail: usesOnlineEmail() && resendConfigured
      ? "Resend is ingesteld voor e-mailbevestiging en wachtwoordherstel."
      : resendConfigured
        ? "Resend is ingevuld, maar Helder draait nog in lokale modus."
        : "Vul Resend in voor e-mailbevestiging en wachtwoordherstel.",
    action: usesOnlineEmail() && resendConfigured
      ? "Geen actie nodig. Test straks wel wachtwoordherstel en e-mailbevestiging met een echt e-mailadres."
      : resendConfigured
        ? "Zet HELDER_LOCAL online op false of laat deze leeg, zodat echte e-mails gebruikt worden."
        : "Maak in Resend een API-sleutel aan en vul in Vercel RESEND_API_KEY en RESEND_FROM_EMAIL in.",
  });

  items.push({
    key: "demoData",
    label: "Demo-data uit",
    ok: demoDataOff,
    detail: demoDataOff
      ? "Nieuwe online omgevingen krijgen geen voorbeeldadministratie."
      : "Zet HELDER_SEED_DEMO op false voordat echte ondernemers inloggen.",
    action: demoDataOff
      ? "Geen actie nodig."
      : "Zet in Vercel HELDER_SEED_DEMO op false.",
  });

  items.push({
    key: "secureCookies",
    label: "Veilige login-cookies",
    ok: !localMode,
    detail: localMode
      ? "HELDER_LOCAL staat nog op true. Dat is handig lokaal, maar online moet dit uit."
      : "Cookies worden online extra veilig ingesteld.",
    action: localMode
      ? "Zet in Vercel HELDER_LOCAL op false of verwijder deze variabele."
      : "Geen actie nodig.",
  });

  items.push({
    key: "backup",
    label: "Back-up en herstel",
    ok: true,
    detail: "Handmatige back-up, controle en terugzetten zijn beschikbaar, inclusief bonbestanden.",
    action: "Test vóór livegang één keer: back-up downloaden, testgegevens verwijderen en back-up terugzetten in een veilige testomgeving.",
  });

  items.push({
    key: "pdf",
    label: "PDF-downloads",
    ok: pdfRuntime.ok,
    detail: pdfRuntime.ok
      ? "De PDF-motor is beschikbaar voor facturen en rapporten."
      : "De PDF-motor is nog niet beschikbaar in deze omgeving.",
    action: pdfRuntime.ok
      ? "Geen actie nodig. Test online nog één factuur-PDF en één rapport-PDF."
      : "Controleer of Python met reportlab beschikbaar is, of bouw de PDF-functies om naar een Vercel-vriendelijke PDF-oplossing.",
  });

  const ready = items.filter((item) => item.ok).length;
  const score = Math.round((ready / items.length) * 100);
  const ok = items.every((item) => item.ok);

  return NextResponse.json({
    readiness: {
      ok,
      score,
      storageMode,
      checkedAt: new Date().toISOString(),
      message: ok
        ? "Helder staat technisch klaar voor een besloten online pilot."
        : "Helder is nog niet helemaal klaar voor livegang. Rond eerst de aandachtspunten af.",
      nextAction: items.find((item) => !item.ok)?.action ?? "Start een besloten online pilot en test de volledige flow met een testaccount.",
      items,
    },
  });
}
