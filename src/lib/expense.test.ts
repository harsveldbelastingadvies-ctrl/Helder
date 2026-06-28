import { describe, expect, it } from "vitest";
import { calculateExpense } from "./expense";

describe("expense calculations", () => {
  it("extracts 21% VAT from a receipt total", () => {
    expect(calculateExpense(12100, 21)).toEqual({ amountExclCents: 10000, vatCents: 2100, amountInclCents: 12100 });
  });

  it("extracts 9% VAT from a receipt total", () => {
    expect(calculateExpense(10900, 9)).toEqual({ amountExclCents: 10000, vatCents: 900, amountInclCents: 10900 });
  });

  it("keeps VAT-free costs unchanged", () => {
    expect(calculateExpense(5000, 0)).toEqual({ amountExclCents: 5000, vatCents: 0, amountInclCents: 5000 });
  });
});
