import { describe, expect, it } from "vitest";
import { calculateInvoice, effectiveInvoiceStatus, parseEuro } from "./invoice";

describe("invoice calculations", () => {
  it("calculates mixed Dutch VAT rates in cents", () => {
    const totals = calculateInvoice([
      { id: "1", description: "Advies", quantity: 2, unitPriceCents: 10000, vatRate: 21 },
      { id: "2", description: "Boek", quantity: 1, unitPriceCents: 2500, vatRate: 9 },
    ]);

    expect(totals.subtotalCents).toBe(22500);
    expect(totals.vatByRate[21]).toBe(4200);
    expect(totals.vatByRate[9]).toBe(225);
    expect(totals.totalCents).toBe(26925);
  });

  it("rounds VAT per invoice line", () => {
    const totals = calculateInvoice([
      { id: "1", description: "Klein bedrag", quantity: 3, unitPriceCents: 33, vatRate: 21 },
    ]);
    expect(totals.vatCents).toBe(21);
  });

  it("parses Dutch currency input", () => {
    expect(parseEuro("1.250,50")).toBe(125050);
    expect(parseEuro("85")).toBe(8500);
  });

  it("marks open invoices as overdue after the due date", () => {
    expect(effectiveInvoiceStatus("Openstaand", "2026-06-25", "2026-06-26")).toBe("Te laat");
    expect(effectiveInvoiceStatus("Openstaand", "2026-06-26", "2026-06-26")).toBe("Openstaand");
    expect(effectiveInvoiceStatus("Betaald", "2026-06-25", "2026-06-26")).toBe("Betaald");
    expect(effectiveInvoiceStatus("Concept", "2026-06-25", "2026-06-26")).toBe("Concept");
  });
});
