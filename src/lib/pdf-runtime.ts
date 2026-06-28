import "server-only";

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const bundledPython = "/Users/ralf/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

export function getPdfPython() {
  return process.env.HELDER_PYTHON || (existsSync(bundledPython) ? bundledPython : "python3");
}

export function checkPdfRuntime() {
  const python = getPdfPython();
  const result = spawnSync(python, ["-c", "import reportlab; print('ok')"], {
    maxBuffer: 1024 * 1024,
  });

  if (result.status === 0 && result.stdout.toString().includes("ok")) {
    return {
      ok: true,
      python,
      message: "De PDF-motor is beschikbaar.",
    };
  }

  return {
    ok: false,
    python,
    message: "De PDF-motor is nog niet beschikbaar. Controleer Python en de reportlab-bibliotheek, of bouw de PDF-functie om naar een Vercel-vriendelijke oplossing.",
  };
}
