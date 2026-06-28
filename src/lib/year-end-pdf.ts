import "server-only";

import path from "node:path";
import { spawnSync } from "node:child_process";
import type { YearEndSummary } from "./year-end";
import { getPdfPython } from "./pdf-runtime";

export function generateYearEndPdf(summary: YearEndSummary) {
  const python = getPdfPython();
  const result = spawnSync(python, [path.join(process.cwd(), "scripts", "generate_year_end_pdf.py")], {
    input: JSON.stringify(summary),
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout.length) {
    console.error(result.stderr.toString());
    throw new Error("De jaarcheck kon niet als pdf worden gemaakt.");
  }
  return Buffer.from(result.stdout);
}
