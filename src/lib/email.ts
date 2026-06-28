import "server-only";

type AccountEmailInput = {
  to: string;
  subject: string;
  text: string;
};

type EmailResult =
  | { sent: true }
  | { sent: false; reason: "local_mode" | "missing_configuration" | "provider_error" };

export function usesOnlineEmail() {
  return process.env.NODE_ENV === "production" && process.env.HELDER_LOCAL !== "true";
}

export async function sendAccountEmail(input: AccountEmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!usesOnlineEmail()) return { sent: false, reason: "local_mode" };
  if (!apiKey || !from) return { sent: false, reason: "missing_configuration" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Resend e-mail versturen is mislukt", response.status, body.slice(0, 500));
      return { sent: false, reason: "provider_error" };
    }

    return { sent: true };
  } catch (error) {
    console.error("Resend e-mail versturen is mislukt", error);
    return { sent: false, reason: "provider_error" };
  }
}

