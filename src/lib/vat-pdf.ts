import "server-only";

import { euro } from "./invoice";
import type { getVatExport } from "./vat";
import { createSimplePdf } from "./simple-pdf";

function dateNl(date: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

export function generateVatPdf(exportData: Awaited<ReturnType<typeof getVatExport>>) {
  const sales = exportData.rows.filter((row) => row.type === "Verkoopfactuur");
  const costs = exportData.rows.filter((row) => row.type === "Kosten");
  return createSimplePdf({
    title: `Concept btw-overzicht ${exportData.period.label}`,
    subtitle: "Overzicht van ontvangen en betaalde btw. Controleer dit met je administratie voordat je aangifte doet.",
    footer: "Gemaakt met Helder - concept btw-overzicht",
    sections: [
      {
        title: "Samenvatting",
        facts: [
          ["Ontvangen btw", euro(exportData.summary.receivedVatCents)],
          ["Kosten exclusief btw", euro(exportData.summary.expenseExclTotalCents)],
          ["Betaalde btw", euro(exportData.summary.paidVatCents)],
          [exportData.summary.payableVatCents >= 0 ? "Te betalen" : "Terug te krijgen", euro(Math.abs(exportData.summary.payableVatCents))],
          ["Kosten inclusief btw", euro(exportData.summary.expenseTotalCents)],
          ["Aantal kostenposten", String(exportData.summary.expenseCount)],
        ],
      },
      {
        title: "Verkoopfacturen",
        lines: sales.length ? undefined : ["Geen verkoopfacturen in deze btw-periode."],
        table: {
          headers: ["Datum", "Factuur", "Klant", "Btw", "Excl.", "Btw-bedrag", "Incl."],
          rows: sales.map((row) => [
            dateNl(row.date),
            row.document,
            row.name,
            `${row.vatRate}%`,
            euro(row.amountExclCents),
            euro(row.vatCents),
            euro(row.amountInclCents),
          ]),
        },
      },
      {
        title: "Kosten",
        lines: costs.length ? undefined : ["Geen kostenposten in deze btw-periode."],
        table: {
          headers: ["Datum", "Nummer", "Leverancier", "Btw", "Excl.", "Btw-bedrag", "Incl."],
          rows: costs.map((row) => [
            dateNl(row.date),
            row.document,
            row.name,
            `${row.vatRate}%`,
            euro(row.amountExclCents),
            euro(row.vatCents),
            euro(row.amountInclCents),
          ]),
        },
      },
    ],
  });
}
