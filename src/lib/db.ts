import "server-only";

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { hashPassword } from "./password";
import { getDataDirectory, getDatabasePath, shouldSeedDemoData } from "./storage";

type DatabaseInstance = InstanceType<typeof Database>;

const globalForDb = globalThis as unknown as { helderDb?: DatabaseInstance };

function createDatabase() {
  const dataDirectory = getDataDirectory();
  mkdirSync(dataDirectory, { recursive: true });
  const database = new Database(getDatabasePath());
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      company_name TEXT NOT NULL,
      company_type TEXT NOT NULL DEFAULT 'sole_proprietor',
      street TEXT NOT NULL DEFAULT '',
      postal_code TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      kvk_number TEXT NOT NULL DEFAULT '',
      vat_number TEXT NOT NULL DEFAULT '',
      iban TEXT NOT NULL DEFAULT '',
      invoice_payment_term INTEGER NOT NULL DEFAULT 14,
      default_vat_rate INTEGER NOT NULL DEFAULT 21,
      invoice_footer TEXT NOT NULL DEFAULT 'Bedankt voor de fijne samenwerking.',
      invoice_logo TEXT NOT NULL DEFAULT '',
      plan_type TEXT NOT NULL DEFAULT 'basis',
      subscription_status TEXT NOT NULL DEFAULT 'trialing',
      trial_started_at TEXT,
      trial_ends_at TEXT,
      mollie_customer_id TEXT,
      mollie_last_payment_id TEXT,
      mollie_subscription_id TEXT,
      subscription_activated_at TEXT,
      email_verified_at TEXT,
      email_verification_token_hash TEXT,
      email_verification_expires_at INTEGER,
      password_reset_token_hash TEXT,
      password_reset_expires_at INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      email TEXT NOT NULL,
      street TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      city TEXT NOT NULL,
      revenue_cents INTEGER NOT NULL DEFAULT 0,
      initials TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'mint',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Betaald', 'Openstaand', 'Concept', 'Te laat')),
      invoice_footer TEXT NOT NULL DEFAULT 'Bedankt voor de fijne samenwerking.',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      vat_rate INTEGER NOT NULL CHECK (vat_rate IN (0, 9, 21))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      supplier TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      expense_date TEXT NOT NULL,
      amount_incl_cents INTEGER NOT NULL,
      vat_rate INTEGER NOT NULL CHECK (vat_rate IN (0, 9, 21)),
      depreciation_years INTEGER NOT NULL DEFAULT 1,
      receipt_name TEXT,
      receipt_storage_name TEXT,
      receipt_mime_type TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS customers_user_id ON customers(user_id);
    CREATE INDEX IF NOT EXISTS invoices_user_id ON invoices(user_id);
    CREATE INDEX IF NOT EXISTS expenses_user_id ON expenses(user_id);
    CREATE INDEX IF NOT EXISTS customer_notes_customer_id ON customer_notes(customer_id);
    CREATE INDEX IF NOT EXISTS customer_tasks_customer_id ON customer_tasks(customer_id);
  `);

  ensureUserColumns(database);
  ensureExpenseColumns(database);
  ensureInvoiceColumns(database);
  if (shouldSeedDemoData()) seedDemoData(database);
  return database;
}

function ensureExpenseColumns(database: DatabaseInstance) {
  const existing = new Set((database.prepare("PRAGMA table_info(expenses)").all() as Array<{ name: string }>).map((column) => column.name));
  const columns: Record<string, string> = {
    depreciation_years: "INTEGER NOT NULL DEFAULT 1",
    receipt_name: "TEXT",
    receipt_storage_name: "TEXT",
    receipt_mime_type: "TEXT",
  };
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) {
      try {
        database.exec(`ALTER TABLE expenses ADD COLUMN ${name} ${definition}`);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("duplicate column name")) throw error;
      }
    }
  }
}

function ensureUserColumns(database: DatabaseInstance) {
  const existing = new Set((database.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((column) => column.name));
  const columns: Record<string, string> = {
    street: "TEXT NOT NULL DEFAULT ''",
    company_type: "TEXT NOT NULL DEFAULT 'sole_proprietor'",
    postal_code: "TEXT NOT NULL DEFAULT ''",
    city: "TEXT NOT NULL DEFAULT ''",
    kvk_number: "TEXT NOT NULL DEFAULT ''",
    vat_number: "TEXT NOT NULL DEFAULT ''",
    iban: "TEXT NOT NULL DEFAULT ''",
    invoice_payment_term: "INTEGER NOT NULL DEFAULT 14",
    default_vat_rate: "INTEGER NOT NULL DEFAULT 21",
    invoice_footer: "TEXT NOT NULL DEFAULT 'Bedankt voor de fijne samenwerking.'",
    invoice_logo: "TEXT NOT NULL DEFAULT ''",
    plan_type: "TEXT NOT NULL DEFAULT 'basis'",
    subscription_status: "TEXT NOT NULL DEFAULT 'trialing'",
    trial_started_at: "TEXT",
    trial_ends_at: "TEXT",
    mollie_customer_id: "TEXT",
    mollie_last_payment_id: "TEXT",
    mollie_subscription_id: "TEXT",
    subscription_activated_at: "TEXT",
    email_verified_at: "TEXT",
    email_verification_token_hash: "TEXT",
    email_verification_expires_at: "INTEGER",
    password_reset_token_hash: "TEXT",
    password_reset_expires_at: "INTEGER",
  };
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) {
      try {
        database.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("duplicate column name")) throw error;
      }
    }
  }
}

function ensureInvoiceColumns(database: DatabaseInstance) {
  const existing = new Set((database.prepare("PRAGMA table_info(invoices)").all() as Array<{ name: string }>).map((column) => column.name));
  const columns: Record<string, string> = {
    invoice_footer: "TEXT NOT NULL DEFAULT 'Bedankt voor de fijne samenwerking.'",
  };
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) {
      try {
        database.exec(`ALTER TABLE invoices ADD COLUMN ${name} ${definition}`);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("duplicate column name")) throw error;
      }
    }
  }
}

function seedDemoData(database: DatabaseInstance) {
  const seed = database.transaction(() => {
    database.prepare("INSERT OR IGNORE INTO users (id, name, email, password_hash, company_name) VALUES (?, ?, ?, ?, ?)")
      .run("user-demo", "Ralf", "demo@rekenrust.nl", hashPassword("Welkom123!"), "Ralf Bureau");
    database.prepare(`UPDATE users SET
      street = CASE WHEN street = '' THEN 'Keizersgracht 123' ELSE street END,
      postal_code = CASE WHEN postal_code = '' THEN '1015 CJ' ELSE postal_code END,
      city = CASE WHEN city = '' THEN 'Amsterdam' ELSE city END,
      kvk_number = CASE WHEN kvk_number = '' THEN '12345678' ELSE kvk_number END,
      vat_number = CASE WHEN vat_number = '' THEN 'NL001234567B01' ELSE vat_number END,
      iban = CASE WHEN iban = '' THEN 'NL91 ABNA 0417 1643 00' ELSE iban END
      WHERE id = 'user-demo'`).run();

    const customerRows = [
      ["customer-studio-noord", "Studio Noord", "Sophie de Wit", "sophie@studionoord.nl", "Weteringschans 81", "1017 RX", "Amsterdam", 642000, "SN", "mint"],
      ["customer-korenaar", "Bakkerij De Korenaar", "Daan Bakker", "daan@dekorenaar.nl", "Dorpsstraat 14", "1861 KW", "Bergen", 378450, "BK", "sand"],
      ["customer-maan", "Maan Architecten", "Eva Maan", "eva@maanarchitecten.nl", "Veemarktstraat 32", "4811 ZG", "Breda", 296800, "MA", "lilac"],
      ["customer-van-loon", "Van Loon Coaching", "Mila van Loon", "mila@vanlooncoaching.nl", "Stationsweg 9", "3511 ED", "Utrecht", 184900, "VL", "blue"],
    ];
    const insertCustomer = database.prepare(`INSERT OR IGNORE INTO customers
      (id, user_id, name, contact, email, street, postal_code, city, revenue_cents, initials, color)
      VALUES (?, 'user-demo', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const customer of customerRows) insertCustomer.run(...customer);

    const invoiceRows = [
      ["2026-0042", "customer-studio-noord", "2026-06-18", "2026-07-02", 242000, "Openstaand"],
      ["2026-0041", "customer-korenaar", "2026-06-12", "2026-06-26", 84700, "Betaald"],
      ["2026-0040", "customer-maan", "2026-06-03", "2026-06-17", 151250, "Te laat"],
      ["2026-0039", "customer-van-loon", "2026-05-28", "2026-06-11", 59895, "Betaald"],
    ];
    const insertInvoice = database.prepare(`INSERT OR IGNORE INTO invoices
      (id, user_id, customer_id, issue_date, due_date, total_cents, status)
      VALUES (?, 'user-demo', ?, ?, ?, ?, ?)`);
    for (const invoice of invoiceRows) insertInvoice.run(...invoice);

    const lineRows = [
      ["seed-line-0042", "2026-0042", "Strategisch advies", 1, 200000, 21],
      ["seed-line-0041", "2026-0041", "Fotografie", 1, 70000, 21],
      ["seed-line-0040", "2026-0040", "Projectbegeleiding", 1, 125000, 21],
      ["seed-line-0039", "2026-0039", "Coachingsprogramma", 1, 49500, 21],
    ];
    const insertLine = database.prepare(`INSERT OR IGNORE INTO invoice_lines
      (id, invoice_id, description, quantity, unit_price_cents, vat_rate) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const line of lineRows) insertLine.run(...line);

    const expenseRows = [
      ["expense-adobe", "Adobe", "Creative Cloud", "Software", "2026-06-19", 7349, 21],
      ["expense-ns", "NS Zakelijk", "Treinreizen", "Reiskosten", "2026-06-15", 18260, 9],
      ["expense-kantoor", "Kantoorwinkel", "Papier en inkt", "Kantoor", "2026-06-08", 12100, 21],
      ["expense-laptop", "Tech Store", "Laptop", "Apparatuur", "2026-05-26", 90711, 21],
    ];
    const insertExpense = database.prepare(`INSERT OR IGNORE INTO expenses
      (id, user_id, supplier, description, category, expense_date, amount_incl_cents, vat_rate)
      VALUES (?, 'user-demo', ?, ?, ?, ?, ?, ?)`);
    for (const expense of expenseRows) insertExpense.run(...expense);
    database.prepare("UPDATE expenses SET depreciation_years = 5 WHERE id = 'expense-laptop' AND depreciation_years = 1").run();

    database.prepare(`INSERT OR IGNORE INTO customer_notes (id, user_id, customer_id, body, created_at)
      VALUES ('note-studio-intro', 'user-demo', 'customer-studio-noord',
      'Sophie wil in september opnieuw kijken naar ondersteuning voor de najaarscampagne.', '2026-06-18 09:30:00')`).run();
    database.prepare(`INSERT OR IGNORE INTO customer_tasks (id, user_id, customer_id, title, due_date, completed)
      VALUES ('task-studio-followup', 'user-demo', 'customer-studio-noord',
      'Voorstel voor najaarscampagne voorbereiden', '2026-07-03', 0)`).run();
    database.prepare(`INSERT OR IGNORE INTO customer_tasks (id, user_id, customer_id, title, due_date, completed)
      VALUES ('task-studio-call', 'user-demo', 'customer-studio-noord',
      'Sophie bellen over planning', '2026-06-24', 0)`).run();
  });
  seed();
}

export const db = globalForDb.helderDb ?? createDatabase();
if (process.env.NODE_ENV !== "production") globalForDb.helderDb = db;
