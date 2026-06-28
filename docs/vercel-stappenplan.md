# Vercel-stappenplan voor Helder

Dit document is bedoeld als rustige checklist voor het online zetten van Helder via Vercel.

## 1. Account en project

1. Maak een Vercel-account aan.
2. Koppel de Helder-code aan een nieuw Vercel-project.
3. Kies bij framework voor **Next.js** als Vercel dat vraagt.
4. Laat de build command op de standaardinstelling staan, of gebruik:

```bash
pnpm build
```

## 2. Omgevingsvariabelen in Vercel

Vul in Vercel bij **Project Settings → Environment Variables** deze waarden in:

```bash
HELDER_STORAGE=supabase
HELDER_SEED_DEMO=false
HELDER_LOCAL=false
SUPABASE_URL=https://jouw-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=helder
RESEND_API_KEY=...
RESEND_FROM_EMAIL=Helder <noreply@jouwdomein.nl>
```

Niet invullen op Vercel:

```bash
HELDER_DATA_DIR=
HELDER_DATABASE_PATH=
```

Die twee zijn alleen bedoeld voor lokale opslag op een computer. Online gebruiken we Supabase.

## 3. Belangrijke aandachtspunten

- Gebruik bij `SUPABASE_URL` de project-URL zonder `/rest/v1` erachter.
- Gebruik voor `SUPABASE_SERVICE_ROLE_KEY` de geheime server key. Zet deze nooit zichtbaar in de browser of in documentatie.
- Zet `HELDER_SEED_DEMO` online altijd op `false`, zodat er geen voorbeeldadministratie tussen echte gegevens komt.
- Zet `HELDER_LOCAL` online op `false` of laat deze weg, zodat login-cookies extra veilig zijn.
- Vul Resend pas in nadat je afzenderdomein of afzenderadres goed staat.

## 4. Eerste online test

Doe de eerste test zonder echte klantgegevens:

1. Account aanmaken.
2. Inloggen en uitloggen.
3. Klant aanmaken.
4. Factuur maken.
5. Factuur-PDF downloaden.
6. Kostenpost met bon toevoegen.
7. Bon openen.
8. Btw-overzicht bekijken.
9. Back-up downloaden.
10. Back-up terugzetten in een veilige testomgeving.

## 5. PDF-downloads

Helder maakt PDF’s nu via Python en de bibliotheek `reportlab`. Dat werkt lokaal goed. Voor Vercel moet dit apart getest worden.

Als de livegang-check meldt dat de PDF-motor niet beschikbaar is, zijn er twee routes:

1. Python/reportlab geschikt maken voor de hostingomgeving.
2. De PDF-functies ombouwen naar een oplossing die volledig binnen Next.js/Node draait.

Voor echte livegang moet minimaal één factuur-PDF en één rapport-PDF succesvol online zijn getest.
