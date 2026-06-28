import "server-only";

export function checkPdfRuntime() {
  return {
    ok: true,
    engine: "node",
    message: "De PDF-motor is beschikbaar via de ingebouwde Vercel-vriendelijke generator.",
  };
}
