import "server-only";

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deleteSupabaseObject, downloadSupabaseObject, uploadSupabaseObject, usesSupabaseStorage } from "./supabase";
import { getReceiptDirectory } from "./storage";

export function receiptStoragePath(userId: string, storageName: string) {
  return `${userId}/${path.basename(storageName)}`;
}

export async function saveReceiptFile(userId: string, storageName: string, contents: Buffer, mimeType: string) {
  if (usesSupabaseStorage()) {
    await uploadSupabaseObject(receiptStoragePath(userId, storageName), contents, mimeType);
    return;
  }
  const receiptDirectory = getReceiptDirectory(userId);
  mkdirSync(receiptDirectory, { recursive: true });
  writeFileSync(path.join(receiptDirectory, path.basename(storageName)), contents, { flag: "wx" });
}

export async function readReceiptFile(userId: string, storageName: string) {
  if (usesSupabaseStorage()) {
    return await downloadSupabaseObject(receiptStoragePath(userId, storageName));
  }
  return readFileSync(path.join(getReceiptDirectory(userId), path.basename(storageName)));
}

export async function removeReceiptFile(userId: string, storageName?: string | null) {
  if (!storageName) return;
  try {
    if (usesSupabaseStorage()) {
      await deleteSupabaseObject(receiptStoragePath(userId, storageName));
      return;
    }
    rmSync(path.join(getReceiptDirectory(userId), path.basename(storageName)), { force: true });
  } catch {
    // Het verwijderen van een bonbestand mag de administratie zelf niet blokkeren.
  }
}

