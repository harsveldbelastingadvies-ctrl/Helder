# Helder administratie

Helder is een eerste werkende versie van een eenvoudige administratie-app voor kleine ondernemers.

## Snel openen

De makkelijkste manier:

1. Open Finder.
2. Ga naar deze map: `/Users/ralf/Documents/Codex/2026-06-21/maa`
3. Klik met de rechtermuisknop op `Open Helder.command`.
4. Kies **Open**.
5. Laat het Terminal-venster openstaan zolang je Helder gebruikt.

Daarna opent Helder op [http://127.0.0.1:3000](http://127.0.0.1:3000).

Stoppen kan met `Control + C` in het Terminal-venster.

## Wat werkt al?

- Veilig inloggen
- Lokaal een eigen testaccount aanmaken
- Wachtwoordherstel met lokale testcode
- E-mailadres bevestigen met lokale testcode
- Klanten bekijken, toevoegen en aanpassen
- Per klant CRM-notities en opvolgacties met deadlines bijhouden
- Opvolgacties als afgerond markeren
- Openstaande klantacties direct op het beginscherm bekijken en afronden
- Facturen, klanten en kosten snel terugvinden met zoeken en filters
- Standaard factuurinstellingen beheren, zoals betaaltermijn, btw-tarief en factuurtekst
- Facturen maken met 0%, 9% of 21% btw
- Facturen blijvend opslaan als concept
- Conceptfacturen later aanpassen voordat je ze als verstuurd markeert
- Conceptfacturen veilig verwijderen zolang ze nog niet zijn verstuurd
- Facturen openen, als pdf downloaden en als verstuurd of betaald markeren
- Een complete factuur-e-mail met pdf-bijlage klaarzetten in het e-mailprogramma
- Voor te late facturen een vriendelijke betalingsherinnering met pdf klaarzetten
- Bedrijfsadres, KvK-nummer, btw-id en IBAN beheren
- Bedrijfsgegevens automatisch op iedere factuur plaatsen
- Zakelijke kosten inclusief btw invoeren en bewaren
- Kostenposten later bewerken of verwijderen
- Foto's en pdf's van bonnetjes bij kosten bewaren en terugkijken
- Btw automatisch laten doorrekenen in dashboard en btw-overzicht
- Het btw-overzicht downloaden als nette PDF voor je administratie of boekhouder
- Winst- en verliesrekening bekijken en downloaden als PDF
- Jaarcheck downloaden als PDF
- Ondernemersrapport downloaden als PDF
- Privacyuitleg en privacyverklaring
- Back-up downloaden, controleren en terugzetten

## De demoversie openen

De app draait lokaal op [http://127.0.0.1:3000](http://127.0.0.1:3000).

Gebruik voor de demoversie:

- E-mailadres: `demo@helder.nl`
- Wachtwoord: `Welkom123!`

Deze gegevens worden bewust niet automatisch ingevuld, zodat je minder snel per ongeluk in het demo-account werkt.

Je kunt ook lokaal een eigen testaccount aanmaken via **Account aanmaken**. Dat account wordt alleen op deze computer opgeslagen.

## Goed om te weten

De app kan lokaal draaien of met Supabase als online opslag worden gebruikt. Voordat de app echt live gaat met ondernemersgegevens, moeten hosting, e-mail, back-ups en privacy/security nog rustig worden gecontroleerd.

Voor die volgende fase is alvast een eerste voorbereiding gemaakt. Zie [docs/production-readiness.md](/Users/ralf/Documents/Codex/2026-06-21/maa/docs/production-readiness.md) voor de productie-checklist en [docs/vercel-stappenplan.md](/Users/ralf/Documents/Codex/2026-06-21/maa/docs/vercel-stappenplan.md) voor het online zetten via Vercel.
