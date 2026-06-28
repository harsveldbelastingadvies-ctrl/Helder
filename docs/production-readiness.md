# Productievoorbereiding Helder

Helder werkt nu lokaal goed, maar voor echte ondernemersgegevens zijn nog een paar veiligheidsstappen nodig.

## Korte inschatting

- **Nu:** geschikt om lokaal te testen en te demonstreren.
- **Binnen enkele dagen tot ongeveer 1 week:** mogelijk als besloten online testomgeving, zolang er nog geen echte klantadministraties in staan.
- **Realistisch voor echte ondernemersgegevens:** reken op **ongeveer 2 tot 4 weken**, afhankelijk van hostingkeuze, e-maildienst, back-ups en de privacy/security-check.

De basisfuncties zijn al ver: facturen, kosten, btw, winst- en verliesrekening, CRM, rapporten, privacy-uitleg en back-upmogelijkheden. De gekozen serieuze route is **Vercel + Supabase + Resend**. De resterende voorbereiding gaat vooral over betrouwbaarheid en veiligheid buiten de lokale computer.

## Wat nu is voorbereid

- De database-opslag is configureerbaar met `HELDER_DATA_DIR` of `HELDER_DATABASE_PATH`.
- Bonnetjes worden opgeslagen onder dezelfde configureerbare datamap.
- Demo-data kan worden uitgezet met `HELDER_SEED_DEMO=false`.
- De lokale demo blijft gewoon werken zonder extra instellingen.
- Er is een gezondheidscheck beschikbaar op `/api/health` en zichtbaar in **Instellingen** als opslagstatus.
- Er is een livegang-check beschikbaar op `/api/readiness` en zichtbaar in **Instellingen**.
- Back-ups kunnen inclusief bonbestanden worden gedownload, gecontroleerd en teruggezet via de instellingen.
- Factuurinstellingen zoals betaaltermijn, standaard btw-tarief en voettekst zijn configureerbaar.
- Wachtwoordherstel en e-mailbevestiging zijn voorbereid met lokale testcodes én een Resend-koppeling voor online gebruik.
- Er is een ondernemersrapport-PDF beschikbaar met omzet, kosten, resultaat, open facturen en btw.
- Supabase Storage is voorbereid voor bonnetjes/bestanden.
- Login, registratie, sessies, wachtwoordherstel en e-mailbevestiging zijn voorbereid voor Supabase-modus.
- Klanten, CRM-notities en opvolgacties zijn voorbereid voor Supabase-modus.
- Facturen en factuurregels zijn voorbereid voor Supabase-modus, inclusief factuurdetails, PDF-download, e-mailbestand en betalingsherinnering.
- Kosten en bonnetjes zijn voorbereid voor Supabase-modus, inclusief Supabase Storage voor bonbestanden.
- Btw-overzicht, winst- en verliesrekening, jaarcheck-PDF en ondernemersrapport-PDF zijn voorbereid voor Supabase-modus.
- Bedrijfsinstellingen zijn voorbereid voor Supabase-modus.
- Back-up export/import inclusief bonbestanden en een back-upcontrole zijn voorbereid voor Supabase-modus.
- Het Supabase database-schema staat klaar in `supabase/schema.sql`.

## Gekozen productie-opzet

- **Vercel:** draait de Next.js-app, regelt domein, HTTPS en deployments.
- **Supabase:** wordt de plek voor de online database en opslag van bestanden/bonnetjes.
- **Resend:** verstuurt e-mails voor e-mailbevestiging en wachtwoordherstel.

## Route naar live

### Stap 1: besloten testomgeving

Doel: Helder online kunnen openen zonder echte klantgegevens.

- Kies hosting.
- Zet de app online achter HTTPS.
- Zet demo-data uit in de online omgeving.
- Vul de Resend-instellingen in, zodat codes per e-mail worden verstuurd.
- Controleer login, facturen, kosten, btw, rapporten en back-up export.

### Stap 2: veilige pilot

Doel: met heel beperkt gebruik testen of alles in de praktijk klopt.

- Kies een beheerde database of veilige opslaglocatie.
- Maak de Supabase-tabellen aan met `supabase/schema.sql`.
- Sluit de routes aan op Supabase-tabellen in plaats van lokale SQLite.
- Gebruik Supabase Storage voor bonnetjes/opslag.
- Voeg automatische back-ups toe voor database en Supabase Storage.
- Zet monitoring/logging aan voor fouten, zonder gevoelige gegevens te loggen.
- Test herstel: kan een back-up echt worden teruggezet?

### Stap 3: echte livegang

Doel: verantwoord ondernemersgegevens verwerken.

- Rond domein, HTTPS, hostingvariabelen en toegangsbeheer af.
- Laat beveiliging en privacy controleren voordat echte klantgegevens worden opgeslagen.
- Leg vast wie toegang heeft tot gegevens en hoe lang gegevens worden bewaard.
- Test het hele proces met 1 tot 3 ondernemers voordat breder wordt gelanceerd.

## Nog niet vergeten

- Online hoort `HELDER_SEED_DEMO=false` te zijn, zodat er geen voorbeeldgegevens tussen echte gegevens komen.
- Online hoort `HELDER_LOCAL=false` of leeg te zijn, zodat cookies extra veilig worden ingesteld.
- Lokale testcodes voor e-mailbevestiging en wachtwoordherstel mogen online niet zichtbaar zijn.
- Back-ups zijn pas echt nuttig als ook is getest dat terugzetten werkt.
- De handmatige Helder-back-up neemt bonbestanden mee. Voor livegang blijft daarnaast een automatische Supabase Storage back-up verstandig.
- Logbestanden mogen helpen bij fouten zoeken, maar mogen geen gevoelige administratiegegevens bevatten.

## Gezondheidscheck

Als Helder later online draait, kan een hostingplatform of monitor `/api/health` openen. De route geeft alleen terug of de app draait, of de database bereikbaar is en of de bestandsopslag voor bonnetjes bereikbaar is. Er worden geen klantgegevens getoond.

## Livegang-check

In **Instellingen** staat een livegang-check. Die controleert in gewone taal of de belangrijkste technische voorwaarden voor een besloten online pilot goed staan:

- online opslag via Supabase;
- Supabase-instellingen aanwezig;
- e-mail via Resend ingesteld;
- demo-data uit;
- lokale modus uit, zodat cookies online extra veilig zijn;
- back-up en herstel beschikbaar.
- PDF-downloads beschikbaar.

Als een punt nog niet klaar is, toont Helder ook de eerstvolgende actie. Bijvoorbeeld:

- zet in Vercel `HELDER_STORAGE` op `supabase`;
- vul in Vercel `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` en `SUPABASE_STORAGE_BUCKET` in;
- vul in Vercel `RESEND_API_KEY` en `RESEND_FROM_EMAIL` in;
- zet in Vercel `HELDER_SEED_DEMO` op `false`;
- zet in Vercel `HELDER_LOCAL` op `false` of verwijder die variabele;
- test vóór livegang één keer back-up downloaden en terugzetten in een veilige testomgeving.
- test online één factuur-PDF en één rapport-PDF.

De livegang-check is geen vervanging voor een privacy/security-review, maar helpt wel voorkomen dat een belangrijke instelling per ongeluk vergeten wordt.

Het praktische Vercel-stappenplan staat in `docs/vercel-stappenplan.md`.

## Back-upcontrole

In **Instellingen** staat bij Back-up een controleknop. Die maakt geen wijzigingen in de administratie, maar controleert of een exportbestand logisch compleet is:

- bedrijfsgegevens aanwezig;
- klanten, facturen, factuurregels, kosten, CRM-notities en acties telbaar;
- facturen gekoppeld aan bestaande klanten;
- factuurregels gekoppeld aan bestaande facturen;
- genoemde bonbestanden daadwerkelijk aanwezig in de back-up;
- geen wachtwoord-, sessie- of tokenvelden in het exportbestand.

Belangrijk: bonbestanden zitten nu in de handmatige Helder-back-up. Omdat bonnen groot kunnen zijn, kan het back-upbestand ook groter worden. Voor livegang moet Supabase Storage daarnaast automatisch worden geback-upt, zodat herstel niet afhankelijk is van handmatig downloaden.

## Voorbeeldinstellingen voor later

```bash
HELDER_DATA_DIR=/secure/path/helder-data
HELDER_SEED_DEMO=false
HELDER_LOCAL=false
RESEND_API_KEY=...
RESEND_FROM_EMAIL=Helder <noreply@jouwdomein.nl>
SUPABASE_URL=https://jouw-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=helder
```

Let op: gebruik bij `SUPABASE_URL` de project-URL zonder `/rest/v1` erachter. De geheime sleutel hoort alleen in de serveromgeving te staan, dus niet zichtbaar in de browser.
