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
  const salesTotals = totalsFor(sales);
  const costTotals = totalsFor(costs);
  const resultLabel = exportData.summary.payableVatCents >= 0 ? "Af te dragen btw" : "Terug te vragen btw";
  const resultAmount = euro(Math.abs(exportData.summary.payableVatCents));

  return createSimplePdf({
    title: `Btw-overzicht ${exportData.period.label}`,
    subtitle: "Conceptoverzicht voor je btw-aangifte. Controleer de bedragen altijd nog met je administratie voordat je indient.",
    footer: "Gemaakt met Helder - concept btw-overzicht",
    sections: [
      {
        title: `${resultLabel}: ${resultAmount}`,
        lines: [
          exportData.summary.payableVatCents >= 0
            ? "Dit is het bedrag dat je volgens Helder moet afdragen: btw op verkoopfacturen min btw op kosten."
            : "Je hebt volgens Helder meer btw betaald op kosten dan ontvangen op verkoopfacturen.",
        ],
        facts: [
          ["Btw op verkoopfacturen", euro(exportData.summary.receivedVatCents)],
          ["Kosten exclusief btw", euro(exportData.summary.expenseExclTotalCents)],
          ["Btw op kosten", euro(exportData.summary.paidVatCents)],
          [resultLabel, resultAmount],
          ["Kosten inclusief btw", euro(exportData.summary.expenseTotalCents)],
          ["Aantal kostenposten", String(exportData.summary.expenseCount)],
        ],
      },
      {
        title: "Verkoopfacturen",
        lines: sales.length ? ["Btw die je bij klanten in rekening hebt gebracht. Conceptfacturen tellen niet mee."] : ["Geen verkoopfacturen in deze btw-periode."],
        facts: sales.length
          ? [
            ["Verkoop exclusief btw", euro(salesTotals.excl)],
            ["Btw op verkoop", euro(salesTotals.vat)],
            ["Verkoop inclusief btw", euro(salesTotals.incl)],
          ]
          : undefined,
        table: sales.length ? {
          headers: ["Datum en factuur", "Klant en omschrijving", "Bedragen"],
          rows: sales.map((row) => compactRow(row)),
        } : undefined,
      },
      {
        title: "Kosten",
        lines: costs.length ? ["Btw die je hebt betaald op zakelijke kosten. Dit heet voorbelasting."] : ["Geen kostenposten in deze btw-periode."],
        facts: costs.length
          ? [
            ["Kosten exclusief btw", euro(costTotals.excl)],
            ["Btw op kosten", euro(costTotals.vat)],
            ["Kosten inclusief btw", euro(costTotals.incl)],
          ]
          : undefined,
        table: costs.length ? {
          headers: ["Datum en nummer", "Leverancier en omschrijving", "Bedragen"],
          rows: costs.map((row) => compactRow(row)),
        } : undefined,
      },
    ],
  });
}

type VatPdfRow = Awaited<ReturnType<typeof getVatExport>>["rows"][number];

function totalsFor(rows: VatPdfRow[]) {
  return rows.reduce((totals, row) => ({
    excl: totals.excl + row.amountExclCents,
    vat: totals.vat + row.vatCents,
    incl: totals.incl + row.amountInclCents,
  }), { excl: 0, vat: 0, incl: 0 });
}

function compactRow(row: VatPdfRow) {
  return [
    `${dateNl(row.date)} - ${row.document}`,
    `${row.name} - ${row.description}`,
    `Excl. ${euro(row.amountExclCents)} / Btw ${row.vatRate}%: ${euro(row.vatCents)} / Incl. ${euro(row.amountInclCents)}`,
  ];
}
