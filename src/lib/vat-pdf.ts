import "server-only";

import path from "node:path";
import { spawnSync } from "node:child_process";
import type { getVatExport } from "./vat";
import { getPdfPython } from "./pdf-runtime";

export function generateVatPdf(exportData: Awaited<ReturnType<typeof getVatExport>>) {
  const python = getPdfPython();
  const result = spawnSync(python, [path.join(process.cwd(), "scripts", "generate_vat_pdf.py")], {
    input: JSON.stringify(exportData),
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout.length) {
    console.error(result.stderr.toString());
    throw new Error("Het btw-overzicht kon niet als pdf worden gemaakt.");
  }
  return Buffer.from(result.stdout);
}
