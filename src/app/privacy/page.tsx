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
    body: "In deze bouwversie zijn gegevens gekoppeld aan het account waarmee je bent ingelogd. De gegevens zijn bedoeld voor de ondernemer zelf en worden niet zichtbaar gemaakt voor andere gebruikers.",
  },
  {
    title: "Delen we gegevens met anderen?",
    body: "In deze lokale versie delen we geen gegevens met externe partijen. Als Helder later online wordt aangeboden, moet per externe dienst duidelijk worden vastgelegd welke gegevens worden verwerkt en waarom.",
  },
  {
    title: "Wat kun je zelf regelen?",
    body: "Je kunt bedrijfsgegevens aanpassen, klanten en kosten beheren, een back-up downloaden, je wachtwoord wijzigen en overal uitloggen. Zo houd je zelf grip op je administratie.",
  },
  {
    title: "Hoe lang bewaren we gegevens?",
    body: "In deze bouwversie blijven gegevens bewaard zolang ze in de lokale administratie staan. Later voegen we duidelijke bewaartermijnen en verwijdermogelijkheden toe voor een live platform.",
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
            Dit is een duidelijke conceptversie voor tijdens de bouw. Voor een live platform
            moet deze tekst nog juridisch worden gecontroleerd en aangevuld.
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
            Laatst bijgewerkt: 25 juni 2026. Deze pagina hoort bij de lokale bouwversie van Helder.
          </p>
        </footer>
      </section>
    </main>
  );
}
