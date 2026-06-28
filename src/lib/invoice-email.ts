import "server-only";

import type { InvoiceDetail } from "./invoice-data";
import { generateInvoicePdf } from "./invoice-pdf";

type EmailKind = "invoice" | "reminder";

function base64Lines(value: Buffer | string) {
  const encoded = Buffer.isBuffer(value) ? value.toString("base64") : Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function encodedHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function createInvoiceEmail(invoice: InvoiceDetail, kind: EmailKind) {
  const pdf = generateInvoicePdf(invoice);
  const amount = `€ ${(invoice.totalCents / 100).toFixed(2).replace(".", ",")}`;
  const dueDate = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${invoice.dueDate}T12:00:00`));
  const subject = kind === "reminder"
    ? `Betalingsherinnering factuur ${invoice.id}`
    : `Factuur ${invoice.id} van ${invoice.company.name}`;
  const body = kind === "reminder"
    ? `Beste ${invoice.customer.contact || invoice.customer.name},\n\nVolgens onze administratie staat factuur ${invoice.id} van ${amount} nog open. De oorspronkelijke betaaldatum was ${dueDate}. Mogelijk heeft de betaling en dit bericht elkaar gekruist.\n\nWil je controleren of de factuur al is betaald? Zo niet, dan ontvangen we het bedrag graag op ${invoice.company.iban}, onder vermelding van ${invoice.id}. De factuur vind je voor de volledigheid in de bijlage.\n\nMet vriendelijke groet,\n${invoice.company.owner}\n${invoice.company.name}`
    : `Beste ${invoice.customer.contact || invoice.customer.name},\n\nIn de bijlage vind je factuur ${invoice.id} ter hoogte van ${amount}.\n\nWil je het bedrag vóór ${dueDate} overmaken naar ${invoice.company.iban}, onder vermelding van ${invoice.id}?\n\nMet vriendelijke groet,\n${invoice.company.owner}\n${invoice.company.name}`;
  const boundary = `helder-${crypto.randomUUID()}`;
  const message = [
    `From: ${encodedHeader(invoice.company.name)} <${invoice.company.email}>`,
    `To: ${encodedHeader(invoice.customer.name)} <${invoice.customer.email}>`,
    `Subject: ${encodedHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "", `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "", base64Lines(body),
    `--${boundary}`,
    `Content-Type: application/pdf; name="factuur-${invoice.id}.pdf"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="factuur-${invoice.id}.pdf"`,
    "", base64Lines(pdf),
    `--${boundary}--`, "",
  ].join("\r\n");
  return { message, filename: kind === "reminder" ? `betalingsherinnering-${invoice.id}.eml` : `e-mail-factuur-${invoice.id}.eml` };
}
