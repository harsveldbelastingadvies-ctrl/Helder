export type VatRate = 0 | 9 | 21;

export function calculateExpense(amountInclCents: number, vatRate: VatRate) {
  if (vatRate === 0) return { amountExclCents: amountInclCents, vatCents: 0, amountInclCents };
  const amountExclCents = Math.round(amountInclCents * 100 / (100 + vatRate));
  return { amountExclCents, vatCents: amountInclCents - amountExclCents, amountInclCents };
}
