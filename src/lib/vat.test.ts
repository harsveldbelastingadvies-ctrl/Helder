import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { currentQuarter, summarizeVatPeriod } from "./vat";
import { generateVatPdf } from "./vat-pdf";

describe("btw-overzicht", () => {
  it("neemt ingevoerde kosten mee als kosten exclusief btw en betaalde btw", () => {
    const period = { quarter: 2, year: 2026, start: "2026-04-01", end: "2026-06-30", label: "Q2 2026" };
    const summary = summarizeVatPeriod(period, [], [
      {
        id: "expense-1",
        expenseDate: "2026-06-29",
        supplier: "Adobe",
        description: "Softwareabonnement",
        category: "Software",
        amountInclCents: 12100,
        vatRate: 21,
      },
    ]);

    expect(summary.expenseCount).toBe(1);
    expect(summary.expenseTotalCents).toBe(12100);
    expect(summary.expenseExclTotalCents).toBe(10000);
    expect(summary.paidVatCents).toBe(2100);
    expect(summary.payableVatCents).toBe(-2100);
  });

  it("maakt een bruikbare btw-pdf met kostenregels", () => {
    const period = currentQuarter(new Date("2026-06-29T12:00:00"));
    const pdf = generateVatPdf({
      period,
      summary: {
        period: period.label,
        receivedVatCents: 4200,
        paidVatCents: 2100,
        payableVatCents: 2100,
        expenseTotalCents: 12100,
        expenseExclTotalCents: 10000,
        expenseCount: 1,
      },
      rows: [
        {
          type: "Kosten",
          date: "2026-06-29",
          document: "expense-1",
          name: "Adobe",
          description: "Softwareabonnement (Software)",
          vatRate: 21,
          amountExclCents: 10000,
          vatCents: 2100,
          amountInclCents: 12100,
        },
      ],
    });

    const text = pdf.toString("binary");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.endsWith("%%EOF")).toBe(true);
    expect(text).toContain("KOSTEN EXCLUSIEF BTW");
    expect(text).toContain("Adobe");
  });
});
