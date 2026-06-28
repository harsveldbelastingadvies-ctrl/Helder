import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { calculateExpense, type VatRate } from "@/lib/expense";
import { saveReceiptFile } from "@/lib/receipt-storage";
import { supabaseInsert, supabaseSelect, usesSupabaseStorage } from "@/lib/supabase";
import { isValidIsoDate } from "@/lib/validation";

export const runtime = "nodejs";

type ExpenseInput = {
  supplier?: string;
  description?: string;
  category?: string;
  expenseDate?: string;
  amountInclCents?: number;
  vatRate?: VatRate;
  depreciationYears?: number;
  receipt?: { name?: string; mimeType?: string; data?: string };
};

type ExpenseRow = {
  id: string;
  supplier: string;
  description: string;
  category: string;
  expense_date: string;
  amount_incl_cents: number;
  vat_rate: VatRate;
  depreciation_years: number;
  receipt_name: string | null;
};

const ALLOWED_RECEIPTS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/heif": ".heif",
};
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

function formatDate(date: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

function toExpense(row: { id: string; supplier: string; description: string; category: string; expenseDate: string; amountInclCents: number; vatRate: VatRate; depreciationYears?: number; receiptName?: string | null }) {
  return { ...row, receiptName: row.receiptName ?? null, date: formatDate(row.expenseDate), ...calculateExpense(row.amountInclCents, row.vatRate) };
}

function fromSupabaseExpense(row: ExpenseRow) {
  return toExpense({
    id: row.id,
    supplier: row.supplier,
    description: row.description,
    category: row.category,
    expenseDate: row.expense_date,
    amountInclCents: row.amount_incl_cents,
    vatRate: row.vat_rate,
    depreciationYears: row.depreciation_years,
    receiptName: row.receipt_name,
  });
}

async function saveReceipt(userId: string, input: NonNullable<ExpenseInput["receipt"]>) {
  const name = input.name?.trim();
  const mimeType = input.mimeType ?? "";
  const extension = ALLOWED_RECEIPTS[mimeType];
  if (!name || !extension || !input.data) {
    throw new Error("Kies een pdf, jpg, png of foto van je bon.");
  }
  const contents = Buffer.from(input.data, "base64");
  if (!contents.length || contents.length > MAX_RECEIPT_BYTES) {
    throw new Error("Het bonnetje mag maximaal 5 MB groot zijn.");
  }
  const storageName = `${randomUUID()}${extension}`;
  await saveReceiptFile(userId, storageName, contents, mimeType);
  return { name: name.slice(0, 180), storageName, mimeType };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const expenses = usesSupabaseStorage()
    ? (await supabaseSelect<ExpenseRow>("expenses", {
      select: "id,supplier,description,category,expense_date,amount_incl_cents,vat_rate,depreciation_years,receipt_name",
      filters: { user_id: user.id },
      order: "expense_date.desc,created_at.desc",
    })).map(fromSupabaseExpense)
    : await import("@/lib/db").then(({ db }) => {
      const rows = db.prepare(`SELECT id, supplier, description, category, expense_date AS expenseDate,
        amount_incl_cents AS amountInclCents, vat_rate AS vatRate, depreciation_years AS depreciationYears, receipt_name AS receiptName
        FROM expenses WHERE user_id = ? ORDER BY expense_date DESC, created_at DESC`)
        .all(user.id) as Array<{ id: string; supplier: string; description: string; category: string; expenseDate: string; amountInclCents: number; vatRate: VatRate; depreciationYears: number; receiptName: string | null }>;
      return rows.map(toExpense);
    });
  return NextResponse.json({ expenses });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const input = await request.json() as ExpenseInput;
  if (!input.supplier?.trim() || !input.description?.trim() || !input.category?.trim() || !input.expenseDate) {
    return NextResponse.json({ error: "Vul alle gegevens van de uitgave in." }, { status: 400 });
  }
  if (!isValidIsoDate(input.expenseDate)) {
    return NextResponse.json({ error: "Controleer de datum van de uitgave." }, { status: 400 });
  }
  if (!input.amountInclCents || input.amountInclCents <= 0) {
    return NextResponse.json({ error: "Vul een bedrag hoger dan nul in." }, { status: 400 });
  }
  if (![0, 9, 21].includes(input.vatRate ?? -1)) {
    return NextResponse.json({ error: "Kies een geldig btw-tarief." }, { status: 400 });
  }
  const depreciationYears = input.depreciationYears ?? 1;
  if (![1, 5, 10].includes(depreciationYears)) {
    return NextResponse.json({ error: "Kies of deze kosten direct meetellen of worden afgeschreven over 5 of 10 jaar." }, { status: 400 });
  }

  let receipt: { name: string; storageName: string; mimeType: string } | null = null;
  if (input.receipt) {
    try {
      receipt = await saveReceipt(user.id, input.receipt);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Het bonnetje kon niet worden opgeslagen." }, { status: 400 });
    }
  }

  const row = {
    id: `expense-${randomUUID()}`,
    supplier: input.supplier.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    expenseDate: input.expenseDate,
    amountInclCents: input.amountInclCents,
    vatRate: input.vatRate!,
    depreciationYears,
    receiptName: receipt?.name ?? null,
  };
  if (usesSupabaseStorage()) {
    await supabaseInsert("expenses", {
      id: row.id,
      user_id: user.id,
      supplier: row.supplier,
      description: row.description,
      category: row.category,
      expense_date: row.expenseDate,
      amount_incl_cents: row.amountInclCents,
      vat_rate: row.vatRate,
      depreciation_years: row.depreciationYears,
      receipt_name: receipt?.name ?? null,
      receipt_storage_name: receipt?.storageName ?? null,
      receipt_mime_type: receipt?.mimeType ?? null,
    });
  } else {
    const { db } = await import("@/lib/db");
    db.prepare(`INSERT INTO expenses
      (id, user_id, supplier, description, category, expense_date, amount_incl_cents, vat_rate, depreciation_years, receipt_name, receipt_storage_name, receipt_mime_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(row.id, user.id, row.supplier, row.description, row.category, row.expenseDate, row.amountInclCents, row.vatRate, row.depreciationYears, receipt?.name ?? null, receipt?.storageName ?? null, receipt?.mimeType ?? null);
  }
  return NextResponse.json({ expense: toExpense(row) }, { status: 201 });
}

