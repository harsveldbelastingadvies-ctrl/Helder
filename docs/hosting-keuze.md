# Hostingkeuze Rekenrust

We kiezen voor de serieuze route: **Vercel + Supabase + Resend**.

## Waarom deze combinatie?

- **Vercel** is sterk voor Next.js-apps zoals Rekenrust. Het regelt de website, deployments, HTTPS en domeinkoppeling.
- **Supabase** is geschikt voor de online database en opslag van bonnetjes/bestanden.
- **Resend** is geschikt voor transactionele e-mail, zoals e-mailbevestiging en wachtwoordherstel.

## Wat is nu al voorbereid?

- Rekenrust kan lokaal blijven draaien zoals nu.
- Online testcodes worden niet meer op het scherm getoond wanneer `HELDER_LOCAL` niet op `true` staat.
- Resend is voorbereid voor e-mailbevestiging en wachtwoordherstel.
- De benodigde omgevingsvariabelen staan in `.env.example`.
- In Instellingen staat een livegang-check met concrete vervolgacties.
- Het praktische Vercel-stappenplan staat in `docs/vercel-stappenplan.md`.
- De route naar live staat in `docs/production-readiness.md`.

## Wat moet nog gebeuren?

### 1. Vercel

- Vercel-account aanmaken.
- Project koppelen aan de Rekenrust-code.
- Domein koppelen zodra je een domeinnaam hebt gekozen.
- Online omgevingsvariabelen invullen.

### 2. Resend

- Resend-account aanmaken.
- Afzenderdomein verifiëren.
- API-sleutel aanmaken.
- `RESEND_API_KEY` en `RESEND_FROM_EMAIL` invullen in Vercel.

### 3. Supabase

- Supabase-project aanmaken.
- Database-tabellen aanmaken voor gebruikers, klanten, facturen, kosten, CRM, sessies en instellingen.
- Storage bucket aanmaken voor bonnetjes.
- De online flow met Supabase testen.
- Back-up- en herstelproces testen, inclusief bonbestanden.

## Belangrijk

Een besloten online test kan eerder, maar voor echte ondernemersgegevens moeten Supabase-opslag, back-ups en e-mail eerst goed werken.
