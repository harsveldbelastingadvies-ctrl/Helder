import { describe, expect, it } from "vitest";
import { summarizeInvoiceAging } from "./invoice-aging";

describe("invoice aging summary", () => {
  it("groups open invoices into overdue, due soon and later", () => {
    const summary = summarizeInvoiceAging([
      { status: "Openstaand", dueDate: "2026-06-26", totalCents: 12100 },
      { status: "Openstaand", dueDate: "2026-07-02", totalCents: 24200 },
      { status: "Openstaand", dueDate: "2026-07-20", totalCents: 36300 },
      { status: "Betaald", dueDate: "2026-06-20", totalCents: 48400 },
      { status: "Concept", dueDate: "2026-06-20", totalCents: 60500 },
    ], "2026-06-27");

    expect(summary).toEqual({
      overdueCents: 12100,
      overdueCount: 1,
      dueSoonCents: 24200,
      dueSoonCount: 1,
      laterCents: 36300,
      laterCount: 1,
      openCents: 72600,
      openCount: 3,
    });
  });
});
