import "server-only";

import type { EntrepreneurReport } from "./entrepreneur-report";
import { euro } from "./invoice";
import { createSimplePdf } from "./simple-pdf";

function dateNl(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(value));
}

export function generateEntrepreneurReportPdf(report: EntrepreneurReport) {
  return createSimplePdf({
    title: `Ondernemersrapport ${report.year}`,
    subtitle: `${report.companyName} · gemaakt op ${dateNl(report.createdAt)}`,
    footer: "Gemaakt met Rekenrust - concept ondernemersrapport",
    sections: [
      {
        title: "Belangrijkste cijfers",
        facts: [
          ["Omzet zonder btw", euro(report.revenueCents)],
          ["Gewone kosten", euro(report.regularExpensesCents)],
          ["Afschrijvingen", euro(report.depreciationCents)],
          [report.profitCents >= 0 ? "Concept winst" : "Concept verlies", euro(Math.abs(report.profitCents))],
          ["Openstaande facturen", `${euro(report.openInvoicesCents)} (${report.openInvoicesCount})`],
          ["Te late facturen", String(report.overdueInvoicesCount)],
          [`Btw ${report.vatPeriod}`, report.vatPayableCents >= 0 ? `${euro(report.vatPayableCents)} te betalen` : `${euro(Math.abs(report.vatPayableCents))} terug te krijgen`],
        ],
      },
      {
        title: "Administratie",
        facts: [
          ["Ondernemer", report.owner],
          ["Klanten", String(report.customerCount)],
          ["Kostenposten", String(report.expenseCount)],
        ],
        lines: [
          "Controleer openstaande facturen, ontbrekende bonnetjes en de btw-opgaaf voordat je dit rapport gebruikt voor aangifte of overleg met je adviseur.",
        ],
      },
      {
        title: "Praktische vervolgstappen",
        lines: [
          "1. Bekijk openstaande facturen en stuur zo nodig een herinnering.",
          "2. Controleer of alle zakelijke kosten en bonnetjes zijn ingevoerd.",
          "3. Zet geld apart voor btw en eventuele inkomstenbelasting.",
          "4. Deel dit concept met je boekhouder of adviseur voor controle.",
        ],
      },
    ],
  });
}
