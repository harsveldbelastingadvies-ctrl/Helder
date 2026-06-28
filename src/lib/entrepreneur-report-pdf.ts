import "server-only";

import path from "node:path";
import { spawnSync } from "node:child_process";
import type { EntrepreneurReport } from "./entrepreneur-report";
import { getPdfPython } from "./pdf-runtime";

export function generateEntrepreneurReportPdf(report: EntrepreneurReport) {
  const python = getPdfPython();
  const result = spawnSync(python, [path.join(process.cwd(), "scripts", "generate_entrepreneur_report_pdf.py")], {
    input: JSON.stringify(report),
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout.length) {
    console.error(result.stderr.toString());
    throw new Error("Het ondernemersrapport kon niet als pdf worden gemaakt.");
  }
  return Buffer.from(result.stdout);
}
