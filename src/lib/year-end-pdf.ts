import "server-only";

import { euro } from "./invoice";
import type { YearEndSummary } from "./year-end";
import { createSimplePdf } from "./simple-pdf";

export function generateYearEndPdf(summary: YearEndSummary) {
  const done = summary.checklist.filter((item) => item.done).length;
  return createSimplePdf({
    title: `Concept jaarcheck ${summary.year}`,
    subtitle: "Praktische controlelijst voor het einde van het jaar. Dit is geen definitieve belastingaangifte.",
    footer: "Gemaakt met Rekenrust - concept jaarcheck",
    sections: [
      {
        title: "Voortgang",
        facts: [
          ["Checklist klaar", `${done} van ${summary.checklist.length}`],
          ["Definitieve facturen", String(summary.finalInvoiceCount)],
          ["Conceptfacturen", String(summary.conceptInvoiceCount)],
          ["Kostenposten", String(summary.expenseCount)],
          ["Kosten zonder bon", String(summary.missingReceiptCount)],
          ["Apart te houden", euro(summary.reserveCents)],
        ],
      },
      {
        title: "Btw en resultaat",
        facts: [
          [`Btw ${summary.vat.period}`, summary.vat.payableVatCents >= 0 ? `${euro(summary.vat.payableVatCents)} te betalen` : `${euro(Math.abs(summary.vat.payableVatCents))} terug te krijgen`],
          ["Omzet", euro(summary.profitLoss.revenueCents)],
          ["Kosten", euro(summary.profitLoss.regularExpensesCents + summary.profitLoss.depreciationCents)],
          [summary.profitLoss.profitCents >= 0 ? "Concept winst" : "Concept verlies", euro(Math.abs(summary.profitLoss.profitCents))],
        ],
      },
      {
        title: "Controlepunten",
        table: {
          headers: ["Status", "Punt", "Uitleg"],
          rows: summary.checklist.map((item) => [
            item.done ? "Klaar" : "Nog doen",
            item.title,
            item.description,
          ]),
        },
      },
    ],
  });
}
