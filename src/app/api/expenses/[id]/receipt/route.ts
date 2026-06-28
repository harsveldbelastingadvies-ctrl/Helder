import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readReceiptFile } from "@/lib/receipt-storage";
import { supabaseSingle, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

type ReceiptRow = { name: string | null; storageName: string | null; mimeType: string | null };

async function getReceipt(id: string, userId: string): Promise<ReceiptRow | null> {
  if (usesSupabaseStorage()) {
    const row = await supabaseSingle<{ receipt_name: string | null; receipt_storage_name: string | null; receipt_mime_type: string | null }>("expenses", {
      select: "receipt_name,receipt_storage_name,receipt_mime_type",
      filters: { id, user_id: userId },
    });
    return row ? { name: row.receipt_name, storageName: row.receipt_storage_name, mimeType: row.receipt_mime_type } : null;
  }
  const { db } = await import("@/lib/db");
  const row = db.prepare(`SELECT receipt_name AS name, receipt_storage_name AS storageName,
    receipt_mime_type AS mimeType FROM expenses WHERE id = ? AND user_id = ?`).get(id, userId) as ReceiptRow | undefined;
  return row ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await context.params;
  const receipt = await getReceipt(id, user.id);
  if (!receipt?.storageName || !receipt.name || !receipt.mimeType) {
    return NextResponse.json({ error: "Bij deze kostenpost is geen bonnetje opgeslagen." }, { status: 404 });
  }
  try {
    const file = await readReceiptFile(user.id, receipt.storageName);
    return new Response(file, {
      headers: {
        "Content-Type": receipt.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(receipt.name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Het bonnetje kon niet worden geopend." }, { status: 404 });
  }
}

