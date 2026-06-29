import "server-only";

import { calculateInvoice, type InvoiceLine } from "./invoice";
import { readReceiptFile, saveReceiptFile } from "./receipt-storage";
import { supabaseDelete, supabaseInsertMany, supabaseSelect, supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "./supabase";

type CompanyRow = {
  id: string;
  name: string;
  email: string;
  companyName: string;
  companyType: string;
  street: string;
  postalCode: string;
  city: string;
  kvkNumber: string;
  vatNumber: string;
  iban: string;
  invoicePaymentTerm: number;
  defaultVatRate: number;
  invoiceFooter: string;
  invoiceLogo: string;
  planType: string;
  subscriptionStatus: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
};

type BackupPayload = Awaited<ReturnType<typeof getAdministrationBackup>>;

const unsafeBackupKeyPattern = /password|wachtwoord|session|sessie|token|hash/i;
const receiptExtensions: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/heif": ".heif",
};
const maxBackupReceiptBytes = 5 * 1024 * 1024;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolAsInteger(value: unknown) {
  return value === 1 || value === true ? 1 : 0;
}

function boolValue(value: unknown) {
  return value === 1 || value === true;
}

function validVatRate(value: unknown): 0 | 9 | 21 {
  const rate = number(value, 21);
  return [0, 9, 21].includes(rate) ? rate as 0 | 9 | 21 : 21;
}

function validDepreciationYears(value: unknown) {
  const years = number(value, 1);
  return [1, 5, 10].includes(years) ? years : 1;
}

function validInvoiceStatus(value: unknown) {
  const status = text(value);
  return ["Betaald", "Openstaand", "Concept", "Te laat"].includes(status) ? status : "Concept";
}

function validCompanyType(value: unknown) {
  const type = text(value, "sole_proprietor");
  return ["sole_proprietor", "bv_dga", "other"].includes(type) ? type : "sole_proprietor";
}

function validPlanType(value: unknown) {
  const type = text(value, "basis");
  return ["basis", "dga", "begeleiding"].includes(type) ? type : "basis";
}

function validSubscriptionStatus(value: unknown) {
  const status = text(value, "trialing");
  return ["trialing", "active", "past_due", "canceled"].includes(status) ? status : "trialing";
}

function publicExpense(expense: Record<string, unknown>) {
  return {
    id: text(expense.id),
    supplier: text(expense.supplier),
    description: text(expense.description),
    category: text(expense.category),
    expenseDate: text(expense.expenseDate),
    amountInclCents: number(expense.amountInclCents),
    vatRate: validVatRate(expense.vatRate),
    depreciationYears: validDepreciationYears(expense.depreciationYears),
    receiptName: text(expense.receiptName) || null,
    receiptMimeType: text(expense.receiptMimeType) || null,
    createdAt: text(expense.createdAt),
  };
}

async function getReceiptFiles(userId: string, expenses: Array<Record<string, unknown>>) {
  const files: Array<{ expenseId: string; name: string; mimeType: string; sizeBytes: number; dataBase64: string }> = [];
  for (const expense of expenses) {
    const expenseId = text(expense.id);
    const storageName = text(expense.receiptStorageName);
    const name = text(expense.receiptName);
    const mimeType = text(expense.receiptMimeType);
    if (!expenseId || !storageName || !name || !mimeType) continue;
    try {
      const contents = await readReceiptFile(userId, storageName);
      if (!contents.length || contents.length > maxBackupReceiptBytes) continue;
      files.push({
        expenseId,
        name,
        mimeType,
        sizeBytes: contents.length,
        dataBase64: contents.toString("base64"),
      });
    } catch {
      // Een ontbrekend bonbestand mag de administratieback-up niet blokkeren.
    }
  }
  return files;
}

async function prepareReceiptRestores(userId: string, backup: BackupPayload) {
  const restored = new Map<string, { name: string; storageName: string; mimeType: string }>();
  for (const file of backup.receiptFiles ?? []) {
    const item = file as Record<string, unknown>;
    const expenseId = text(item.expenseId);
    const name = text(item.name).slice(0, 180);
    const mimeType = text(item.mimeType);
    const dataBase64 = text(item.dataBase64);
    const sizeBytes = number(item.sizeBytes);
    const extension = receiptExtensions[mimeType];
    if (!expenseId || !name || !extension || !dataBase64) continue;
    const contents = Buffer.from(dataBase64, "base64");
    if (!contents.length || contents.length > maxBackupReceiptBytes) continue;
    if (sizeBytes && sizeBytes !== contents.length) continue;
    const storageName = `${crypto.randomUUID()}${extension}`;
    await saveReceiptFile(userId, storageName, contents, mimeType);
    restored.set(expenseId, { name, storageName, mimeType });
  }
  return restored;
}

async function getLocalAdministrationBackup(userId: string) {
  const { db } = await import("./db");
  const company = db.prepare(`SELECT id, name, email, company_name AS companyName, company_type AS companyType, street,
    postal_code AS postalCode, city, kvk_number AS kvkNumber, vat_number AS vatNumber,
    iban, invoice_payment_term AS invoicePaymentTerm, default_vat_rate AS defaultVatRate,
    invoice_footer AS invoiceFooter, invoice_logo AS invoiceLogo, plan_type AS planType,
    subscription_status AS subscriptionStatus, trial_started_at AS trialStartedAt, trial_ends_at AS trialEndsAt,
    created_at AS createdAt FROM users WHERE id = ?`).get(userId) as CompanyRow;

  const customers = db.prepare(`SELECT id, name, contact, email, street, postal_code AS postalCode,
    city, revenue_cents AS revenueCents, initials, color, created_at AS createdAt
    FROM customers WHERE user_id = ? ORDER BY name ASC`).all(userId);

  const invoices = db.prepare(`SELECT id, customer_id AS customerId, issue_date AS issueDate,
    due_date AS dueDate, total_cents AS totalCents, status, invoice_footer AS invoiceFooter, created_at AS createdAt
    FROM invoices WHERE user_id = ? ORDER BY issue_date DESC, id DESC`).all(userId);

  const invoiceLines = db.prepare(`SELECT invoice_lines.id, invoice_lines.invoice_id AS invoiceId,
    invoice_lines.description, invoice_lines.quantity, invoice_lines.unit_price_cents AS unitPriceCents,
    invoice_lines.vat_rate AS vatRate
    FROM invoice_lines JOIN invoices ON invoices.id = invoice_lines.invoice_id
    WHERE invoices.user_id = ? ORDER BY invoice_lines.rowid ASC`).all(userId);

  const expenses = db.prepare(`SELECT id, supplier, description, category, expense_date AS expenseDate,
    amount_incl_cents AS amountInclCents, vat_rate AS vatRate, depreciation_years AS depreciationYears,
    receipt_name AS receiptName, receipt_storage_name AS receiptStorageName, receipt_mime_type AS receiptMimeType, created_at AS createdAt
    FROM expenses WHERE user_id = ? ORDER BY expense_date DESC, supplier ASC`).all(userId);

  const notes = db.prepare(`SELECT id, customer_id AS customerId, body, created_at AS createdAt
    FROM customer_notes WHERE user_id = ? ORDER BY created_at DESC`).all(userId);

  const tasks = db.prepare(`SELECT id, customer_id AS customerId, title, due_date AS dueDate,
    completed, created_at AS createdAt
    FROM customer_tasks WHERE user_id = ? ORDER BY due_date ASC, created_at DESC`).all(userId);

  const receiptFiles = await getReceiptFiles(userId, expenses as Array<Record<string, unknown>>);

  return { company, customers, invoices, invoiceLines, expenses: (expenses as Array<Record<string, unknown>>).map(publicExpense), receiptFiles, crm: { notes, tasks } };
}

async function getSupabaseAdministrationBackup(userId: string) {
  const [company, customers, invoices, expenses, notes, tasks] = await Promise.all([
    supabaseSingle<{
      id: string; name: string; email: string; company_name: string; company_type: string; street: string; postal_code: string; city: string;
      kvk_number: string; vat_number: string; iban: string; invoice_payment_term: number; default_vat_rate: number;
      invoice_footer: string; invoice_logo: string; plan_type: string; subscription_status: string; trial_started_at: string | null; trial_ends_at: string | null; created_at: string;
    }>("users", {
      select: "id,name,email,company_name,company_type,street,postal_code,city,kvk_number,vat_number,iban,invoice_payment_term,default_vat_rate,invoice_footer,invoice_logo,plan_type,subscription_status,trial_started_at,trial_ends_at,created_at",
      filters: { id: userId },
    }),
    supabaseSelect<{
      id: string; name: string; contact: string; email: string; street: string; postal_code: string; city: string;
      revenue_cents: number; initials: string; color: string; created_at: string;
    }>("customers", { select: "id,name,contact,email,street,postal_code,city,revenue_cents,initials,color,created_at", filters: { user_id: userId }, order: "name.asc" }),
    supabaseSelect<{
      id: string; customer_id: string; issue_date: string; due_date: string; total_cents: number; status: string; invoice_footer: string; created_at: string;
    }>("invoices", { select: "id,customer_id,issue_date,due_date,total_cents,status,invoice_footer,created_at", filters: { user_id: userId }, order: "issue_date.desc,id.desc" }),
    supabaseSelect<{
      id: string; supplier: string; description: string; category: string; expense_date: string; amount_incl_cents: number;
      vat_rate: number; depreciation_years: number; receipt_name: string | null; receipt_storage_name: string | null; receipt_mime_type: string | null; created_at: string;
    }>("expenses", { select: "id,supplier,description,category,expense_date,amount_incl_cents,vat_rate,depreciation_years,receipt_name,receipt_storage_name,receipt_mime_type,created_at", filters: { user_id: userId }, order: "expense_date.desc,supplier.asc" }),
    supabaseSelect<{ id: string; customer_id: string; body: string; created_at: string }>("customer_notes", {
      select: "id,customer_id,body,created_at",
      filters: { user_id: userId },
      order: "created_at.desc",
    }),
    supabaseSelect<{ id: string; customer_id: string; title: string; due_date: string; completed: boolean; created_at: string }>("customer_tasks", {
      select: "id,customer_id,title,due_date,completed,created_at",
      filters: { user_id: userId },
      order: "due_date.asc,created_at.desc",
    }),
  ]);

  const invoiceLines = (await Promise.all(invoices.map((invoice) => supabaseSelect<{
    id: string; invoice_id: string; description: string; quantity: number; unit_price_cents: number; vat_rate: number; created_at: string;
  }>("invoice_lines", {
    select: "id,invoice_id,description,quantity,unit_price_cents,vat_rate,created_at",
    filters: { invoice_id: invoice.id },
    order: "created_at.asc,id.asc",
  })))).flat();

  const expenseRows = expenses.map((expense) => ({
    id: expense.id,
    supplier: expense.supplier,
    description: expense.description,
    category: expense.category,
    expenseDate: expense.expense_date,
    amountInclCents: expense.amount_incl_cents,
    vatRate: expense.vat_rate,
    depreciationYears: expense.depreciation_years,
    receiptName: expense.receipt_name,
    receiptStorageName: expense.receipt_storage_name,
    receiptMimeType: expense.receipt_mime_type,
    createdAt: expense.created_at,
  }));
  const receiptFiles = await getReceiptFiles(userId, expenseRows);

  return {
    company: company ? {
      id: company.id,
      name: company.name,
      email: company.email,
      companyName: company.company_name,
      companyType: company.company_type,
      street: company.street,
      postalCode: company.postal_code,
      city: company.city,
      kvkNumber: company.kvk_number,
      vatNumber: company.vat_number,
      iban: company.iban,
      invoicePaymentTerm: company.invoice_payment_term,
      defaultVatRate: company.default_vat_rate,
      invoiceFooter: company.invoice_footer,
      invoiceLogo: company.invoice_logo,
      planType: company.plan_type,
      subscriptionStatus: company.subscription_status,
      trialStartedAt: company.trial_started_at,
      trialEndsAt: company.trial_ends_at,
      createdAt: company.created_at,
    } : null,
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      contact: customer.contact,
      email: customer.email,
      street: customer.street,
      postalCode: customer.postal_code,
      city: customer.city,
      revenueCents: customer.revenue_cents,
      initials: customer.initials,
      color: customer.color,
      createdAt: customer.created_at,
    })),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      customerId: invoice.customer_id,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      totalCents: invoice.total_cents,
      status: invoice.status,
      invoiceFooter: invoice.invoice_footer,
      createdAt: invoice.created_at,
    })),
    invoiceLines: invoiceLines.map((line) => ({
      id: line.id,
      invoiceId: line.invoice_id,
      description: line.description,
      quantity: Number(line.quantity),
      unitPriceCents: line.unit_price_cents,
      vatRate: line.vat_rate,
    })),
    expenses: expenseRows.map(publicExpense),
    receiptFiles,
    crm: {
      notes: notes.map((note) => ({ id: note.id, customerId: note.customer_id, body: note.body, createdAt: note.created_at })),
      tasks: tasks.map((task) => ({ id: task.id, customerId: task.customer_id, title: task.title, dueDate: task.due_date, completed: task.completed, createdAt: task.created_at })),
    },
  };
}

export async function getAdministrationBackup(userId: string) {
  const payload = usesSupabaseStorage() ? await getSupabaseAdministrationBackup(userId) : await getLocalAdministrationBackup(userId);
  return {
    exportInfo: {
      product: "Rekenrust",
      version: 1,
      createdAt: new Date().toISOString(),
      note: "Deze back-up bevat administratiegegevens, factuurinstellingen en bonbestanden, maar geen wachtwoorden of sessies.",
    },
    ...payload,
  };
}

function collectObjectKeys(value: unknown, keys: string[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      keys.push(key);
      collectObjectKeys(item, keys);
    }
  }
  return keys;
}

export async function inspectAdministrationBackup(userId: string) {
  const backup = await getAdministrationBackup(userId);
  const customers = backup.customers ?? [];
  const invoices = backup.invoices ?? [];
  const invoiceLines = backup.invoiceLines ?? [];
  const expenses = backup.expenses ?? [];
  const receiptFiles = backup.receiptFiles ?? [];
  const notes = backup.crm?.notes ?? [];
  const tasks = backup.crm?.tasks ?? [];
  const unsafeKeys = Array.from(new Set(collectObjectKeys(backup).filter((key) => unsafeBackupKeyPattern.test(key))));
  const customerIds = new Set(customers.map((customer) => text((customer as Record<string, unknown>).id)).filter(Boolean));
  const invoiceIds = new Set(invoices.map((invoice) => text((invoice as Record<string, unknown>).id)).filter(Boolean));
  const invoicesWithLines = new Set(invoiceLines.map((line) => text((line as Record<string, unknown>).invoiceId)).filter(Boolean));
  const missingCustomerLinks = invoices.filter((invoice) => !customerIds.has(text((invoice as Record<string, unknown>).customerId))).length;
  const missingInvoiceLinks = invoiceLines.filter((line) => !invoiceIds.has(text((line as Record<string, unknown>).invoiceId))).length;
  const invoicesWithoutLines = invoices.filter((invoice) => !invoicesWithLines.has(text((invoice as Record<string, unknown>).id))).length;
  const receiptsListed = expenses.filter((expense) => text((expense as Record<string, unknown>).receiptName)).length;
  const receiptExpenseIds = new Set(receiptFiles.map((file) => text((file as Record<string, unknown>).expenseId)).filter(Boolean));
  const receiptsMissingFiles = expenses.filter((expense) => text((expense as Record<string, unknown>).receiptName) && !receiptExpenseIds.has(text((expense as Record<string, unknown>).id))).length;
  const ok = Boolean(backup.company)
    && unsafeKeys.length === 0
    && missingCustomerLinks === 0
    && missingInvoiceLinks === 0
    && invoicesWithoutLines === 0
    && receiptsMissingFiles === 0;

  return {
    ok,
    checkedAt: new Date().toISOString(),
    storage: usesSupabaseStorage() ? "supabase" : "local",
    counts: {
      customers: customers.length,
      invoices: invoices.length,
      invoiceLines: invoiceLines.length,
      expenses: expenses.length,
      receiptFiles: receiptFiles.length,
      notes: notes.length,
      tasks: tasks.length,
      receiptsListed,
    },
    checks: {
      companyPresent: Boolean(backup.company),
      noSensitiveFields: unsafeKeys.length === 0,
      invoicesLinkedToCustomers: missingCustomerLinks === 0,
      linesLinkedToInvoices: missingInvoiceLinks === 0,
      invoicesHaveLines: invoicesWithoutLines === 0,
      receiptsIncluded: receiptsMissingFiles === 0,
    },
    warnings: [
      ...(!backup.company ? ["Bedrijfsgegevens ontbreken in de back-up."] : []),
      ...(unsafeKeys.length ? ["De back-up bevat velden die niet in een administratieback-up thuishoren."] : []),
      ...(missingCustomerLinks ? ["Niet iedere factuur is gekoppeld aan een klant."] : []),
      ...(missingInvoiceLinks ? ["Niet iedere factuurregel is gekoppeld aan een factuur."] : []),
      ...(invoicesWithoutLines ? ["Er is minstens één factuur zonder factuurregel."] : []),
      ...(receiptsMissingFiles ? ["Niet ieder genoemd bonbestand zit daadwerkelijk in de back-up."] : []),
    ],
    message: ok
      ? "Back-upcontrole geslaagd. De administratie en bonbestanden zijn compleet genoeg om te exporteren."
      : "Back-upcontrole vraagt aandacht. Controleer de meldingen voordat je live gaat.",
  };
}

async function restoreLocalAdministrationBackup(userId: string, backup: BackupPayload) {
  const restoredReceipts = await prepareReceiptRestores(userId, backup);
  const { db } = await import("./db");
  const restore = db.transaction(() => {
    db.prepare("DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE user_id = ?)").run(userId);
    db.prepare("DELETE FROM invoices WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM customer_notes WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM customer_tasks WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM expenses WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM customers WHERE user_id = ?").run(userId);

    const company = backup.company;
    if (company) {
      db.prepare(`UPDATE users SET name = ?, email = ?, company_name = ?, company_type = ?, street = ?, postal_code = ?, city = ?,
        kvk_number = ?, vat_number = ?, iban = ?, invoice_payment_term = ?, default_vat_rate = ?, invoice_footer = ?, invoice_logo = ?,
        plan_type = ?, subscription_status = ?, trial_started_at = ?, trial_ends_at = ?
        WHERE id = ?`)
        .run(
          text(company.name, "Ondernemer"),
          text(company.email, "demo@rekenrust.nl").toLowerCase(),
          text(company.companyName, "Mijn onderneming"),
          validCompanyType(company.companyType),
          text(company.street),
          text(company.postalCode).toUpperCase(),
          text(company.city),
          text(company.kvkNumber).replace(/\s/g, ""),
          text(company.vatNumber).replace(/\s/g, "").toUpperCase(),
          text(company.iban).toUpperCase(),
          [7, 14, 30, 60].includes(number(company.invoicePaymentTerm, 14)) ? company.invoicePaymentTerm : 14,
          [0, 9, 21].includes(number(company.defaultVatRate, 21)) ? company.defaultVatRate : 21,
          text(company.invoiceFooter, "Bedankt voor de fijne samenwerking.").slice(0, 240),
          text(company.invoiceLogo),
          validPlanType(company.planType),
          validSubscriptionStatus(company.subscriptionStatus),
          text(company.trialStartedAt) || null,
          text(company.trialEndsAt) || null,
          userId,
        );
    }

    const insertCustomer = db.prepare(`INSERT INTO customers
      (id, user_id, name, contact, email, street, postal_code, city, revenue_cents, initials, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const customer of backup.customers ?? []) {
      const item = customer as Record<string, unknown>;
      insertCustomer.run(text(item.id, crypto.randomUUID()), userId, text(item.name, "Klant"), text(item.contact), text(item.email), text(item.street), text(item.postalCode), text(item.city), number(item.revenueCents), text(item.initials, "?").slice(0, 3), text(item.color, "mint"));
    }

    const customerIds = new Set((backup.customers ?? []).map((customer) => text((customer as Record<string, unknown>).id)).filter(Boolean));
    const insertInvoice = db.prepare(`INSERT INTO invoices
      (id, user_id, customer_id, issue_date, due_date, total_cents, status, invoice_footer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertLine = db.prepare(`INSERT INTO invoice_lines
      (id, invoice_id, description, quantity, unit_price_cents, vat_rate) VALUES (?, ?, ?, ?, ?, ?)`);
    const linesByInvoice = new Map<string, InvoiceLine[]>();
    for (const line of backup.invoiceLines ?? []) {
      const item = line as Record<string, unknown>;
      const invoiceId = text(item.invoiceId);
      if (!invoiceId) continue;
      const rows = linesByInvoice.get(invoiceId) ?? [];
      rows.push({
        id: text(item.id, crypto.randomUUID()),
        description: text(item.description, "Factuurregel"),
        quantity: number(item.quantity, 1),
        unitPriceCents: number(item.unitPriceCents),
        vatRate: validVatRate(item.vatRate),
      });
      linesByInvoice.set(invoiceId, rows);
    }
    for (const invoice of backup.invoices ?? []) {
      const item = invoice as Record<string, unknown>;
      const id = text(item.id);
      const customerId = text(item.customerId);
      if (!id || !customerIds.has(customerId)) continue;
      const lines = linesByInvoice.get(id) ?? [];
      const totals = calculateInvoice(lines);
      insertInvoice.run(id, userId, customerId, text(item.issueDate), text(item.dueDate), totals.totalCents, validInvoiceStatus(item.status), text(item.invoiceFooter, "Bedankt voor de fijne samenwerking.").slice(0, 240));
      for (const line of lines) insertLine.run(line.id, id, line.description, line.quantity, line.unitPriceCents, line.vatRate);
    }

    const insertExpense = db.prepare(`INSERT INTO expenses
      (id, user_id, supplier, description, category, expense_date, amount_incl_cents, vat_rate, depreciation_years, receipt_name, receipt_storage_name, receipt_mime_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const expense of backup.expenses ?? []) {
      const item = expense as Record<string, unknown>;
      const expenseId = text(item.id, `expense-${crypto.randomUUID()}`);
      const receipt = restoredReceipts.get(expenseId);
      insertExpense.run(expenseId, userId, text(item.supplier, "Leverancier"), text(item.description, "Kostenpost"), text(item.category, "Overig"), text(item.expenseDate), number(item.amountInclCents), validVatRate(item.vatRate), validDepreciationYears(item.depreciationYears), receipt?.name ?? (text(item.receiptName) || null), receipt?.storageName ?? null, receipt?.mimeType ?? (text(item.receiptMimeType) || null));
    }

    const insertNote = db.prepare("INSERT INTO customer_notes (id, user_id, customer_id, body, created_at) VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))");
    for (const note of backup.crm?.notes ?? []) {
      const item = note as Record<string, unknown>;
      const customerId = text(item.customerId);
      if (!customerIds.has(customerId)) continue;
      insertNote.run(text(item.id, crypto.randomUUID()), userId, customerId, text(item.body), text(item.createdAt) || null);
    }

    const insertTask = db.prepare("INSERT INTO customer_tasks (id, user_id, customer_id, title, due_date, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))");
    for (const task of backup.crm?.tasks ?? []) {
      const item = task as Record<string, unknown>;
      const customerId = text(item.customerId);
      if (!customerIds.has(customerId)) continue;
      insertTask.run(text(item.id, crypto.randomUUID()), userId, customerId, text(item.title, "Opvolgactie"), text(item.dueDate), boolAsInteger(item.completed), text(item.createdAt) || null);
    }
  });
  restore();
}

async function restoreSupabaseAdministrationBackup(userId: string, backup: BackupPayload) {
  const restoredReceipts = await prepareReceiptRestores(userId, backup);
  const existingInvoices = await supabaseSelect<{ id: string }>("invoices", { select: "id", filters: { user_id: userId } });
  for (const invoice of existingInvoices) {
    await supabaseDelete("invoice_lines", { invoice_id: invoice.id });
  }
  await supabaseDelete("invoices", { user_id: userId });
  await supabaseDelete("customer_notes", { user_id: userId });
  await supabaseDelete("customer_tasks", { user_id: userId });
  await supabaseDelete("expenses", { user_id: userId });
  await supabaseDelete("customers", { user_id: userId });

  const company = backup.company;
  if (company) {
    await supabaseUpdate("users", { id: userId }, {
      name: text(company.name, "Ondernemer"),
      email: text(company.email, "demo@rekenrust.nl").toLowerCase(),
      company_name: text(company.companyName, "Mijn onderneming"),
      company_type: validCompanyType(company.companyType),
      street: text(company.street),
      postal_code: text(company.postalCode).toUpperCase(),
      city: text(company.city),
      kvk_number: text(company.kvkNumber).replace(/\s/g, ""),
      vat_number: text(company.vatNumber).replace(/\s/g, "").toUpperCase(),
      iban: text(company.iban).toUpperCase(),
      invoice_payment_term: [7, 14, 30, 60].includes(number(company.invoicePaymentTerm, 14)) ? number(company.invoicePaymentTerm, 14) : 14,
      default_vat_rate: [0, 9, 21].includes(number(company.defaultVatRate, 21)) ? number(company.defaultVatRate, 21) : 21,
      invoice_footer: text(company.invoiceFooter, "Bedankt voor de fijne samenwerking.").slice(0, 240),
      invoice_logo: text(company.invoiceLogo),
      plan_type: validPlanType(company.planType),
      subscription_status: validSubscriptionStatus(company.subscriptionStatus),
      trial_started_at: text(company.trialStartedAt) || null,
      trial_ends_at: text(company.trialEndsAt) || null,
    });
  }

  const customers = (backup.customers ?? []).map((customer) => {
    const item = customer as Record<string, unknown>;
    return {
      id: text(item.id, crypto.randomUUID()),
      user_id: userId,
      name: text(item.name, "Klant"),
      contact: text(item.contact),
      email: text(item.email),
      street: text(item.street),
      postal_code: text(item.postalCode),
      city: text(item.city),
      revenue_cents: number(item.revenueCents),
      initials: text(item.initials, "?").slice(0, 3),
      color: text(item.color, "mint"),
    };
  });
  await supabaseInsertMany("customers", customers);
  const customerIds = new Set(customers.map((customer) => customer.id).filter(Boolean));

  const linesByInvoice = new Map<string, InvoiceLine[]>();
  for (const line of backup.invoiceLines ?? []) {
    const item = line as Record<string, unknown>;
    const invoiceId = text(item.invoiceId);
    if (!invoiceId) continue;
    const rows = linesByInvoice.get(invoiceId) ?? [];
    rows.push({
      id: text(item.id, crypto.randomUUID()),
      description: text(item.description, "Factuurregel"),
      quantity: number(item.quantity, 1),
      unitPriceCents: number(item.unitPriceCents),
      vatRate: validVatRate(item.vatRate),
    });
    linesByInvoice.set(invoiceId, rows);
  }

  const invoices: Array<Record<string, unknown>> = [];
  const invoiceLines: Array<Record<string, unknown>> = [];
  for (const invoice of backup.invoices ?? []) {
    const item = invoice as Record<string, unknown>;
    const id = text(item.id);
    const customerId = text(item.customerId);
    if (!id || !customerIds.has(customerId)) continue;
    const lines = linesByInvoice.get(id) ?? [];
    const totals = calculateInvoice(lines);
    invoices.push({
      id,
      user_id: userId,
      customer_id: customerId,
      issue_date: text(item.issueDate),
      due_date: text(item.dueDate),
      total_cents: totals.totalCents,
      status: validInvoiceStatus(item.status),
      invoice_footer: text(item.invoiceFooter, "Bedankt voor de fijne samenwerking.").slice(0, 240),
    });
    for (const line of lines) {
      invoiceLines.push({
        id: line.id,
        invoice_id: id,
        description: line.description,
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents,
        vat_rate: line.vatRate,
      });
    }
  }
  await supabaseInsertMany("invoices", invoices);
  await supabaseInsertMany("invoice_lines", invoiceLines);

  await supabaseInsertMany("expenses", (backup.expenses ?? []).map((expense) => {
    const item = expense as Record<string, unknown>;
    const expenseId = text(item.id, `expense-${crypto.randomUUID()}`);
    const receipt = restoredReceipts.get(expenseId);
    return {
      id: expenseId,
      user_id: userId,
      supplier: text(item.supplier, "Leverancier"),
      description: text(item.description, "Kostenpost"),
      category: text(item.category, "Overig"),
      expense_date: text(item.expenseDate),
      amount_incl_cents: number(item.amountInclCents),
      vat_rate: validVatRate(item.vatRate),
      depreciation_years: validDepreciationYears(item.depreciationYears),
      receipt_name: receipt?.name ?? (text(item.receiptName) || null),
      receipt_storage_name: receipt?.storageName ?? null,
      receipt_mime_type: receipt?.mimeType ?? (text(item.receiptMimeType) || null),
    };
  }));

  await supabaseInsertMany("customer_notes", (backup.crm?.notes ?? []).flatMap((note) => {
    const item = note as Record<string, unknown>;
    const customerId = text(item.customerId);
    if (!customerIds.has(customerId)) return [];
    return [{
      id: text(item.id, crypto.randomUUID()),
      user_id: userId,
      customer_id: customerId,
      body: text(item.body),
      created_at: text(item.createdAt) || new Date().toISOString(),
    }];
  }));

  await supabaseInsertMany("customer_tasks", (backup.crm?.tasks ?? []).flatMap((task) => {
    const item = task as Record<string, unknown>;
    const customerId = text(item.customerId);
    if (!customerIds.has(customerId)) return [];
    return [{
      id: text(item.id, crypto.randomUUID()),
      user_id: userId,
      customer_id: customerId,
      title: text(item.title, "Opvolgactie"),
      due_date: text(item.dueDate),
      completed: boolValue(item.completed),
      created_at: text(item.createdAt) || new Date().toISOString(),
    }];
  }));
}

export async function restoreAdministrationBackup(userId: string, backup: BackupPayload) {
  const product = backup?.exportInfo?.product;
  const supportedProducts = product === "Rekenrust" || product === "Helder";
  if (!supportedProducts || backup.exportInfo.version !== 1) {
    throw new Error("Dit lijkt geen geldige Rekenrust-back-up te zijn.");
  }
  if (usesSupabaseStorage()) await restoreSupabaseAdministrationBackup(userId, backup);
  else await restoreLocalAdministrationBackup(userId, backup);
}
