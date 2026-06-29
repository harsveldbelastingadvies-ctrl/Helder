import "server-only";

import { euro } from "./invoice";
import type { ProfitLossSummary } from "./profit-loss";
import { createSimplePdf } from "./simple-pdf";

export function generateProfitLossPdf(summary: ProfitLossSummary) {
  return createSimplePdf({
    title: `Concept winst en verlies ${summary.year}`,
    subtitle: "Conceptoverzicht voor je administratie. Controleer dit met je boekhouder of adviseur.",
    footer: "Gemaakt met Rekenrust - concept winst en verlies",
    sections: [
      {
        title: "Samenvatting",
        facts: [
          ["Omzet zonder btw", euro(summary.revenueCents)],
          ["Gewone kosten zonder btw", euro(summary.regularExpensesCents)],
          ["Afschrijvingen", euro(summary.depreciationCents)],
          [summary.profitCents >= 0 ? "Concept winst" : "Concept verlies", euro(Math.abs(summary.profitCents))],
          ["Nieuwe investeringen", euro(summary.investmentPurchasesCents)],
        ],
      },
      {
        title: "Afschrijvingen",
        lines: summary.depreciationRows.length ? [] : ["Er zijn nog geen investeringen met afschrijving ingevoerd."],
        table: summary.depreciationRows.length ? {
          headers: ["Investering", "Jaar", "Aanschaf", "Looptijd", "Dit jaar", "Resterend"],
          rows: summary.depreciationRows.map((row) => [
            `${row.supplier} - ${row.description}`,
            String(row.purchaseYear),
            euro(row.purchaseAmountExclCents),
            `${row.depreciationYears} jaar`,
            euro(row.currentYearDepreciationCents),
            `${row.remainingYears} jaar`,
          ]),
        } : undefined,
      },
    ],
  });
}
