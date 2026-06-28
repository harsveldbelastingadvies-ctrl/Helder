import "server-only";

import path from "node:path";
import { spawnSync } from "node:child_process";
import type { InvoiceDetail } from "./invoice-data";
import { getPdfPython } from "./pdf-runtime";

export function generateInvoicePdf(invoice: InvoiceDetail) {
  const python = getPdfPython();
  const result = spawnSync(python, [path.join(process.cwd(), "scripts", "generate_invoice_pdf.py")], {
    input: JSON.stringify(invoice),
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout.length) {
    console.error(result.stderr.toString());
    throw new Error("De pdf kon niet worden gemaakt.");
  }
  return Buffer.from(result.stdout);
}
