import { describe, expect, it } from "vitest";
import { isValidEmail, isValidIsoDate, validateInvoiceLines } from "./validation";

describe("input validation", () => {
  it("accepts normal email addresses and rejects incomplete ones", () => {
    expect(isValidEmail("ondernemer@example.nl")).toBe(true);
    expect(isValidEmail("ondernemer@localhost")).toBe(false);
    expect(isValidEmail("zonder-apenstaartje.nl")).toBe(false);
  });

  it("accepts real ISO dates and rejects impossible dates", () => {
    expect(isValidIsoDate("2026-06-26")).toBe(true);
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("26-06-2026")).toBe(false);
  });

  it("requires complete invoice lines", () => {
    expect(validateInvoiceLines([
      { id: "line-1", description: "Advies", quantity: 1, unitPriceCents: 10000, vatRate: 21 },
    ])).toBeNull();

    expect(validateInvoiceLines([
      { id: "line-1", description: "", quantity: 1, unitPriceCents: 10000, vatRate: 21 },
    ])).toBe("Vul bij elke factuurregel omschrijving, aantal, prijs en btw goed in.");

    expect(validateInvoiceLines([
      { id: "line-1", description: "Advies", quantity: 1, unitPriceCents: 10000, vatRate: 7 as 21 },
    ])).toBe("Vul bij elke factuurregel omschrijving, aantal, prijs en btw goed in.");
  });
});
