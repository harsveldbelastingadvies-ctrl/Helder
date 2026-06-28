import "server-only";

import { getProfitLoss, type ProfitLossSummary } from "./profit-loss";
import { supabaseSelect, usesSupabaseStorage } from "./supabase";
import { getVatSummary, type VatSummary } from "./vat";

export type YearEndSummary = {
  year: number;
  finalInvoiceCount: number;
  conceptInvoiceCount: number;
  expenseCount: number;
  missingReceiptCount: number;
  reserveCents: number;
  vat: VatSummary;
  profitLoss: ProfitLossSummary;
  checklist: Array<{
    title: string;
    description: string;
    done: boolean;
  }>;
};

async function getCounts(userId: string) {
  if (usesSupabaseStorage()) {
    const [invoices, expenses] = await Promise.all([
      supabaseSelect<{ id: string; status: string }>("invoices", { select: "id,status", filters: { user_id: userId } }),
      supabaseSelect<{ id: string; receipt_name: string | null }>("expenses", { select: "id,receipt_name", filters: { user_id: userId } }),
    ]);
    return {
      finalInvoiceCount: invoices.filter((invoice) => invoice.status !== "Concept").length,
      conceptInvoiceCount: invoices.filter((invoice) => invoice.status === "Concept").length,
      expenseCount: expenses.length,
      missingReceiptCount: expenses.filter((expense) => !expense.receipt_name).length,
    };
  }
  const { db } = await import("./db");
  return {
    finalInvoiceCount: (db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE user_id = ? AND status != 'Concept'").get(userId) as { count: number }).count,
    conceptInvoiceCount: (db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE user_id = ? AND status = 'Concept'").get(userId) as { count: number }).count,
    expenseCount: (db.prepare("SELECT COUNT(*) AS count FROM expenses WHERE user_id = ?").get(userId) as { count: number }).count,
    missingReceiptCount: (db.prepare("SELECT COUNT(*) AS count FROM expenses WHERE user_id = ? AND receipt_name IS NULL").get(userId) as { count: number }).count,
  };
}

export async function getYearEndSummary(userId: string): Promise<YearEndSummary> {
  const [profitLoss, vat, counts] = await Promise.all([getProfitLoss(userId), getVatSummary(userId), getCounts(userId)]);
  const { finalInvoiceCount, conceptInvoiceCount, expenseCount, missingReceiptCount } = counts;
  const vatHasNumbers = vat.receivedVatCents > 0 || vat.paidVatCents > 0;
  const profitHasNumbers = profitLoss.revenueCents > 0 || profitLoss.regularExpensesCents > 0 || profitLoss.depreciationCents > 0;
  const reserveCents = Math.max(vat.payableVatCents, 0) + Math.round(Math.max(profitLoss.profitCents, 0) * 0.3);

  return {
    year: profitLoss.year,
    finalInvoiceCount,
    conceptInvoiceCount,
    expenseCount,
    missingReceiptCount,
    reserveCents,
    vat,
    profitLoss,
    checklist: [
      {
        title: conceptInvoiceCount === 0 ? "Facturen zijn definitief" : "Conceptfacturen controleren",
        description: conceptInvoiceCount === 0 ? `${finalInvoiceCount} facturen tellen mee voor de cijfers.` : `${conceptInvoiceCount} conceptfacturen tellen nog niet mee.`,
        done: conceptInvoiceCount === 0 && finalInvoiceCount > 0,
      },
      {
        title: expenseCount > 0 ? "Kosten zijn ingevoerd" : "Zakelijke kosten invoeren",
        description: expenseCount > 0 ? `${expenseCount} kostenposten staan klaar.` : "Kosten en bonnetjes maken btw en winst vollediger.",
        done: expenseCount > 0,
      },
      {
        title: missingReceiptCount === 0 && expenseCount > 0 ? "Bonnetjes zijn compleet" : "Bonnetjes nalopen",
        description: missingReceiptCount === 0 && expenseCount > 0 ? "Bij alle kosten staat een bewijsstuk." : `${missingReceiptCount} kostenposten missen nog een bonnetje.`,
        done: expenseCount > 0 && missingReceiptCount === 0,
      },
      {
        title: vatHasNumbers ? "Btw-overzicht staat klaar" : "Btw-overzicht vullen",
        description: vatHasNumbers ? `${vat.period}: ${vat.payableVatCents >= 0 ? "te betalen" : "terug te krijgen"}.` : "Nog geen btw-bedragen gevonden.",
        done: vatHasNumbers,
      },
      {
        title: profitHasNumbers ? "Winst en verlies berekend" : "Winst en verlies opbouwen",
        description: profitHasNumbers ? `Conceptresultaat ${profitLoss.year} staat klaar.` : "Nog onvoldoende cijfers voor een resultaat.",
        done: profitHasNumbers,
      },
      {
        title: "Bedrijfsgegevens controleren",
        description: "Controleer naam, adres, KvK, btw-id en IBAN voordat je rapporten deelt.",
        done: true,
      },
    ],
  };
}

