# Supabase-migratie Helder

Doel: Helder verplaatsen van lokale opslag naar Supabase, zodat de app geschikt wordt voor echte online hosting.

## Stand van zaken

Al voorbereid:

- Supabase serverkoppeling in `src/lib/supabase.ts`.
- Supabase Storage-laag voor bonnetjes in `src/lib/receipt-storage.ts`.
- Bonnetjesroutes gebruiken nu de opslaglaag, zodat bestanden lokaal of in Supabase Storage kunnen staan.
- Gezondheidscheck kan Supabase controleren.
- Login, registratie en sessies kunnen in Supabase-modus via Supabase-tabellen werken.
- Wachtwoord wijzigen, wachtwoordherstel en e-mailbevestiging kunnen in Supabase-modus via Supabase-tabellen werken.
- Klanten, CRM-notities en opvolgacties kunnen in Supabase-modus via Supabase-tabellen werken.
- Facturen en factuurregels kunnen in Supabase-modus via Supabase-tabellen werken.
- Factuurdetails, PDF-download, e-mailbestand en betalingsherinnering lezen nu via dezelfde Supabase-bewuste factuurdetail-laag.
- Kosten kunnen in Supabase-modus via Supabase-tabellen werken.
- Bonnetjes kunnen in Supabase-modus via Supabase Storage worden opgeslagen, vervangen, verwijderd en geopend.
- Btw-overzicht en btw-PDF kunnen in Supabase-modus uit Supabase-tabellen lezen.
- Winst- en verliesrekening en winst-PDF kunnen in Supabase-modus uit Supabase-tabellen lezen.
- Jaarcheck-PDF en ondernemersrapport-PDF kunnen in Supabase-modus uit Supabase-tabellen lezen.
- Bedrijfsinstellingen kunnen in Supabase-modus worden gelezen en opgeslagen.
- Back-up export/import kan in Supabase-modus lezen uit en terugzetten naar Supabase-tabellen.
- Database-schema staat in `supabase/schema.sql`.
- Omgevingsvariabelen staan in `.env.example`.

Nog om te bouwen:

- Een echte Supabase-testomgeving aanmaken en de complete flow met `HELDER_STORAGE=supabase` controleren.

## Veilige volgorde

1. Supabase-project aanmaken.
2. `supabase/schema.sql` uitvoeren in de Supabase SQL Editor.
3. Storage bucket `helder` controleren.
4. Vercel-variabelen invullen:
   - `HELDER_STORAGE=supabase`
   - `HELDER_SEED_DEMO=false`
   - `HELDER_LOCAL=false`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET=helder`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
5. Eerst een besloten test draaien zonder echte klantgegevens.
6. Daarna pas echte ondernemersgegevens toestaan.

## Belangrijk

Zet `HELDER_STORAGE=supabase` pas online aan nadat alle database-routes zijn aangesloten op Supabase. Tot die tijd blijft de lokale versie bedoeld voor bouwen en testen.
