import "server-only";

import path from "node:path";

function hasCustomStorage() {
  return Boolean(process.env.HELDER_DATA_DIR || process.env.HELDER_DATABASE_PATH);
}

export function getDataDirectory() {
  return process.env.HELDER_DATA_DIR
    ? path.resolve(process.env.HELDER_DATA_DIR)
    : path.join(process.cwd(), "data");
}

export function getDatabasePath() {
  return process.env.HELDER_DATABASE_PATH
    ? path.resolve(process.env.HELDER_DATABASE_PATH)
    : path.join(getDataDirectory(), "helder.db");
}

export function getReceiptDirectory(userId: string) {
  return path.join(getDataDirectory(), "receipts", userId);
}

export function shouldSeedDemoData() {
  if (process.env.HELDER_SEED_DEMO === "true") return true;
  if (process.env.HELDER_SEED_DEMO === "false") return false;
  return !(process.env.NODE_ENV === "production" && hasCustomStorage());
}

