import { describe, expect, it } from "vitest";
import { calculateExpense } from "./expense";
import { calculateInvoice } from "./invoice";

describe("first entrepreneur workflow", () => {
  it("keeps invoice, expense, VAT and profit/loss numbers aligned", () => {
    const salesInvoice = calculateInvoice([
      { id: "line-advies", description: "Adviesgesprek", quantity: 2, unitPriceCents: 7500, vatRate: 21 },
      { id: "line-training", description: "Training", quantity: 1, unitPriceCents: 5000, vatRate: 9 },
    ]);
    const softwareExpense = calculateExpense(12100, 21);
    const laptopInvestment = calculateExpense(121000, 21);
    const yearlyLaptopDepreciation = Math.round(laptopInvestment.amountExclCents / 5);

    expect(salesInvoice.subtotalCents).toBe(20000);
    expect(salesInvoice.vatByRate[21]).toBe(3150);
    expect(salesInvoice.vatByRate[9]).toBe(450);
    expect(salesInvoice.totalCents).toBe(23600);

    expect(softwareExpense).toEqual({ amountExclCents: 10000, vatCents: 2100, amountInclCents: 12100 });
    expect(laptopInvestment).toEqual({ amountExclCents: 100000, vatCents: 21000, amountInclCents: 121000 });
    expect(yearlyLaptopDepreciation).toBe(20000);

    const payableVatCents = salesInvoice.vatCents - softwareExpense.vatCents - laptopInvestment.vatCents;
    const profitCents = salesInvoice.subtotalCents - softwareExpense.amountExclCents - yearlyLaptopDepreciation;

    expect(payableVatCents).toBe(-19500);
    expect(profitCents).toBe(-10000);
  });
});
