export type PlanId = "basis" | "dga" | "begeleiding";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export const TRIAL_DAYS = 14;

export const HELDER_PLANS: Array<{
  id: PlanId;
  name: string;
  priceLabel: string;
  shortDescription: string;
  features: string[];
}> = [
  {
    id: "basis",
    name: "Basis",
    priceLabel: "€ 19 p/m",
    shortDescription: "Voor zzp en kleine ondernemers die zelf overzicht willen.",
    features: ["Facturen en PDF", "Kosten en bonnetjes", "Btw-overzicht", "Klantenlijst"],
  },
  {
    id: "dga",
    name: "DGA-voorbereiding",
    priceLabel: "€ 39 p/m",
    shortDescription: "Voor B.V./DGA-administraties met duidelijke aandachtspunten.",
    features: ["Alles uit Basis", "DGA-signalen", "Extra jaarcheck", "Voorbereiding voor overleg"],
  },
  {
    id: "begeleiding",
    name: "Begeleiding",
    priceLabel: "€ 79 p/m",
    shortDescription: "Voor ondernemers die af en toe willen sparren of laten meekijken.",
    features: ["Alles uit DGA", "Sparmomenten", "Controle op hoofdlijnen", "Persoonlijke begeleiding"],
  },
];

export function isPlanId(value: unknown): value is PlanId {
  return value === "basis" || value === "dga" || value === "begeleiding";
}

export function getPlan(planId: string | null | undefined) {
  return HELDER_PLANS.find((plan) => plan.id === planId) ?? HELDER_PLANS[0];
}

export function createTrialPeriod(now = new Date()) {
  const trialStartedAt = now.toISOString();
  const trialEnds = new Date(now);
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);
  return { trialStartedAt, trialEndsAt: trialEnds.toISOString() };
}

export function trialDaysLeft(trialEndsAt: string | null | undefined, now = new Date()) {
  if (!trialEndsAt) return null;
  const ends = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(ends)) return null;
  return Math.max(0, Math.ceil((ends - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export function isBillingBlocked(status: SubscriptionStatus | string | null | undefined, trialEndsAt: string | null | undefined, now = new Date()) {
  if (status === "active") return false;
  if (status === "trialing") {
    const daysLeft = trialDaysLeft(trialEndsAt, now);
    return daysLeft !== null && daysLeft <= 0;
  }
  return status === "past_due" || status === "canceled";
}
