import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function createAccountToken() {
  return randomBytes(18).toString("hex").toUpperCase();
}

export function hashAccountToken(token: string) {
  return createHash("sha256").update(token.trim().toUpperCase()).digest("hex");
}

export function tokenExpiry(minutes: number) {
  return Date.now() + minutes * 60 * 1000;
}
