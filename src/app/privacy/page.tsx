import Link from "next/link";

const privacySections = [
  {
    title: "Welke gegevens bewaren we?",
    body: "Helder bewaart gegevens die nodig zijn om de administratie te gebruiken: accountgegevens, bedrijfsgegevens, klanten, facturen, kosten, bonnetjes, CRM-notities en opvolgacties.",
  },
  {
    title: "Waar gebruiken we die gegevens voor?",
    body: "We gebruiken deze gegevens om facturen te maken, kosten vast te leggen, btw-overzichten te berekenen, winst en verlies inzichtelijk te maken en klantopvolging overzichtelijk te houden.",
  },
  {
    title: "Wie kan erbij?",
    body: "Gegevens zijn gekoppeld aan het account waarmee je bent ingelogd. De administratie is bedoeld voor de ondernemer zelf en wordt niet zichtbaar gemaakt voor andere gebruikers.",
  },
  {
    title: "Welke diensten helpen Helder draaien?",
    body: "Voor online gebruik kan Helder diensten gebruiken zoals Vercel voor hosting, Supabase voor database en bonnenopslag, Resend voor e-mail en Mollie voor betalingen. Deze diensten verwerken alleen gegevens voor het doel waarvoor ze nodig zijn.",
  },
  {
    title: "Wat kun je zelf regelen?",
    body: "Je kunt bedrijfsgegevens aanpassen, klanten en kosten beheren, een back-up downloaden, je wachtwoord wijzigen en overal uitloggen. Zo houd je zelf grip op je administratie.",
  },
  {
    title: "Hoe lang bewaren we gegevens?",
    body: "Administratiegegevens worden bewaard zolang het account en de administratie worden gebruikt, tenzij er een wettelijke bewaarplicht of een duidelijke verwijderafspraak geldt.",
  },
  {
    title: "Betalingen en abonnementen",
    body: "Betalingen lopen via Mollie. Helder bewaart geen volledige betaalgegevens zoals bankinloggegevens. Wel bewaren we noodzakelijke betalingskenmerken, zodat het abonnement kan worden geactiveerd en gecontroleerd.",
  },
  {
    title: "Vragen of correcties",
    body: "Zie je gegevens die niet kloppen of wil je iets laten aanpassen? Neem dan contact op. We kijken dan samen welke gegevens aangepast, geëxporteerd of verwijderd kunnen worden.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <section className="privacy-document">
        <Link className="privacy-back" href="/">← Terug naar Helder</Link>
        <p className="eyebrow">PRIVACYVERKLARING</p>
        <h1>Zo gaat Helder om met privacy en gegevensbeheer</h1>
        <p className="privacy-lead">
          We willen dat ondernemers snappen welke gegevens worden bewaard en waarom.
          Daarom leggen we het hieronder uit in gewone taal.
        </p>

        <div className="privacy-notice">
          <strong>Belangrijk om te weten</strong>
          <span>
            Dit is een duidelijke werkversie in gewone taal. Laat de definitieve juridische
            privacyverklaring controleren voordat Helder breed aan ondernemers wordt aangeboden.
          </span>
        </div>

        <div className="privacy-document-list">
          {privacySections.map((section) => (
            <article key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>

        <footer className="privacy-footer">
          <p>
            Laatst bijgewerkt: 29 juni 2026. Deze pagina hoort bij Helder van R. Harsveld Belastingadvies.
          </p>
        </footer>
      </section>
    </main>
  );
}
