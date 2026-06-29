import "server-only";

type MollieCustomer = {
  id: string;
};

export type MolliePayment = {
  id: string;
  status: string;
  customerId?: string;
  subscriptionId?: string;
  metadata?: Record<string, unknown> | null;
  _links?: {
    checkout?: {
      href?: string;
    };
  };
};

type MollieSubscription = {
  id: string;
  status: string;
};

type MollieRequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
};

export function getMollieApiKey() {
  return process.env.MOLLIE_API_KEY?.trim() || null;
}

export async function getMolliePayment(paymentId: string) {
  return await mollieRequest<MolliePayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export function getPublicAppUrl(request: Request) {
  const configured = process.env.HELDER_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const origin = new URL(request.url).origin;
  return origin.replace(/\/$/, "");
}

function requireMollieApiKey() {
  const apiKey = getMollieApiKey();
  if (!apiKey) throw new Error("Mollie is nog niet ingesteld. Vul MOLLIE_API_KEY in.");
  return apiKey;
}

async function mollieRequest<T>(path: string, options: MollieRequestOptions = {}) {
  const response = await fetch(`https://api.mollie.com/v2${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${requireMollieApiKey()}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Mollie gaf een fout terug (${response.status}): ${body || response.statusText}`);
  }

  return await response.json() as T;
}

export async function createMollieCustomer(input: { name: string; email: string }) {
  return await mollieRequest<MollieCustomer>("/customers", {
    method: "POST",
    body: {
      name: input.name,
      email: input.email,
    },
  });
}

export async function createMollieFirstPayment(input: {
  customerId: string;
  amountCents: number;
  description: string;
  redirectUrl: string;
  webhookUrl?: string;
  metadata: Record<string, string>;
}) {
  const payment = await mollieRequest<MolliePayment>("/payments", {
    method: "POST",
    body: {
      amount: {
        currency: "EUR",
        value: (input.amountCents / 100).toFixed(2),
      },
      customerId: input.customerId,
      sequenceType: "first",
      description: input.description,
      redirectUrl: input.redirectUrl,
      ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
      metadata: input.metadata,
    },
  });

  const checkoutUrl = payment._links?.checkout?.href;
  if (!checkoutUrl) throw new Error("Mollie heeft geen betaalpagina teruggegeven.");

  return {
    id: payment.id,
    status: payment.status,
    checkoutUrl,
  };
}

export async function createMollieSubscription(input: {
  customerId: string;
  amountCents: number;
  description: string;
  webhookUrl: string;
  startDate: string;
}) {
  return await mollieRequest<MollieSubscription>(`/customers/${encodeURIComponent(input.customerId)}/subscriptions`, {
    method: "POST",
    body: {
      amount: {
        currency: "EUR",
        value: (input.amountCents / 100).toFixed(2),
      },
      interval: "1 month",
      startDate: input.startDate,
      description: input.description,
      webhookUrl: input.webhookUrl,
    },
  });
}
