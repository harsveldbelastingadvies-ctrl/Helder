export type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: 0 | 9 | 21;
};

export type InvoiceStatus = "Betaald" | "Openstaand" | "Concept" | "Te laat";

export type InvoiceTotals = {
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  vatByRate: Record<number, number>;
};

export function calculateInvoice(lines: InvoiceLine[]): InvoiceTotals {
  const vatByRate: Record<number, number> = { 0: 0, 9: 0, 21: 0 };
  let subtotalCents = 0;

  for (const line of lines) {
    const lineSubtotal = Math.round(line.quantity * line.unitPriceCents);
    subtotalCents += lineSubtotal;
    vatByRate[line.vatRate] += Math.round(lineSubtotal * (line.vatRate / 100));
  }

  const vatCents = Object.values(vatByRate).reduce((sum, value) => sum + value, 0);
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents, vatByRate };
}

export function effectiveInvoiceStatus(status: InvoiceStatus, dueDate: string, today = new Date().toISOString().slice(0, 10)): InvoiceStatus {
  if (status === "Openstaand" && dueDate < today) return "Te laat";
  return status;
}

export function euro(cents: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function parseEuro(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}
