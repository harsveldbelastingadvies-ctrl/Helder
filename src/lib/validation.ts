import type { InvoiceLine } from "./invoice";

export function isValidEmail(value: string | undefined) {
  return Boolean(value?.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value!.trim());
}

export function isValidIsoDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateInvoiceLines(lines: InvoiceLine[] | undefined) {
  if (!lines?.length) return "Voeg minimaal één factuurregel toe.";
  const invalid = lines.some((line) => (
    !line.description?.trim()
    || !Number.isFinite(line.quantity)
    || line.quantity <= 0
    || !Number.isFinite(line.unitPriceCents)
    || line.unitPriceCents <= 0
    || ![0, 9, 21].includes(line.vatRate)
  ));
  return invalid ? "Vul bij elke factuurregel omschrijving, aantal, prijs en btw goed in." : null;
}
