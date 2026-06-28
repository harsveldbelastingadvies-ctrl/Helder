import { effectiveInvoiceStatus, type InvoiceStatus } from "./invoice";

export type AgingInvoice = {
  dueDate: string;
  status: InvoiceStatus;
  totalCents: number;
};

export type InvoiceAgingSummary = {
  overdueCents: number;
  overdueCount: number;
  dueSoonCents: number;
  dueSoonCount: number;
  laterCents: number;
  laterCount: number;
  openCents: number;
  openCount: number;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function summarizeInvoiceAging(invoices: AgingInvoice[], today = new Date().toISOString().slice(0, 10)): InvoiceAgingSummary {
  const dueSoonEnd = addDays(today, 7);
  return invoices.reduce<InvoiceAgingSummary>((summary, invoice) => {
    const status = effectiveInvoiceStatus(invoice.status, invoice.dueDate, today);
    if (status !== "Openstaand" && status !== "Te laat") return summary;

    summary.openCents += invoice.totalCents;
    summary.openCount += 1;

    if (status === "Te laat") {
      summary.overdueCents += invoice.totalCents;
      summary.overdueCount += 1;
    } else if (invoice.dueDate <= dueSoonEnd) {
      summary.dueSoonCents += invoice.totalCents;
      summary.dueSoonCount += 1;
    } else {
      summary.laterCents += invoice.totalCents;
      summary.laterCount += 1;
    }

    return summary;
  }, {
    overdueCents: 0,
    overdueCount: 0,
    dueSoonCents: 0,
    dueSoonCount: 0,
    laterCents: 0,
    laterCount: 0,
    openCents: 0,
    openCount: 0,
  });
}
