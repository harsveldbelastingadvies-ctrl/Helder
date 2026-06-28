import "server-only";

import { calculateInvoice, euro } from "./invoice";
import type { InvoiceDetail } from "./invoice-data";
import { createSimplePdf } from "./simple-pdf";

function longDate(date: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

export function generateInvoicePdf(invoice: InvoiceDetail) {
  const totals = calculateInvoice(invoice.lines);
  return createSimplePdf({
    title: `Factuur ${invoice.id}`,
    subtitle: `${invoice.company.name} · ${invoice.status}${invoice.status === "Concept" ? " · conceptfactuur" : ""}`,
    footer: "Gemaakt met Helder - factuur",
    sections: [
      {
        title: "Factuurgegevens",
        facts: [
          ["Factuurnummer", invoice.id],
          ["Factuurdatum", longDate(invoice.issueDate)],
          ["Vervaldatum", longDate(invoice.dueDate)],
          ["Status", invoice.status],
        ],
      },
      {
        title: "Van",
        lines: [
          `${invoice.company.name} · ${invoice.company.owner}`,
          `${invoice.company.street}, ${invoice.company.postalCode} ${invoice.company.city}`,
          `${invoice.company.email} · KvK ${invoice.company.kvkNumber} · btw-id ${invoice.company.vatNumber}`,
          `IBAN: ${invoice.company.iban}`,
        ],
      },
      {
        title: "Factuur aan",
        lines: [
          invoice.customer.name,
          invoice.customer.contact,
          `${invoice.customer.street}, ${invoice.customer.postalCode} ${invoice.customer.city}`,
          invoice.customer.email,
        ].filter(Boolean),
      },
      {
        title: "Factuurregels",
        table: {
          headers: ["Omschrijving", "Aantal", "Prijs", "Btw", "Bedrag"],
          rows: invoice.lines.map((line) => [
            line.description,
            String(line.quantity),
            euro(line.unitPriceCents),
            `${line.vatRate}%`,
            euro(Math.round(line.quantity * line.unitPriceCents)),
          ]),
        },
      },
      {
        title: "Totaal",
        facts: [
          ["Subtotaal", euro(totals.subtotalCents)],
          ...Object.entries(totals.vatByRate).filter(([, amount]) => amount > 0).map(([rate, amount]): [string, string] => [`Btw ${rate}%`, euro(amount)]),
          ["Totaal inclusief btw", euro(totals.totalCents)],
        ],
        lines: [
          `Maak ${euro(totals.totalCents)} over naar ${invoice.company.iban} voor ${longDate(invoice.dueDate)}, onder vermelding van ${invoice.id}.`,
          invoice.company.invoiceFooter,
        ].filter(Boolean),
      },
    ],
  });
}
