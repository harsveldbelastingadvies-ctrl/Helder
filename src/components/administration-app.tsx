"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calculateInvoice, euro, parseEuro, type InvoiceLine } from "@/lib/invoice";
import { calculateExpense, type VatRate } from "@/lib/expense";
import { summarizeInvoiceAging } from "@/lib/invoice-aging";
import { HELDER_PLANS, TRIAL_DAYS, getPlan, isBillingBlocked, trialDaysLeft, type PlanId, type SubscriptionStatus } from "@/lib/plans";

type View = "dashboard" | "invoices" | "customers" | "expenses" | "profit" | "yearEnd" | "vat" | "help" | "settings";
type InvoiceStatus = "Betaald" | "Openstaand" | "Concept" | "Te laat";
type Invoice = { id: string; customer: string; issueDate: string; dueDate: string; date: string; due: string; totalCents: number; status: InvoiceStatus };
type InvoiceDetailData = { id: string; issueDate: string; dueDate: string; totalCents: number; status: InvoiceStatus; customer: { id: string; name: string; contact: string; email: string; street: string; postalCode: string; city: string }; company: { name: string; owner: string; email: string; street: string; postalCode: string; city: string; kvkNumber: string; vatNumber: string; iban: string; invoiceFooter: string; invoiceLogo: string }; lines: InvoiceLine[] };
type Customer = { id: string; name: string; contact: string; email: string; street: string; postalCode: string; city: string; revenueCents: number; initials: string; color: string };
type User = { id: string; name: string; email: string; companyName: string; emailVerified: boolean; planType: PlanId; subscriptionStatus: SubscriptionStatus; trialEndsAt: string | null };
type InvoiceDraft = { customerId: string; issueDate: string; dueDate: string; lines: InvoiceLine[]; invoiceFooter: string };
type CustomerInput = Pick<Customer, "name" | "contact" | "email" | "street" | "postalCode" | "city">;
type Expense = { id: string; supplier: string; description: string; category: string; expenseDate: string; date: string; amountInclCents: number; amountExclCents: number; vatCents: number; vatRate: VatRate; depreciationYears: number; receiptName: string | null };
type ExpenseInput = Pick<Expense, "supplier" | "description" | "category" | "expenseDate" | "amountInclCents" | "vatRate" | "depreciationYears"> & { receipt?: { name: string; mimeType: string; data: string }; removeReceipt?: boolean };
type VatSummary = { period: string; receivedVatCents: number; paidVatCents: number; payableVatCents: number; expenseTotalCents: number; expenseExclTotalCents: number; expenseCount: number };
type ProfitLossSummary = { year: number; revenueCents: number; regularExpensesCents: number; depreciationCents: number; profitCents: number; investmentPurchasesCents: number; depreciationRows: Array<{ id: string; supplier: string; description: string; purchaseYear: number; depreciationYears: number; purchaseAmountExclCents: number; yearlyDepreciationCents: number; currentYearDepreciationCents: number; remainingYears: number }> };
type CompanyType = "sole_proprietor" | "bv_dga" | "other";
type CompanySettings = { companyName: string; companyType: CompanyType; owner: string; email: string; street: string; postalCode: string; city: string; kvkNumber: string; vatNumber: string; iban: string; invoicePaymentTerm: number; defaultVatRate: VatRate; invoiceFooter: string; invoiceLogo: string };
type CrmNote = { id: string; body: string; createdAt: string };
type CrmTask = { id: string; title: string; dueDate: string; completed: boolean; createdAt: string };
type DashboardTask = { id: string; title: string; dueDate: string; customerId: string; customerName: string };
type RevenueMonth = { key: string; label: string; valueCents: number };
type StorageHealth = { ok: boolean; storage: "local" | "supabase"; database: string; fileStorage: string; bucket: string | null; configured: boolean; message: string; checkedAt: string };
type LiveReadiness = { ok: boolean; score: number; storageMode: "local" | "supabase"; checkedAt: string; message: string; nextAction: string; items: Array<{ key: string; label: string; ok: boolean; detail: string; action: string }> };
type BackupInspection = { ok: boolean; checkedAt: string; storage: "local" | "supabase"; counts: { customers: number; invoices: number; invoiceLines: number; expenses: number; receiptFiles: number; notes: number; tasks: number; receiptsListed: number }; warnings: string[]; message: string };
type BillingStatusOverview = { planType: PlanId; planName: string; priceLabel: string; subscriptionStatus: string; trialStartedAt: string | null; trialEndsAt: string | null; subscriptionActivatedAt: string | null; mollieCustomerId: string | null; mollieLastPaymentId: string | null; mollieSubscriptionId: string | null; mollieConfigured: boolean; checkedAt: string };
type ChecklistItem = { title: string; description: string; done: boolean; actionLabel: string; action: () => void };
type NextAction = { label: string; title: string; description: string; buttonLabel: string; action: () => void; tone?: "warning" | "success" };
type SearchResult = { id: string; kind: "invoice" | "customer" | "expense"; label: string; title: string; subtitle: string; meta: string; icon: string };

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Overzicht", icon: "grid" },
  { id: "invoices", label: "Facturen", icon: "file" },
  { id: "expenses", label: "Kosten", icon: "receipt" },
  { id: "profit", label: "Winst & verlies", icon: "trend" },
  { id: "yearEnd", label: "Jaarcheck", icon: "check" },
  { id: "customers", label: "Klanten", icon: "users" },
  { id: "vat", label: "Btw-opgaaf", icon: "percent" },
  { id: "help", label: "Hulp", icon: "help" },
  { id: "settings", label: "Instellingen", icon: "settings" },
];

function customerContactLabel(customer: Pick<Customer, "contact">) {
  return customer.contact.trim() || "Particuliere klant";
}

function companyTypeLabel(type?: CompanyType) {
  if (type === "bv_dga") return "B.V. / DGA";
  if (type === "other") return "Anders";
  return "Eenmanszaak / zzp";
}

function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return value === "trialing" || value === "active" || value === "past_due" || value === "canceled";
}

function mergeUserBilling(currentUser: User, billing: BillingStatusOverview): User {
  return {
    ...currentUser,
    planType: billing.planType,
    subscriptionStatus: isSubscriptionStatus(billing.subscriptionStatus) ? billing.subscriptionStatus : currentUser.subscriptionStatus,
    trialEndsAt: billing.trialEndsAt,
  };
}

function isDgaCompany(settings: CompanySettings | null) {
  return settings?.companyType === "bv_dga";
}

function InvoiceBrand({ logo, variant = "paper" }: { logo?: string; variant?: "paper" | "preview" }) {
  if (logo) {
    return <div className={`${variant === "preview" ? "preview-brand" : "brand"} invoice-brand-logo`}><img src={logo} alt="Bedrijfslogo" /></div>;
  }
  return variant === "preview"
    ? <div className="preview-brand"><span className="brand-mark">r</span><strong>rekenrust</strong></div>
    : <div className="brand"><span className="brand-mark">r</span><span>rekenrust</span></div>;
}

const DEFAULT_FOLLOW_UP_DATE = (() => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
})();

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    receipt: <><path d="M6 3h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6M16 5.5a3 3 0 0 1 0 5.8M17 14c2.2.7 3.3 2.7 3.5 5"/></>,
    percent: <><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M19 5 5 19"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <><path d="m9 18 6-6-6-6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    trend: <><path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.8 2.8 0 0 1 5.2 1.4c0 2-2.7 2.3-2.7 4.4M12 18h.01"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}><span />{status}</span>;
}

function invoiceCountLabel(count: number) {
  return count === 1 ? "1 factuur" : `${count} facturen`;
}

async function readJsonResponse<T>(response: Response, fallbackError: string) {
  const text = await response.text();
  if (!text.trim()) {
    return { data: {} as T, parseError: response.ok ? "" : fallbackError };
  }
  try {
    return { data: JSON.parse(text) as T, parseError: "" };
  } catch {
    return { data: {} as T, parseError: fallbackError };
  }
}

export function AdministrationApp() {
  const [view, setView] = useState<View>("dashboard");
  const [user, setUser] = useState<User | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vat, setVat] = useState<VatSummary>({ period: "Q2 2026", receivedVatCents: 0, paidVatCents: 0, payableVatCents: 0, expenseTotalCents: 0, expenseExclTotalCents: 0, expenseCount: 0 });
  const [profitLoss, setProfitLoss] = useState<ProfitLossSummary | null>(null);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceDetailData | null>(null);
  const [customerEditor, setCustomerEditor] = useState<Customer | "new" | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [expenseEditor, setExpenseEditor] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [invoiceDefaults, setInvoiceDefaults] = useState<{ paymentTerm: number; vatRate: VatRate; footer: string; logo: string }>({ paymentTerm: 14, vatRate: 21, footer: "Bedankt voor de fijne samenwerking.", logo: "" });

  const globalResults = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (query.length < 2) return [];
    const matches = (parts: Array<string | number | null | undefined>) => parts.join(" ").toLowerCase().includes(query);
    const results: SearchResult[] = [];

    invoices.forEach((invoice) => {
      if (matches([invoice.id, invoice.customer, invoice.status, invoice.date, invoice.due, euro(invoice.totalCents)])) {
        results.push({ id: invoice.id, kind: "invoice", label: "Factuur", title: `${invoice.id} · ${invoice.customer}`, subtitle: `${invoice.status} · ${invoice.date}`, meta: euro(invoice.totalCents), icon: "file" });
      }
    });
    customers.forEach((customer) => {
      if (matches([customer.name, customer.contact, customer.email, customer.city, customer.street])) {
        results.push({ id: customer.id, kind: "customer", label: "Klant", title: customer.name, subtitle: `${customerContactLabel(customer)} · ${customer.email}`, meta: customer.city, icon: "users" });
      }
    });
    expenses.forEach((expense) => {
      if (matches([expense.supplier, expense.description, expense.category, expense.date, euro(expense.amountInclCents), expense.receiptName])) {
        results.push({ id: expense.id, kind: "expense", label: "Kosten", title: expense.supplier, subtitle: `${expense.description} · ${expense.category}`, meta: euro(expense.amountInclCents), icon: "receipt" });
      }
    });

    return results.slice(0, 8);
  }, [customers, expenses, globalSearch, invoices]);

  // De eerste laadactie hoort alleen bij het openen van de app.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void initialize(); }, []);

  useEffect(() => {
    function updateBillingUser(event: Event) {
      const billing = (event as CustomEvent<BillingStatusOverview>).detail;
      if (!billing) return;
      setUser((currentUser) => currentUser ? mergeUserBilling(currentUser, billing) : currentUser);
    }

    window.addEventListener("helder-billing-updated", updateBillingUser);
    return () => window.removeEventListener("helder-billing-updated", updateBillingUser);
  }, []);

  async function initialize() {
    try {
      const session = await fetch("/api/auth/session");
      if (!session.ok) return;
      const { user: sessionUser } = await session.json() as { user: User };
      let activeUser = sessionUser;
      if (new URLSearchParams(window.location.search).get("betaling") === "terug") {
        let paymentMessage = "Betaling ontvangen. Rekenrust controleert je pakketstatus nog.";
        try {
          for (let attempt = 0; attempt < 4; attempt += 1) {
            const billingResponse = await fetch("/api/billing/status", { method: "POST" });
            const billingData = await billingResponse.json() as { billing?: BillingStatusOverview; message?: string; error?: string };
            if (billingResponse.ok && billingData.billing) {
              activeUser = mergeUserBilling(activeUser, billingData.billing);
              paymentMessage = billingData.message ?? "Betaling gecontroleerd. Je pakketstatus is bijgewerkt.";
              if (billingData.billing.subscriptionStatus === "active") break;
            } else {
              paymentMessage = billingData.error ?? paymentMessage;
            }
            if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 1200));
          }
          showToast(paymentMessage);
        } catch {
          showToast("Betaling ontvangen. Rekenrust controleert je pakketstatus nog.");
        } finally {
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
      const welcomeKey = `helder-welcome-${activeUser.id}`;
      setUser(activeUser);
      if (!window.sessionStorage.getItem(welcomeKey)) setWelcomeOpen(true);
      await loadAdministration();
    } finally {
      setLoading(false);
    }
  }

  async function loadAdministration() {
    async function loadPart<T>(path: string, fallback: T) {
      try {
        const response = await fetch(path);
        if (!response.ok) return fallback;
        return await response.json() as T;
      } catch {
        return fallback;
      }
    }

    const [invoiceData, customerData, expenseData, vatData, profitLossData, taskData, settingsData] = await Promise.all([
      loadPart<{ invoices: Invoice[] }>("/api/invoices", { invoices: [] }),
      loadPart<{ customers: Customer[] }>("/api/customers", { customers: [] }),
      loadPart<{ expenses: Expense[] }>("/api/expenses", { expenses: [] }),
      loadPart<{ vat: VatSummary }>("/api/vat", { vat: { period: "Q2 2026", receivedVatCents: 0, paidVatCents: 0, payableVatCents: 0, expenseTotalCents: 0, expenseExclTotalCents: 0, expenseCount: 0 } }),
      loadPart<{ profitLoss: ProfitLossSummary | null }>("/api/profit-loss", { profitLoss: null }),
      loadPart<{ tasks: DashboardTask[] }>("/api/crm/tasks", { tasks: [] }),
      loadPart<{ settings: CompanySettings | null }>("/api/settings", { settings: null }),
    ]);

    setInvoices(invoiceData.invoices);
    setCustomers(customerData.customers);
    setExpenses(expenseData.expenses);
    setVat(vatData.vat);
    setProfitLoss(profitLossData.profitLoss);
    setTasks(taskData.tasks);
    if (settingsData.settings) {
      setCompanySettings(settingsData.settings);
      setInvoiceDefaults({ paymentTerm: settingsData.settings.invoicePaymentTerm, vatRate: settingsData.settings.defaultVatRate, footer: settingsData.settings.invoiceFooter, logo: settingsData.settings.invoiceLogo });
    }
  }

  async function handleLogin(email: string, password: string) {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Inloggen is niet gelukt.");
    setLoading(true);
    await initialize();
  }

  async function finishAuthentication() {
    setLoading(true);
    await initialize();
  }

  async function handleLogout() {
    if (user?.email) window.localStorage.setItem("helder-last-email", user.email);
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setInvoices([]);
    setCustomers([]);
    setExpenses([]);
    setProfitLoss(null);
    setTasks([]);
    setCompanySettings(null);
    setWelcomeOpen(false);
    setView("dashboard");
  }

  function openView(nextView: View) {
    setView(nextView);
    setCreating(false);
    setSelectedInvoiceId(null);
    setEditingInvoice(null);
    setSelectedCustomerId(null);
    setCustomerEditor(null);
    setExpenseEditor(false);
    setEditingExpense(null);
    setMobileNav(false);
  }

  function startInvoice() {
    if (!companySettingsReady(companySettings)) {
      showToast("Vul eerst je bedrijfsgegevens in. Daarna kun je een nette factuur maken.");
      openView("settings");
      return;
    }
    if (customers.length === 0) {
      showToast("Voeg eerst een klant toe. Daarna kun je direct een factuur maken.");
      startCustomer();
      return;
    }
    openView("invoices");
    setCreating(true);
  }

  function startCustomer() {
    openView("customers");
    setCustomerEditor("new");
  }

  function startExpense() {
    openView("expenses");
    setExpenseEditor(true);
  }

  function openSearchResult(result: SearchResult) {
    setGlobalSearch("");
    if (result.kind === "invoice") {
      openView("invoices");
      setSelectedInvoiceId(result.id);
      return;
    }
    if (result.kind === "customer") {
      openView("customers");
      setSelectedCustomerId(result.id);
      return;
    }
    const expense = expenses.find((item) => item.id === result.id);
    if (expense) {
      openView("expenses");
      setEditingExpense(expense);
    }
  }

  async function saveInvoice(draft: InvoiceDraft) {
    const response = await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const { data, parseError } = await readJsonResponse<{ invoice?: Invoice; error?: string }>(response, "De factuur kon niet worden opgeslagen. Probeer het opnieuw of controleer Supabase.");
    if (!response.ok || !data.invoice) throw new Error(data.error ?? (parseError || "De factuur kon niet worden opgeslagen."));
    setInvoices((current) => [data.invoice!, ...current]);
    setCreating(false);
    setView("invoices");
    showToast("Factuur veilig opgeslagen als concept");
  }

  async function saveEditedInvoice(invoiceId: string, draft: InvoiceDraft) {
    const response = await fetch(`/api/invoices/${invoiceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const { data, parseError } = await readJsonResponse<{ invoice?: InvoiceDetailData; error?: string }>(response, "De factuur kon niet worden bijgewerkt. Probeer het opnieuw of controleer Supabase.");
    if (!response.ok || !data.invoice) throw new Error(data.error ?? (parseError || "De factuur kon niet worden bijgewerkt."));
    await loadAdministration();
    setEditingInvoice(null);
    setSelectedInvoiceId(invoiceId);
    showToast("Conceptfactuur bijgewerkt");
  }

  async function saveCustomer(input: CustomerInput) {
    const editing = customerEditor !== "new" && customerEditor !== null;
    const response = await fetch(editing ? `/api/customers/${customerEditor.id}` : "/api/customers", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json() as { customer?: Customer; error?: string };
    if (!response.ok || !data.customer) throw new Error(data.error ?? "De klant kon niet worden opgeslagen.");
    setCustomers((current) => {
      const updated = editing ? current.map((customer) => customer.id === data.customer!.id ? data.customer! : customer) : [...current, data.customer!];
      return updated.sort((a, b) => a.name.localeCompare(b.name, "nl"));
    });
    setCustomerEditor(null);
    setView("customers");
    showToast(editing ? "Klantgegevens bijgewerkt" : "Nieuwe klant veilig opgeslagen");
  }

  async function saveExpense(input: ExpenseInput) {
    const response = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const data = await response.json() as { expense?: Expense; error?: string };
    if (!response.ok || !data.expense) throw new Error(data.error ?? "De kosten konden niet worden opgeslagen.");
    setExpenses((current) => [data.expense!, ...current]);
    await refreshVat();
    await refreshProfitLoss();
    setExpenseEditor(false);
    setView("expenses");
    showToast("Zakelijke kosten veilig opgeslagen");
  }

  async function saveEditedExpense(expenseId: string, input: ExpenseInput) {
    const response = await fetch(`/api/expenses/${expenseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const data = await response.json() as { expense?: Expense; error?: string };
    if (!response.ok || !data.expense) throw new Error(data.error ?? "De kosten konden niet worden bijgewerkt.");
    setExpenses((current) => current.map((expense) => expense.id === expenseId ? data.expense! : expense));
    await refreshVat();
    await refreshProfitLoss();
    setEditingExpense(null);
    setView("expenses");
    showToast("Kostenpost bijgewerkt");
  }

  async function deleteExpense(expenseId: string) {
    const response = await fetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "De kostenpost kon niet worden verwijderd.");
    setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
    await refreshVat();
    await refreshProfitLoss();
    showToast("Kostenpost verwijderd");
  }

  async function refreshVat() {
    const response = await fetch("/api/vat");
    if (response.ok) setVat(((await response.json()) as { vat: VatSummary }).vat);
  }

  async function refreshProfitLoss() {
    const response = await fetch("/api/profit-loss");
    if (response.ok) setProfitLoss(((await response.json()) as { profitLoss: ProfitLossSummary }).profitLoss);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function closeWelcome() {
    if (user) window.sessionStorage.setItem(`helder-welcome-${user.id}`, "seen");
    setWelcomeOpen(false);
  }

  async function completeTask(taskId: string) {
    const response = await fetch("/api/crm/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId }) });
    const data = await response.json() as { tasks?: DashboardTask[]; error?: string };
    if (!response.ok || !data.tasks) throw new Error(data.error ?? "De actie kon niet worden afgerond.");
    setTasks(data.tasks);
    showToast("Actie afgerond");
  }

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleLogin} onRegistered={finishAuthentication} />;
  if (isBillingBlocked(user.subscriptionStatus, user.trialEndsAt)) return <BillingBlockedScreen user={user} onLogout={handleLogout} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand"><span className="brand-mark">r</span><span>rekenrust</span></div>
        <nav>
          <p className="nav-label">WERKPLEK</p>
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => openView(item.id)}>
              <Icon name={item.icon} />{item.label}{item.id === "invoices" && <span className="nav-count">{invoices.filter((invoice) => invoice.status !== "Betaald").length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="company-switcher" onClick={handleLogout} title="Uitloggen"><span className="avatar avatar-dark">{user.name.slice(0, 2).toUpperCase()}</span><span><strong>{user.companyName}</strong><small>Klik om uit te loggen</small></span><Icon name="more" /></button>
          <p>Administratie bijgewerkt</p><div className="sync-line"><span /><small>Zojuist opgeslagen</small></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)}>☰</button>
          <div className="search global-search"><Icon name="search" size={18} /><input aria-label="Zoeken" placeholder="Zoek klanten, facturen of kosten..." value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)}/>{globalSearch ? <button className="search-clear" aria-label="Zoeken leegmaken" onClick={() => setGlobalSearch("")}>×</button> : <kbd>⌘ K</kbd>}{globalSearch.trim().length >= 2 && <div className="search-results">{globalResults.length === 0 ? <p className="search-empty">Geen resultaat gevonden. Probeer een klantnaam, factuurnummer of leverancier.</p> : globalResults.map((result) => <button key={`${result.kind}-${result.id}`} onClick={() => openSearchResult(result)}><span className="search-result-icon"><Icon name={result.icon} size={16}/></span><span><strong>{result.title}</strong><small>{result.label} · {result.subtitle}</small></span><em>{result.meta}</em></button>)}</div>}</div>
          <div className="top-actions"><button className="icon-button" aria-label="Meldingen"><Icon name="bell" /></button><span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span></div>
        </header>

        {editingInvoice ? (
          <InvoiceEditor invoice={editingInvoice} customers={customers} defaults={invoiceDefaults} onCancel={() => { setEditingInvoice(null); setSelectedInvoiceId(editingInvoice.id); }} onSave={(draft) => saveEditedInvoice(editingInvoice.id, draft)} />
        ) : selectedInvoiceId ? (
          <InvoiceDetail invoiceId={selectedInvoiceId} onBack={() => setSelectedInvoiceId(null)} onEdit={(invoice) => { setSelectedInvoiceId(null); setEditingInvoice(invoice); }} onDeleted={() => { setInvoices((current) => current.filter((invoice) => invoice.id !== selectedInvoiceId)); setSelectedInvoiceId(null); showToast("Conceptfactuur verwijderd"); }} onStatusChange={(status) => { setInvoices((current) => current.map((invoice) => invoice.id === selectedInvoiceId ? { ...invoice, status } : invoice)); void refreshVat(); void refreshProfitLoss(); }} />
        ) : selectedCustomerId ? (
          <CustomerDetail customer={customers.find((item) => item.id === selectedCustomerId)!} onBack={() => setSelectedCustomerId(null)} onEdit={(customer) => { setSelectedCustomerId(null); setCustomerEditor(customer); }} />
        ) : creating ? (
          <InvoiceEditor customers={customers} defaults={invoiceDefaults} onCancel={() => setCreating(false)} onSave={saveInvoice} />
        ) : customerEditor ? (
          <CustomerEditor customer={customerEditor === "new" ? null : customerEditor} onCancel={() => setCustomerEditor(null)} onSave={saveCustomer} />
        ) : editingExpense ? (
          <ExpenseEditor expense={editingExpense} onCancel={() => setEditingExpense(null)} onSave={(input) => saveEditedExpense(editingExpense.id, input)} />
        ) : expenseEditor ? (
          <ExpenseEditor onCancel={() => setExpenseEditor(false)} onSave={saveExpense} />
        ) : (
          <div className="page-content">
            {view === "dashboard" && <Dashboard user={user} companySettings={companySettings} invoices={invoices} customers={customers} expenses={expenses} vat={vat} profitLoss={profitLoss} tasks={tasks} onCreate={startInvoice} onCreateCustomer={startCustomer} onCreateExpense={startExpense} onViewInvoices={() => openView("invoices")} onViewCustomers={() => openView("customers")} onViewExpenses={() => openView("expenses")} onViewProfit={() => openView("profit")} onViewVat={() => openView("vat")} onViewSettings={() => openView("settings")} onOpenCustomer={setSelectedCustomerId} onCompleteTask={completeTask} />}
            {view === "invoices" && <Invoices invoices={invoices} onCreate={startInvoice} onOpen={setSelectedInvoiceId} />}
            {view === "customers" && <Customers customers={customers} onCreate={() => setCustomerEditor("new")} onEdit={setCustomerEditor} onOpen={setSelectedCustomerId} />}
            {view === "expenses" && <Expenses expenses={expenses} vat={vat} onCreate={() => setExpenseEditor(true)} onEdit={setEditingExpense} onDelete={deleteExpense} />}
            {view === "profit" && <ProfitLoss />}
            {view === "yearEnd" && <YearEndChecklist invoices={invoices} expenses={expenses} vat={vat} profitLoss={profitLoss} onViewInvoices={() => openView("invoices")} onCreateExpense={startExpense} onViewExpenses={() => openView("expenses")} onViewProfit={() => openView("profit")} onViewVat={() => openView("vat")} onViewSettings={() => openView("settings")} />}
            {view === "vat" && <VatOverview vat={vat} profitLoss={profitLoss} onViewProfit={() => openView("profit")} />}
            {view === "help" && <HelpCenter onCreateInvoice={startInvoice} onCreateCustomer={startCustomer} onCreateExpense={startExpense} onViewInvoices={() => openView("invoices")} onViewCustomers={() => openView("customers")} onViewExpenses={() => openView("expenses")} onViewProfit={() => openView("profit")} onViewVat={() => openView("vat")} onViewYearEnd={() => openView("yearEnd")} onViewSettings={() => openView("settings")} />}
            {view === "settings" && <Settings onLoggedOut={() => { setUser(null); setInvoices([]); setCustomers([]); setExpenses([]); setProfitLoss(null); setTasks([]); setCompanySettings(null); setView("dashboard"); }} onSaved={(settings) => { setUser((current) => current ? { ...current, name: settings.owner, email: settings.email, companyName: settings.companyName } : current); setCompanySettings(settings); setInvoiceDefaults({ paymentTerm: settings.invoicePaymentTerm, vatRate: settings.defaultVatRate, footer: settings.invoiceFooter, logo: settings.invoiceLogo }); }} />}
          </div>
        )}
      </main>
      {welcomeOpen && <WelcomeModal user={user} onClose={closeWelcome} onSettings={() => { closeWelcome(); openView("settings"); }} onCustomer={() => { closeWelcome(); startCustomer(); }} onInvoice={() => { closeWelcome(); startInvoice(); }} />}
      {toast && <div className="toast"><Icon name="check" size={18}/>{toast}</div>}
    </div>
  );
}

function LoadingScreen() {
  return <main className="auth-shell"><div className="auth-brand"><span className="brand-mark">r</span><span>rekenrust</span></div><div className="loading-card"><span className="loading-spinner"/><p>Je administratie wordt klaargezet…</p></div></main>;
}

function WelcomeModal({ user, onClose, onSettings, onCustomer, onInvoice }: { user: User; onClose: () => void; onSettings: () => void; onCustomer: () => void; onInvoice: () => void }) {
  const firstName = user.name.trim().split(" ")[0] || user.name;
  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <section className="welcome-modal">
        <button className="welcome-close" aria-label="Welkomstbericht sluiten" onClick={onClose}><Icon name="close" size={18}/></button>
        <div className="welcome-mark"><span className="brand-mark">r</span></div>
        <p className="eyebrow">PERSOONLIJK WELKOM</p>
        <h1 id="welcome-title">Welkom bij Rekenrust, {firstName}.</h1>
        <p className="welcome-message">
          Wat fijn dat je er bent. Ik wens je veel succes met je onderneming. Gebruik Rekenrust om rust en overzicht te houden in je facturen, kosten, btw en klantcontact.
        </p>
        <p className="welcome-note">
          Loop je ergens tegenaan, heb je vragen of wil je gewoon even sparren over je administratie of je bedrijf? Dan denk ik graag met je mee.
        </p>
        <div className="welcome-signature">
          <span>Succes vandaag,</span>
          <strong>Ralf</strong>
        </div>
        <div className="welcome-quickstart">
          <button onClick={onSettings}><span>1</span><strong>Bedrijfsgegevens invullen</strong><small>Voor correcte facturen</small></button>
          <button onClick={onCustomer}><span>2</span><strong>Eerste klant toevoegen</strong><small>Daarna kun je factureren</small></button>
          <button onClick={onInvoice}><span>3</span><strong>Factuur maken</strong><small>Als je klant al klaarstaat</small></button>
        </div>
        <button className="primary-button welcome-action" onClick={onClose}>Ik kijk eerst rustig rond</button>
      </section>
    </div>
  );
}

function companySettingsReady(settings: CompanySettings | null) {
  if (!settings) return false;
  return [
    settings.companyName,
    settings.owner,
    settings.email,
    settings.street,
    settings.postalCode,
    settings.city,
    settings.kvkNumber,
    settings.vatNumber,
    settings.iban,
  ].every((value) => value.trim().length > 0);
}

function LoginScreen({ onLogin, onRegistered }: { onLogin: (email: string, password: string) => Promise<void>; onRegistered: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem("helder-last-email") ?? "");
  const [password, setPassword] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("basis");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [enteredRecoveryCode, setEnteredRecoveryCode] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "recover" && !recoveryRequested) {
        const response = await fetch("/api/auth/recovery/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
        const data = await response.json() as { recoveryCode?: string; message?: string; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Herstelcode maken is niet gelukt.");
        setRecoveryCode(data.recoveryCode ?? "");
        setRecoveryRequested(true);
        setRecoveryMessage(data.recoveryCode ? "Lokale herstelcode aangemaakt. In een online versie versturen we deze per e-mail." : data.message ?? "Herstelcode klaargezet.");
      } else if (mode === "recover") {
        const response = await fetch("/api/auth/recovery/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: enteredRecoveryCode, password }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Wachtwoord wijzigen is niet gelukt.");
        setMode("login");
        setPassword("");
        setRecoveryCode("");
        setRecoveryRequested(false);
        setEnteredRecoveryCode("");
        setRecoveryMessage("Wachtwoord gewijzigd. Je kunt nu inloggen.");
      } else if (mode === "register") {
        const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, companyName, email, password, planType: selectedPlan }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Account aanmaken is niet gelukt.");
        window.localStorage.setItem("helder-last-email", email.trim().toLowerCase());
        await onRegistered();
      } else {
        const loginEmail = email.trim().toLowerCase();
        await onLogin(loginEmail, password);
        window.localStorage.setItem("helder-last-email", loginEmail);
      }
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : mode === "register" ? "Account aanmaken is niet gelukt." : mode === "recover" ? "Wachtwoordherstel is niet gelukt." : "Inloggen is niet gelukt."); }
    finally { setSubmitting(false); }
  }

  const trustItems = [
    { title: "14 dagen rustig proberen", body: "Je kunt eerst zelf voelen of Rekenrust bij je manier van werken past." },
    { title: "Geen onverwacht gratis doorlopen", body: "Na de proefperiode wordt de administratie vergrendeld totdat het pakket actief is." },
    { title: "Betalen via Mollie", body: "De betaling loopt via Mollie; Rekenrust bewaart geen volledige betaalgegevens." },
  ];
  const faqItems = [
    { question: "Kan ik stoppen als het niet past?", answer: "Ja. Tijdens de proefperiode kun je gewoon stoppen. Na activatie kan wijzigen of stoppen veilig via contact." },
    { question: "Zijn mijn gegevens gekoppeld aan mijn account?", answer: "Ja. Klanten, facturen, kosten en instellingen blijven bij jouw account horen." },
    { question: "Krijg ik hulp als ik vastloop?", answer: "Ja. Rekenrust is bewust in gewone taal gebouwd en je kunt Ralf benaderen om mee te denken." },
  ];

  if (mode === "recover") {
    return <main className="auth-shell"><div className="auth-brand"><span className="brand-mark">r</span><span>rekenrust</span></div><section className="auth-card"><p className="eyebrow">WACHTWOORDHERSTEL</p><h1>Nieuw wachtwoord instellen.</h1><p className="auth-intro">Vul je e-mailadres in. Lokaal toont Rekenrust de code direct; online ontvang je de code per e-mail.</p><form onSubmit={submit}><label><span>E-mailadres</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{recoveryCode && <p className="local-code">Herstelcode: <strong>{recoveryCode}</strong></p>}{recoveryRequested && <label><span>Herstelcode</span><input required value={enteredRecoveryCode} onChange={(event) => setEnteredRecoveryCode(event.target.value)} /></label>}{recoveryRequested && <label><span>Nieuw wachtwoord</span><input required type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>}{error && <p className="auth-error">{error}</p>}{recoveryMessage && <p className="security-success">{recoveryMessage}</p>}<button className="primary-button auth-submit" disabled={submitting}>{submitting ? "Even verwerken…" : recoveryRequested ? "Wachtwoord wijzigen" : "Herstelcode maken"}</button></form><button className="auth-link-button" onClick={() => { setMode("login"); setError(""); setRecoveryRequested(false); }}>Terug naar inloggen</button></section><p className="auth-footnote">Je gegevens blijven tijdens het bouwen alleen op deze computer.</p></main>;
  }

  return <main className="auth-shell commercial-auth-shell"><section className="commercial-auth-grid"><div className="commercial-panel"><div className="auth-brand commercial-brand"><span className="brand-mark">r</span><span>rekenrust</span></div><p className="eyebrow">ADMINISTRATIE VOOR KLEINE ONDERNEMERS</p><h1>Rust in facturen, kosten, btw en klantcontact.</h1><p className="commercial-lead">Rekenrust helpt ondernemers hun administratie bijhouden zonder boekhoudtaal. Je maakt facturen, voert kosten inclusief btw in, ziet je btw-overzicht en houdt klanten netjes bij.</p><div className="commercial-actions"><button className="primary-button" type="button" onClick={() => { setMode("register"); setError(""); }}>Start met Rekenrust</button><button className="secondary-button" type="button" onClick={() => { setMode("login"); setError(""); }}>Ik heb al een account</button></div><div className="commercial-proof"><span><strong>Facturen</strong>PDF, logo en betaaltermijn</span><span><strong>Btw</strong>Te betalen of terug te krijgen</span><span><strong>CRM</strong>Notities en opvolgacties</span></div><div className="commercial-feature-grid"><article><Icon name="file" size={17}/><strong>Factureren zonder zoekwerk</strong><p>Klantgegevens, btw en vaste factuurtekst staan klaar zodra je een factuur maakt.</p></article><article><Icon name="receipt" size={17}/><strong>Kosten inclusief btw invoeren</strong><p>Ondernemers vullen het totaalbedrag in; Rekenrust rekent de btw en kosten uit.</p></article><article><Icon name="percent" size={17}/><strong>Btw-overzicht in gewone taal</strong><p>Eerst het bedrag, daarna pas de uitleg hoe dit bedrag is opgebouwd.</p></article><article><Icon name="users" size={17}/><strong>Klanten en opvolging bij elkaar</strong><p>CRM-notities en acties blijven gekoppeld aan de juiste klant.</p></article></div><div className="commercial-trust-strip">{trustItems.map((item) => <span key={item.title}><strong>{item.title}</strong><small>{item.body}</small></span>)}</div></div><aside className="commercial-auth-side"><section className="auth-card commercial-login-card"><p className="eyebrow">{mode === "login" ? "WELKOM TERUG" : "NIEUW ACCOUNT"}</p><h1>{mode === "login" ? "Log veilig in op je administratie." : "Start rustig met je eigen account."}</h1><p className="auth-intro">{mode === "login" ? "Gebruik hetzelfde e-mailadres als eerder. Dan staan je klanten, facturen en kosten weer klaar." : "Maak een account aan en bouw je administratie stap voor stap op."}</p><div className="auth-tabs"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setPassword(""); setError(""); }}>Inloggen</button><button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setEmail(""); setPassword(""); setError(""); }}>Account aanmaken</button></div><form onSubmit={submit}>{mode === "register" && <><label><span>Jouw naam</span><input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Bedrijfsnaam</span><input required autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label><div className="plan-choice"><span>Kies je pakket</span>{HELDER_PLANS.map((plan) => <button type="button" key={plan.id} className={selectedPlan === plan.id ? "plan-option selected" : "plan-option"} onClick={() => setSelectedPlan(plan.id)}><strong>{plan.name}<em>{plan.priceLabel}</em></strong><small>{plan.shortDescription}</small></button>)}<p>Je start met {TRIAL_DAYS} dagen proefperiode. Daarna is betaling nodig om Rekenrust te blijven gebruiken.</p></div></>}<label><span>E-mailadres</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Wachtwoord</span><input required type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{mode === "login" && <button className="auth-link-button" type="button" onClick={() => { setMode("recover"); setError(""); setRecoveryMessage(""); }}>Wachtwoord vergeten?</button>}{mode === "register" && <p className="password-help">Gebruik minimaal 8 tekens. Je kunt je e-mailadres later in Instellingen bevestigen.</p>}{error && <p className="auth-error">{error}</p>}{recoveryMessage && <p className="security-success">{recoveryMessage}</p>}<button className="primary-button auth-submit" disabled={submitting}>{submitting ? "Even controleren…" : mode === "register" ? `Start proefperiode · ${getPlan(selectedPlan).priceLabel}` : "Inloggen"}</button></form>{mode === "login" ? <div className="demo-hint"><Icon name="check" size={16}/><p><strong>Eigen account</strong>Je administratie blijft gekoppeld aan je eigen account.</p></div> : <div className="demo-hint"><Icon name="check" size={16}/><p><strong>Geen gratis doorgebruik</strong>Na de proefperiode vraagt Rekenrust om betaling voordat de administratie verder gebruikt kan worden.</p></div>}</section><section className="commercial-pricing-card"><p className="eyebrow">PAKKETTEN</p>{HELDER_PLANS.map((plan) => <div key={plan.id} className={plan.id === selectedPlan ? "highlight" : ""}><strong>{plan.name} · {plan.priceLabel}</strong><span>{plan.shortDescription}</span></div>)}</section><section className="commercial-faq-card"><p className="eyebrow">VEELGESTELDE VRAGEN</p>{faqItems.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section><p className="auth-footnote">Je gegevens blijven gekoppeld aan je eigen account. <Link href="/privacy">Lees de privacyuitleg</Link>.</p></aside></section></main>;
}

function BillingBlockedScreen({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const plan = getPlan(user.planType);
  return <main className="auth-shell billing-shell"><section className="billing-card"><div className="auth-brand"><span className="brand-mark">r</span><span>rekenrust</span></div><p className="eyebrow">PROEFPERIODE AFGELOPEN</p><h1>Activeer je pakket om Rekenrust verder te gebruiken.</h1><p>De proefperiode voor <strong>{user.companyName}</strong> is afgelopen. Om te voorkomen dat Rekenrust kosteloos doorloopt, is de administratie tijdelijk vergrendeld totdat het gekozen pakket actief is.</p><div className="billing-plan-summary"><span>Gekozen pakket</span><strong>{plan.name}</strong><em>{plan.priceLabel}</em></div><div className="billing-actions"><BillingCheckoutButton label="Pakket activeren via Mollie" /><button className="secondary-button" onClick={() => void onLogout()}>Uitloggen</button></div><small>Na betaling stuurt Mollie je terug naar Rekenrust. Het kan enkele seconden duren voordat Mollie de betaalstatus automatisch heeft doorgegeven.</small></section></main>;
}

function BillingCheckoutButton({ label = "Pakket activeren" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const text = await response.text();
      const data = text ? JSON.parse(text) as { checkoutUrl?: string; error?: string } : {} as { checkoutUrl?: string; error?: string };
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error ?? "Mollie-betaalpagina kon niet worden geopend.");
      window.location.href = data.checkoutUrl;
    } catch (caught) {
      setError(caught instanceof SyntaxError ? "Mollie-betaalpagina kon niet worden geopend. Controleer of Mollie in Vercel goed is ingesteld." : caught instanceof Error ? caught.message : "Mollie-betaalpagina kon niet worden geopend.");
      setLoading(false);
    }
  }

  return <span className="billing-button-wrap"><button className="primary-button" type="button" onClick={() => void startCheckout()} disabled={loading}>{loading ? "Mollie openen…" : label}</button>{error && <small className="billing-error">{error}</small>}</span>;
}

function Dashboard({ user, companySettings, invoices, customers, expenses, vat, profitLoss, tasks, onCreate, onCreateCustomer, onCreateExpense, onViewInvoices, onViewCustomers, onViewExpenses, onViewProfit, onViewVat, onViewSettings, onOpenCustomer, onCompleteTask }: { user: User; companySettings: CompanySettings | null; invoices: Invoice[]; customers: Customer[]; expenses: Expense[]; vat: VatSummary; profitLoss: ProfitLossSummary | null; tasks: DashboardTask[]; onCreate: () => void; onCreateCustomer: () => void; onCreateExpense: () => void; onViewInvoices: () => void; onViewCustomers: () => void; onViewExpenses: () => void; onViewProfit: () => void; onViewVat: () => void; onViewSettings: () => void; onOpenCustomer: (id: string) => void; onCompleteTask: (id: string) => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const headingDate = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const taskDate = (value: string) => value < today ? "Te laat" : value === today ? "Vandaag" : new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const countedInvoices = invoices.filter((invoice) => invoice.status !== "Concept");
  const revenueMonths = useMemo(() => buildRevenueMonths(countedInvoices), [countedInvoices]);
  const revenueThisMonth = countedInvoices.filter((invoice) => invoice.issueDate.startsWith(currentMonth)).reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const revenuePreviousMonth = countedInvoices.filter((invoice) => invoice.issueDate.startsWith(previousMonth)).reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const revenueDelta = revenuePreviousMonth > 0 ? `${Math.round((revenueThisMonth - revenuePreviousMonth) / revenuePreviousMonth * 100)}%` : revenueThisMonth > 0 ? "nieuw" : "0%";
  const openInvoices = invoices.filter((invoice) => invoice.status === "Openstaand" || invoice.status === "Te laat");
  const openTotal = openInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const overdueCount = openInvoices.filter((invoice) => invoice.status === "Te laat").length;
  const vatLabel = vat.payableVatCents >= 0 ? "te betalen" : "terug te krijgen";
  const hasVatActivity = vat.receivedVatCents > 0 || vat.paidVatCents > 0;
  const urgentTask = tasks.find((task) => task.dueDate <= today);
  const settingsReady = companySettingsReady(companySettings);
  const checklistItems: ChecklistItem[] = [
    { title: settingsReady ? "Bedrijfsgegevens staan goed" : "Vul je bedrijfsgegevens in", description: settingsReady ? "Naam, adres, KvK, btw-id en IBAN staan klaar voor je facturen." : "Deze gegevens horen op je facturen en voorkomen zoekwerk bij het versturen.", done: settingsReady, actionLabel: settingsReady ? "Controleer instellingen" : "Instellingen invullen", action: onViewSettings },
    { title: customers.length > 0 ? "Eerste klant staat erin" : "Voeg je eerste klant toe", description: customers.length > 0 ? `${customers.length} klant${customers.length === 1 ? "" : "en"} in je klantenlijst.` : "Een klant heb je nodig om een factuur te maken.", done: customers.length > 0, actionLabel: customers.length > 0 ? "Bekijk klanten" : "Klant toevoegen", action: customers.length > 0 ? onViewCustomers : onCreateCustomer },
    { title: countedInvoices.length > 0 ? "Eerste factuur telt mee" : "Maak je eerste factuur", description: countedInvoices.length > 0 ? `${countedInvoices.length} ${countedInvoices.length === 1 ? "verstuurde of betaalde factuur" : "verstuurde of betaalde facturen"}.` : "Concepten tellen nog niet mee voor omzet en btw.", done: countedInvoices.length > 0, actionLabel: countedInvoices.length > 0 ? "Bekijk facturen" : "Factuur maken", action: countedInvoices.length > 0 ? onViewInvoices : onCreate },
    { title: expenses.length > 0 ? "Kosten worden bijgehouden" : "Voer je eerste kostenpost in", description: expenses.length > 0 ? `${expenses.length} kostenpost${expenses.length === 1 ? "" : "en"} met btw-berekening.` : "Zo zie je meteen welke btw je mag terugvragen.", done: expenses.length > 0, actionLabel: expenses.length > 0 ? "Bekijk kosten" : "Kosten invoeren", action: expenses.length > 0 ? onViewExpenses : onCreateExpense },
    { title: hasVatActivity ? "Btw-overzicht is gevuld" : "Bekijk je btw-overzicht", description: hasVatActivity ? `${vat.period}: ${euro(Math.abs(vat.payableVatCents))} ${vatLabel}.` : "Hier zie je straks wat je moet betalen of terugkrijgt.", done: hasVatActivity, actionLabel: "Btw bekijken", action: onViewVat },
  ];
  const nextAction: NextAction = !settingsReady
    ? { label: "EERST EVEN REGELEN", title: "Maak je factuurgegevens compleet", description: "Vul naam, adres, KvK, btw-id en IBAN in. Dan staan je facturen straks meteen goed.", buttonLabel: "Instellingen invullen", action: onViewSettings }
    : customers.length === 0
      ? { label: "EERSTE STAP", title: "Voeg je eerste klant toe", description: "Daarna kun je zonder zoeken meteen een factuur maken voor deze klant.", buttonLabel: "Klant toevoegen", action: onCreateCustomer }
    : countedInvoices.length === 0
      ? { label: "LOGISCHE VOLGENDE STAP", title: "Maak je eerste factuur", description: "Rekenrust zet de klantgegevens en btw-berekening overzichtelijk voor je klaar.", buttonLabel: "Factuur maken", action: onCreate }
      : overdueCount > 0
        ? { label: "AANDACHT NODIG", title: `${overdueCount} factuur${overdueCount === 1 ? " is" : "en zijn"} te laat`, description: "Bekijk welke betaling nog openstaat. Daarna kun je eventueel een herinnering klaarzetten.", buttonLabel: "Facturen bekijken", action: onViewInvoices, tone: "warning" }
        : urgentTask
          ? { label: "KLANTOPVOLGING", title: `${urgentTask.customerName} wacht op opvolging`, description: urgentTask.title, buttonLabel: "Klant openen", action: () => onOpenCustomer(urgentTask.customerId), tone: "warning" }
          : expenses.length === 0
            ? { label: "BTW SLIMMER MAKEN", title: "Voer je eerste zakelijke kosten in", description: "Zo ziet Rekenrust ook welke btw je mogelijk mag terugvragen.", buttonLabel: "Kosten invoeren", action: onCreateExpense }
            : hasVatActivity
              ? { label: "OVERZICHT", title: `Je btw-bedrag staat klaar voor ${vat.period}`, description: `Op basis van je facturen en kosten is dit nu ${euro(Math.abs(vat.payableVatCents))} ${vatLabel}.`, buttonLabel: "Btw bekijken", action: onViewVat, tone: "success" }
              : { label: "RUSTIG VERDER", title: "Je basis staat goed", description: "Blijf facturen, kosten en klantacties bijhouden. Rekenrust rekent ondertussen met je mee.", buttonLabel: "Instellingen controleren", action: onViewSettings, tone: "success" };
  return <>
    <section className="page-heading"><div><p className="eyebrow">{headingDate.toUpperCase()}</p><h1>Goedemorgen, {user.name}</h1><p>Dit gebeurt er vandaag in je onderneming.</p></div><button className="primary-button" onClick={onCreate}><Icon name="plus" size={18}/>Nieuwe factuur</button></section>
    <NextActionCard action={nextAction} />
    <BillingNotice user={user} />
    {isDgaCompany(companySettings) && <DgaPreparationCard onSettings={onViewSettings} />}
    <section className="metrics-grid">
      <Metric label="Omzet deze maand" value={euro(revenueThisMonth)} delta={revenueDelta} sub="ten opzichte van vorige maand" accent />
      <Metric label="Openstaande facturen" value={euro(openTotal)} delta={`${openInvoices.length} facturen`} sub={`waarvan ${overdueCount} te laat`} />
      <Metric label="Kosten dit kwartaal" value={euro(vat.expenseTotalCents)} delta="inclusief btw" sub="op ingevoerde uitgaven" good />
      <Metric label="Verwachte btw" value={euro(Math.abs(vat.payableVatCents))} delta={vat.period} sub={vatLabel} />
    </section>
    <section className="dashboard-grid">
      <div className="card chart-card"><div className="card-header"><div><p className="eyebrow">OMZET</p><h2>Financiële ontwikkeling</h2></div><select aria-label="Periode"><option>Laatste 6 maanden</option></select></div><RevenueChart months={revenueMonths} /></div>
      <div className="card vat-card"><div className="card-header"><div><p className="eyebrow">BTW {vat.period}</p><h2>Je bent goed op weg</h2></div><span className="round-icon">%</span></div><div className="vat-ring"><div><strong>{euro(Math.abs(vat.payableVatCents))}</strong><span>{vatLabel}</span></div></div><div className="vat-breakdown"><span><i className="dot dark"/>Ontvangen btw <strong>{euro(vat.receivedVatCents)}</strong></span><span><i className="dot light"/>Betaalde btw <strong>− {euro(vat.paidVatCents)}</strong></span></div><button className="text-button" onClick={onViewVat}>Bekijk btw-overzicht <Icon name="arrow" size={16}/></button></div>
    </section>
    <TaxReserveCard vat={vat} profitLoss={profitLoss} onViewProfit={onViewProfit} onViewVat={onViewVat} />
    <section className="card report-download-card"><div><p className="eyebrow">RAPPORT</p><h2>Ondernemersrapport downloaden</h2><p>Een compacte PDF met omzet, kosten, resultaat, open facturen en btw. Handig voor jezelf of je boekhouder.</p></div><a className="secondary-button" href="/api/reports/entrepreneur/export" download="ondernemersrapport.pdf">Download rapport</a></section>
    <StartChecklist items={checklistItems} onSettings={onViewSettings} />
    <section className="card follow-up-card"><div className="card-header"><div><p className="eyebrow">KLANTOPVOLGING</p><h2>Vandaag en binnenkort</h2></div><span className="crm-count">{tasks.length} open</span></div>{tasks.length === 0 ? <div className="follow-up-empty"><Icon name="check" size={18}/><span>Alles is bijgewerkt. Mooi werk.</span></div> : <div className="follow-up-list">{tasks.map((task) => <div className="follow-up-item" key={task.id}><button className="task-check" aria-label={`${task.title} afronden`} onClick={() => void onCompleteTask(task.id)}><Icon name="check" size={12}/></button><button className="follow-up-copy" onClick={() => onOpenCustomer(task.customerId)}><strong>{task.title}</strong><small>{task.customerName}</small></button><span className={task.dueDate < today ? "task-date overdue" : "task-date"}>{taskDate(task.dueDate)}</span><button className="more-button" aria-label={`Dossier van ${task.customerName} openen`} onClick={() => onOpenCustomer(task.customerId)}><Icon name="arrow" size={16}/></button></div>)}</div>}</section>
    <section className="card recent-card"><div className="card-header"><div><p className="eyebrow">RECENTE ACTIVITEIT</p><h2>Laatste facturen</h2></div><button className="text-button" onClick={onViewInvoices}>Alle facturen <Icon name="arrow" size={16}/></button></div><InvoiceTable invoices={invoices.slice(0, 4)} /></section>
  </>;
}

function NextActionCard({ action }: { action: NextAction }) {
  return <section className={`next-action card ${action.tone ? `next-action-${action.tone}` : ""}`}><div className="next-action-icon"><Icon name={action.tone === "warning" ? "bell" : "arrow"} size={20}/></div><div><p className="eyebrow">{action.label}</p><h2>{action.title}</h2><p>{action.description}</p></div><button className="primary-button" onClick={action.action}>{action.buttonLabel}</button></section>;
}

function BillingNotice({ user }: { user: User }) {
  if (user.subscriptionStatus === "active") return null;
  const plan = getPlan(user.planType);
  const daysLeft = trialDaysLeft(user.trialEndsAt);
  return <section className="card billing-notice"><div><p className="eyebrow">PROEFPERIODE</p><h2>{daysLeft === null ? "Activeer je pakket wanneer je klaar bent" : `${daysLeft} dag${daysLeft === 1 ? "" : "en"} proefperiode over`}</h2><p>Je gebruikt nu {plan.name} ({plan.priceLabel}). Activeer op tijd, dan loopt Rekenrust niet vast na de proefperiode.</p></div><BillingCheckoutButton label="Nu activeren" /></section>;
}

function DgaPreparationCard({ onSettings }: { onSettings: () => void }) {
  return <section className="card dga-card"><div><p className="eyebrow">B.V. / DGA VOORBEREIDING</p><h2>Rekenrust ondersteunt nu de basisadministratie.</h2><p>Facturen, kosten, btw, klanten en rapporten kun je blijven gebruiken. DGA-specifieke onderdelen zoals salaris, rekening-courant, dividend en vennootschapsbelasting moeten apart worden gecontroleerd of begeleid.</p></div><button className="secondary-button" onClick={onSettings}>Instellingen bekijken</button></section>;
}

function TaxReserveCard({ vat, profitLoss, onViewProfit, onViewVat }: { vat: VatSummary; profitLoss: ProfitLossSummary | null; onViewProfit: () => void; onViewVat: () => void }) {
  const vatReserveCents = Math.max(vat.payableVatCents, 0);
  const estimatedIncomeTaxCents = Math.round(Math.max(profitLoss?.profitCents ?? 0, 0) * 0.3);
  const totalReserveCents = vatReserveCents + estimatedIncomeTaxCents;
  const hasNumbers = vatReserveCents > 0 || estimatedIncomeTaxCents > 0;
  return <section className="card reserve-card"><div className="reserve-main"><span className="reserve-icon">€</span><div><p className="eyebrow">ZET ALVAST APART</p><h2>{hasNumbers ? euro(totalReserveCents) : "Nog geen bedrag nodig"}</h2><p>{hasNumbers ? "Een rustige schatting voor je belastingpotje: btw plus een voorzichtige 30% van je winst. Zo kom je later minder snel voor verrassingen te staan." : "Zodra er omzet, kosten en btw in de app staan, geeft Rekenrust hier een eenvoudig spaaradvies."}</p></div></div><div className="reserve-breakdown"><span><small>Btw</small><strong>{euro(vatReserveCents)}</strong></span><span><small>Winstbelasting, grof geschat</small><strong>{euro(estimatedIncomeTaxCents)}</strong></span><span><small>Totaal apart houden</small><strong>{euro(totalReserveCents)}</strong></span></div><div className="reserve-actions"><button className="text-button" onClick={onViewVat}>Btw bekijken <Icon name="arrow" size={15}/></button><button className="text-button" onClick={onViewProfit}>Winst bekijken <Icon name="arrow" size={15}/></button></div></section>;
}

function StartChecklist({ items, onSettings }: { items: ChecklistItem[]; onSettings: () => void }) {
  const completed = items.filter((item) => item.done).length;
  const percentage = Math.round(completed / items.length * 100);
  const nextItem = items.find((item) => !item.done);
  return <section className="card start-card"><div className="start-intro"><div><p className="eyebrow">STARTKLAAR</p><h2>Je administratie rustig opbouwen</h2><p>Begin met deze stappen. Rekenrust zet je daarna automatisch steeds meer op de rails.</p></div><div className="start-score"><strong>{completed}/{items.length}</strong><span>geregeld</span><div className="progress-track"><span style={{ width: `${percentage}%` }}/></div></div></div><div className={nextItem ? "start-next-step" : "start-next-step start-next-done"}><span>{nextItem ? "Nu handig" : "Mooi geregeld"}</span><div><strong>{nextItem ? nextItem.title : "Je basis staat klaar"}</strong><small>{nextItem ? nextItem.description : "Blijf rustig facturen, kosten en klantacties bijhouden. Rekenrust rekent automatisch met je mee."}</small></div><button className={nextItem ? "primary-button" : "secondary-button"} onClick={nextItem ? nextItem.action : onSettings}>{nextItem ? nextItem.actionLabel : "Instellingen controleren"}</button></div><div className="start-list">{items.map((item) => <div className={item.done ? "start-item done" : "start-item"} key={item.title}><span className="start-check"><Icon name="check" size={13}/></span><div><strong>{item.title}</strong><small>{item.description}</small></div><button className={item.done ? "text-button" : "secondary-button"} onClick={item.action}>{item.actionLabel}</button></div>)}</div><div className="start-footer"><Icon name="settings" size={16}/><span>Controleer ook je bedrijfsgegevens voordat je een factuur echt verstuurt.</span><button className="text-button" onClick={onSettings}>Instellingen openen</button></div></section>;
}

function Metric({ label, value, delta, sub, accent, good }: { label: string; value: string; delta: string; sub: string; accent?: boolean; good?: boolean }) {
  return <div className={`metric-card ${accent ? "metric-accent" : ""}`}><div className="metric-top"><span>{label}</span>{accent && <span className="metric-icon"><Icon name="trend" size={18}/></span>}</div><strong>{value}</strong><p className={good || accent ? "positive" : ""}>{(good || accent) && <Icon name="trend" size={13}/>}<b>{delta}</b> {sub}</p></div>;
}

function buildRevenueMonths(invoices: Invoice[]): RevenueMonth[] {
  const formatter = new Intl.DateTimeFormat("nl-NL", { month: "short" });
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const valueCents = invoices
      .filter((invoice) => invoice.issueDate.startsWith(key))
      .reduce((sum, invoice) => sum + invoice.totalCents, 0);
    return { key, label: formatter.format(monthDate).replace(".", ""), valueCents };
  });
}

function compactEuro(cents: number) {
  if (cents >= 100000) return `€ ${Math.round(cents / 100000)}k`;
  return euro(cents);
}

function RevenueChart({ months }: { months: RevenueMonth[] }) {
  const maxValue = Math.max(...months.map((month) => month.valueCents), 0);
  const chartMax = Math.max(maxValue, 100);
  const width = 650;
  const top = 24;
  const bottom = 170;
  const step = width / Math.max(months.length - 1, 1);
  const points = months.map((month, index) => {
    const x = Math.round(index * step);
    const y = Math.round(bottom - (month.valueCents / chartMax) * (bottom - top));
    return { x, y, ...month };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L${width} 190 L0 190Z`;
  const axisValues = [1, 0.75, 0.5, 0.25, 0].map((factor) => Math.round(chartMax * factor));
  const totalRevenue = months.reduce((sum, month) => sum + month.valueCents, 0);

  return <><div className="chart-summary"><span>Omzet laatste 6 maanden</span><strong>{euro(totalRevenue)}</strong></div><div className="chart-wrap"><div className="axis-labels">{axisValues.map((value) => <span key={value}>{compactEuro(value)}</span>)}</div><div className="chart"><div className="grid-lines"><i/><i/><i/><i/><i/></div><svg viewBox="0 0 650 190" preserveAspectRatio="none" aria-label="Omzetgrafiek laatste zes maanden"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#145b4d" stopOpacity=".18"/><stop offset="100%" stopColor="#145b4d" stopOpacity="0"/></linearGradient></defs><path className="area" d={areaPath}/><path className="line" d={linePath}/>{points.map((point) => <circle key={point.key} cx={point.x} cy={point.y} r="4"><title>{point.label}: {euro(point.valueCents)}</title></circle>)}</svg>{totalRevenue === 0 && <div className="chart-empty">Nog geen verstuurde facturen in deze periode.</div>}<div className="month-labels">{months.map((month) => <span key={month.key}>{month.label}</span>)}</div></div></div></>;
}

function Invoices({ invoices, onCreate, onOpen }: { invoices: Invoice[]; onCreate: () => void; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "Alle">("Alle");
  const aging = useMemo(() => summarizeInvoiceAging(invoices), [invoices]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesStatus = status === "Alle" || invoice.status === status;
    const searchable = `${invoice.id} ${invoice.customer} ${invoice.date} ${invoice.due} ${invoice.status} ${euro(invoice.totalCents)}`.toLowerCase();
    return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
  const resultText = filteredInvoices.length === invoices.length
    ? `${invoices.length} facturen`
    : `${filteredInvoices.length} van ${invoices.length} facturen gevonden`;

  return <><section className="page-heading"><div><p className="eyebrow">VERKOOP</p><h1>Facturen</h1><p>Maak, verstuur en volg je facturen.</p></div><button className="primary-button" onClick={onCreate}><Icon name="plus" size={18}/>Nieuwe factuur</button></section>{invoices.length === 0 ? <EmptyAction icon="file" title="Je hebt nog geen facturen" body="Begin met een eerste factuur. Rekenrust zet klantgegevens, btw en betaalinformatie overzichtelijk voor je klaar." actionLabel="Eerste factuur maken" onAction={onCreate} /> : <><section className="invoice-aging-grid"><article className="card aging-card aging-total"><span>Openstaand totaal</span><strong>{euro(aging.openCents)}</strong><small>{invoiceCountLabel(aging.openCount)} nog niet betaald</small></article><article className="card aging-card aging-overdue"><span>Te laat</span><strong>{euro(aging.overdueCents)}</strong><small>{invoiceCountLabel(aging.overdueCount)} opvolgen</small></article><article className="card aging-card"><span>Binnen 7 dagen</span><strong>{euro(aging.dueSoonCents)}</strong><small>{aging.dueSoonCount} betaling{aging.dueSoonCount === 1 ? "" : "en"} binnenkort verwacht</small></article><article className="card aging-card"><span>Later</span><strong>{euro(aging.laterCents)}</strong><small>{invoiceCountLabel(aging.laterCount)} met meer tijd</small></article></section><div className="filter-row"><div className="search table-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek op klant, nummer of bedrag"/></div><select value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatus | "Alle")} aria-label="Filter op status"><option value="Alle">Alle statussen</option><option value="Openstaand">Openstaand</option><option value="Betaald">Betaald</option><option value="Te laat">Te laat</option><option value="Concept">Concept</option></select></div><p className="filter-result">{resultText}</p><section className="card table-card"><InvoiceTable invoices={filteredInvoices} onOpen={onOpen}/></section></>}</>;
}

function InvoiceTable({ invoices, onOpen }: { invoices: Invoice[]; onOpen?: (id: string) => void }) {
  if (invoices.length === 0) return <div className="empty-table"><Icon name="search" size={18}/><p>Geen facturen gevonden. Pas je zoekterm of filter aan.</p></div>;
  return <div className="table-scroll"><table><thead><tr><th>FACTUUR</th><th>KLANT</th><th>FACTUURDATUM</th><th>VERVALDATUM</th><th>BEDRAG</th><th>STATUS</th><th /></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className={onOpen ? "clickable-row" : ""} onClick={() => onOpen?.(invoice.id)}><td>{onOpen ? <button className="invoice-link" onClick={() => onOpen(invoice.id)}>{invoice.id}</button> : <strong>{invoice.id}</strong>}</td><td>{invoice.customer}</td><td>{invoice.date}</td><td>{invoice.due}</td><td><strong>{euro(invoice.totalCents)}</strong></td><td><StatusBadge status={invoice.status}/></td><td>{onOpen && <button className="more-button" aria-label="Factuur openen" onClick={(event) => { event.stopPropagation(); onOpen(invoice.id); }}><Icon name="arrow"/></button>}</td></tr>)}</tbody></table></div>;
}

function EmptyAction({ icon, title, body, actionLabel, onAction }: { icon: string; title: string; body: string; actionLabel: string; onAction: () => void }) {
  return <section className="card empty-action"><div className="empty-illustration"><Icon name={icon} size={26}/></div><h2>{title}</h2><p>{body}</p><button className="primary-button" onClick={onAction}><Icon name="plus" size={17}/>{actionLabel}</button></section>;
}

function InvoiceDetail({ invoiceId, onBack, onEdit, onDeleted, onStatusChange }: { invoiceId: string; onBack: () => void; onEdit: (invoice: InvoiceDetailData) => void; onDeleted: () => void; onStatusChange: (status: InvoiceStatus) => void }) {
  const [invoice, setInvoice] = useState<InvoiceDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailPrepared, setEmailPrepared] = useState<"invoice" | "reminder" | null>(null);

  useEffect(() => {
    async function loadInvoice() {
      const response = await fetch(`/api/invoices/${invoiceId}`);
      const data = await response.json() as { invoice?: InvoiceDetailData; error?: string };
      if (!response.ok || !data.invoice) setError(data.error ?? "De factuur kon niet worden geladen.");
      else setInvoice(data.invoice);
      setLoading(false);
    }
    void loadInvoice();
  }, [invoiceId]);

  async function changeStatus(status: InvoiceStatus) {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/invoices/${invoiceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await response.json() as { invoice?: InvoiceDetailData; error?: string };
    if (!response.ok || !data.invoice) setError(data.error ?? "De status kon niet worden aangepast.");
    else { setInvoice(data.invoice); onStatusChange(data.invoice.status); }
    setSaving(false);
  }

  async function deleteConcept() {
    if (!window.confirm("Weet je zeker dat je deze conceptfactuur wilt verwijderen?")) return;
    setSaving(true);
    setError("");
    const response = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "De conceptfactuur kon niet worden verwijderd.");
      setSaving(false);
      return;
    }
    onDeleted();
  }

  if (loading) return <div className="editor-page"><div className="detail-loading"><span className="loading-spinner"/>Factuur wordt geopend…</div></div>;
  if (!invoice) return <div className="editor-page"><button className="back-button" onClick={onBack}>←</button><div className="editor-error">{error}</div></div>;
  const totals = calculateInvoice(invoice.lines);
  const longDate = (value: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  const statusTitle = invoice.status === "Concept"
    ? "Deze factuur is nog een concept"
    : invoice.status === "Betaald"
      ? "Deze factuur is betaald"
      : invoice.status === "Te laat"
        ? "Deze betaling is te laat"
        : "Deze factuur staat open";
  const statusBody = invoice.status === "Concept"
    ? "Je kunt dit concept nog aanpassen of verwijderen. Markeer hem pas als verstuurd wanneer hij naar de klant mag."
    : invoice.status === "Betaald"
      ? "Mooi, deze betaling is verwerkt in je administratie."
      : invoice.status === "Te laat"
        ? `De vervaldatum was ${longDate(invoice.dueDate)}. Zet eventueel een betalingsherinnering klaar of markeer de factuur als betaald zodra het geld binnen is.`
        : `De betaling wordt verwacht vóór ${longDate(invoice.dueDate)}.`;
  const statusHelp = invoice.status === "Te laat"
    ? { icon: "bell", title: "Rustig opvolgen", body: "Gebruik de herinnering om een nette e-mail klaar te zetten. Controleer de tekst nog even voordat je hem verstuurt." }
    : { icon: "check", title: "Goed om te weten", body: "Conceptfacturen tellen nog niet mee voor je btw-overzicht. Zodra je de factuur als verstuurd markeert, gebeurt dat automatisch." };

  return <div className="editor-page invoice-detail-page"><header className="editor-header"><div><button className="back-button" onClick={onBack}>←</button><div><p className="eyebrow">FACTUUR {invoice.id}</p><h1>{invoice.customer.name}</h1></div></div><div className="invoice-actions"><a className="secondary-button" href={`/api/invoices/${invoice.id}/pdf`} download={`factuur-${invoice.id}.pdf`}>Pdf downloaden</a><a className="secondary-button email-button" href={`/api/invoices/${invoice.id}/email`} download={`e-mail-factuur-${invoice.id}.eml`} onClick={() => setEmailPrepared("invoice")}>E-mail klaarzetten</a>{invoice.status === "Te laat" && <a className="secondary-button reminder-button" href={`/api/invoices/${invoice.id}/reminder`} download={`betalingsherinnering-${invoice.id}.eml`} onClick={() => setEmailPrepared("reminder")}>Herinnering klaarzetten</a>}{invoice.status === "Concept" && <button className="secondary-button" onClick={() => onEdit(invoice)}>Concept bewerken</button>}{invoice.status === "Concept" && <button className="secondary-button danger-button" disabled={saving} onClick={() => void deleteConcept()}>Concept verwijderen</button>}{invoice.status === "Concept" && <button className="primary-button" disabled={saving} onClick={() => changeStatus("Openstaand")}>{saving ? "Bijwerken…" : "Markeer als verstuurd"}</button>}{invoice.status !== "Betaald" && invoice.status !== "Concept" && <button className="primary-button" disabled={saving} onClick={() => changeStatus("Betaald")}>{saving ? "Bijwerken…" : "Markeer als betaald"}</button>}</div></header>{emailPrepared && <div className="email-prepared"><Icon name="check" size={17}/><p><strong>{emailPrepared === "reminder" ? "De betalingsherinnering staat in je map Downloads." : "De e-mail staat in je map Downloads."}</strong>Open het bestand om de e-mail met pdf-bijlage te controleren en te versturen naar {invoice.customer.email}.</p></div>}{error && <div className="editor-error">{error}</div>}<div className="invoice-detail-grid"><section className="invoice-paper card"><div className="paper-brand"><InvoiceBrand logo={invoice.company.invoiceLogo} /><div><span>FACTUUR</span><strong>{invoice.id}</strong></div></div><div className="paper-parties"><div><span>VAN</span><strong>{invoice.company.name}</strong><p>{invoice.company.street}<br/>{invoice.company.postalCode} {invoice.company.city}<br/>{invoice.company.email}<br/><small>KvK {invoice.company.kvkNumber} · btw-id {invoice.company.vatNumber}</small></p></div><div><span>FACTUUR AAN</span><strong>{invoice.customer.name}</strong><p>{invoice.customer.contact && <>{invoice.customer.contact}<br/></>}{invoice.customer.street}<br/>{invoice.customer.postalCode} {invoice.customer.city}</p></div></div><div className="paper-meta"><div><span>FACTUURDATUM</span><strong>{longDate(invoice.issueDate)}</strong></div><div><span>VERVALDATUM</span><strong>{longDate(invoice.dueDate)}</strong></div><div><span>STATUS</span><StatusBadge status={invoice.status}/></div></div><div className="paper-lines"><div className="paper-line-header"><span>OMSCHRIJVING</span><span>AANTAL</span><span>PRIJS</span><span>BEDRAG</span></div>{invoice.lines.map((line) => <div className="paper-line" key={line.id}><span><strong>{line.description}</strong><small>{line.vatRate}% btw</small></span><span>{line.quantity}</span><span>{euro(line.unitPriceCents)}</span><strong>{euro(Math.round(line.quantity * line.unitPriceCents))}</strong></div>)}</div><div className="paper-totals"><p><span>Subtotaal</span><strong>{euro(totals.subtotalCents)}</strong></p>{Object.entries(totals.vatByRate).filter(([, amount]) => amount > 0).map(([rate, amount]) => <p key={rate}><span>Btw {rate}%</span><strong>{euro(amount)}</strong></p>)}<p><span>Totaal</span><strong>{euro(totals.totalCents)}</strong></p></div><div className="paper-payment"><strong>Betaling</strong><p>Maak {euro(invoice.totalCents)} over naar {invoice.company.iban} vóór {longDate(invoice.dueDate)}, onder vermelding van {invoice.id}.</p></div></section><aside className="invoice-detail-side"><div className={invoice.status === "Te laat" ? "card detail-status-card detail-status-warning" : "card detail-status-card"}><p className="eyebrow">STATUS</p><StatusBadge status={invoice.status}/><h2>{statusTitle}</h2><p>{statusBody}</p></div><div className={invoice.status === "Te laat" ? "card detail-help detail-help-warning" : "card detail-help"}><Icon name={statusHelp.icon} size={18}/><p><strong>{statusHelp.title}</strong>{statusHelp.body}</p></div></aside></div></div>;
}

function Customers({ customers, onCreate, onEdit, onOpen }: { customers: Customer[]; onCreate: () => void; onEdit: (customer: Customer) => void; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCustomers = customers.filter((customer) => {
    const searchable = `${customer.name} ${customer.contact} ${customer.email} ${customer.street} ${customer.postalCode} ${customer.city}`.toLowerCase();
    return !normalizedQuery || searchable.includes(normalizedQuery);
  });
  const resultText = filteredCustomers.length === customers.length
    ? `${customers.length} klanten`
    : `${filteredCustomers.length} van ${customers.length} klanten gevonden`;

  return <><section className="page-heading"><div><p className="eyebrow">RELATIES</p><h1>Klanten</h1><p>Alle contacten, notities en opvolging op één plek.</p></div><button className="primary-button" onClick={onCreate}><Icon name="plus" size={18}/>Nieuwe klant</button></section>{customers.length === 0 ? <EmptyAction icon="users" title="Je hebt nog geen klanten" body="Voeg eerst een klant toe. Daarna kun je sneller facturen maken en notities of opvolgacties bijhouden." actionLabel="Eerste klant toevoegen" onAction={onCreate} /> : <><div className="filter-row"><div className="search table-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek op naam, contact of plaats"/></div></div><p className="filter-result">{resultText}</p>{filteredCustomers.length === 0 ? <div className="card empty-table customer-empty"><Icon name="search" size={18}/><p>Geen klanten gevonden. Pas je zoekterm aan.</p></div> : <div className="customer-grid">{filteredCustomers.map((customer) => <article className="card customer-card" key={customer.id}><div className={`customer-avatar ${customer.color}`}>{customer.initials}</div><button className="more-button" aria-label={`${customer.name} bewerken`} onClick={() => onEdit(customer)}><Icon name="more"/></button><h3>{customer.name}</h3><p>{customerContactLabel(customer)}</p><a href={`mailto:${customer.email}`}>{customer.email}</a><p className="customer-address">{customer.street}<br/>{customer.postalCode} {customer.city}</p><div className="customer-footer"><span>Totale omzet <strong>{euro(customer.revenueCents)}</strong></span><div><button onClick={() => onEdit(customer)}>Bewerken</button><button className="open-dossier" onClick={() => onOpen(customer.id)}>Open dossier <Icon name="arrow" size={13}/></button></div></div></article>)}</div>}</>}</>;
}

function CustomerDetail({ customer, onBack, onEdit }: { customer: Customer; onBack: () => void; onEdit: (customer: Customer) => void }) {
  const [crm, setCrm] = useState<{ notes: CrmNote[]; tasks: CrmTask[] } | null>(null);
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [dueDate, setDueDate] = useState(DEFAULT_FOLLOW_UP_DATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCrm() {
      const response = await fetch(`/api/customers/${customer.id}/crm`);
      const data = await response.json() as { crm?: { notes: CrmNote[]; tasks: CrmTask[] }; error?: string };
      if (response.ok && data.crm) setCrm(data.crm); else setError(data.error ?? "Het klantdossier kon niet worden geladen.");
    }
    void loadCrm();
  }, [customer.id]);

  async function addItem(input: { type: "note"; body: string } | { type: "task"; title: string; dueDate: string }) {
    setBusy(true); setError("");
    const response = await fetch(`/api/customers/${customer.id}/crm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const data = await response.json() as { crm?: { notes: CrmNote[]; tasks: CrmTask[] }; error?: string };
    if (response.ok && data.crm) { setCrm(data.crm); setNote(""); setTaskTitle(""); }
    else setError(data.error ?? "Opslaan is niet gelukt.");
    setBusy(false);
  }

  async function toggleTask(task: CrmTask) {
    setBusy(true); setError("");
    const response = await fetch(`/api/customers/${customer.id}/crm`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, completed: !task.completed }) });
    const data = await response.json() as { crm?: { notes: CrmNote[]; tasks: CrmTask[] }; error?: string };
    if (response.ok && data.crm) setCrm(data.crm); else setError(data.error ?? "De actie kon niet worden bijgewerkt.");
    setBusy(false);
  }

  const dateLabel = (value: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
  const openTasks = crm?.tasks.filter((task) => !task.completed).length ?? 0;

  return <div className="editor-page crm-page"><header className="editor-header"><div><button className="back-button" onClick={onBack}>←</button><div><p className="eyebrow">KLANTDOSSIER</p><h1>{customer.name}</h1></div></div><button className="secondary-button" onClick={() => onEdit(customer)}>Klantgegevens bewerken</button></header>{error && <div className="editor-error">{error}</div>}<div className="crm-layout"><aside className="crm-sidebar"><div className="card crm-contact-card"><div className={`customer-avatar ${customer.color}`}>{customer.initials}</div><h2>{customer.name}</h2><p>{customerContactLabel(customer)}</p><a href={`mailto:${customer.email}`}>{customer.email}</a><div className="crm-address"><span>ADRES</span><p>{customer.street}<br/>{customer.postalCode} {customer.city}</p></div><div className="crm-numbers"><span>Totale omzet <strong>{euro(customer.revenueCents)}</strong></span><span>Open acties <strong>{openTasks}</strong></span></div></div><div className="card crm-tip"><Icon name="check" size={18}/><p><strong>Alles bij elkaar</strong>Notities en acties blijven gekoppeld aan deze klant, ook wanneer je de pagina sluit.</p></div></aside><main className="crm-main"><section className="card crm-section"><div className="crm-section-header"><div><p className="eyebrow">OPVOLGING</p><h2>Acties</h2></div><span className="crm-count">{openTasks} open</span></div><form className="quick-task" onSubmit={(event) => { event.preventDefault(); void addItem({ type: "task", title: taskTitle, dueDate }); }}><input aria-label="Nieuwe actie" required value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Bijvoorbeeld: offerte nabellen"/><input aria-label="Datum actie" required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)}/><button className="primary-button" disabled={busy}><Icon name="plus" size={16}/>Toevoegen</button></form><div className="task-list">{!crm ? <div className="mini-loading"><span className="loading-spinner"/>Acties laden…</div> : crm.tasks.length === 0 ? <p className="empty-message">Nog geen acties voor deze klant.</p> : crm.tasks.map((task) => <button className={`task-item ${task.completed ? "completed" : ""}`} key={task.id} onClick={() => toggleTask(task)} disabled={busy}><span className="task-check">{task.completed && <Icon name="check" size={13}/>}</span><span><strong>{task.title}</strong><small>{task.completed ? "Afgerond" : `Uiterlijk ${dateLabel(task.dueDate)}`}</small></span></button>)}</div></section><section className="card crm-section"><div className="crm-section-header"><div><p className="eyebrow">GESPREKSGESCHIEDENIS</p><h2>Notities</h2></div></div><form className="note-form" onSubmit={(event) => { event.preventDefault(); void addItem({ type: "note", body: note }); }}><textarea aria-label="Nieuwe notitie" required value={note} onChange={(event) => setNote(event.target.value)} placeholder="Wat wil je over deze klant onthouden?"/><div><small>Alleen zichtbaar in jouw administratie</small><button className="primary-button" disabled={busy}>Notitie opslaan</button></div></form><div className="note-list">{!crm ? <div className="mini-loading"><span className="loading-spinner"/>Notities laden…</div> : crm.notes.length === 0 ? <p className="empty-message">Nog geen notities voor deze klant.</p> : crm.notes.map((item) => <article className="note-item" key={item.id}><span className="avatar avatar-dark">RB</span><div><p>{item.body}</p><small>{dateLabel(item.createdAt)}</small></div></article>)}</div></section></main></div></div>;
}

function CustomerEditor({ customer, onCancel, onSave }: { customer: Customer | null; onCancel: () => void; onSave: (input: CustomerInput) => Promise<void> }) {
  const [form, setForm] = useState<CustomerInput>({
    name: customer?.name ?? "",
    contact: customer?.contact ?? "",
    email: customer?.email ?? "",
    street: customer?.street ?? "",
    postalCode: customer?.postalCode ?? "",
    city: customer?.city ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const title = customer ? "Klant bewerken" : "Nieuwe klant";
  const generatedInitials = form.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

  function update(field: keyof CustomerInput, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try { await onSave(form); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Opslaan is niet gelukt."); setSaving(false); }
  }

  return <div className="editor-page customer-editor-page"><header className="editor-header"><div><button className="back-button" onClick={onCancel}>←</button><div><p className="eyebrow">KLANTENBEHEER</p><h1>{title}</h1></div></div><div><button className="secondary-button" onClick={onCancel}>Annuleren</button><button className="primary-button" form="customer-form" disabled={saving}>{saving ? "Veilig opslaan…" : "Klant opslaan"}</button></div></header>{error && <div className="editor-error">{error}</div>}<div className="customer-editor-grid"><form id="customer-form" className="card customer-form" onSubmit={submit}><section><p className="form-step">1</p><div><h2>Wie is je klant?</h2><p>Dit kan een bedrijf of een particuliere klant zijn. Een contactpersoon is alleen nodig bij bedrijven.</p><div className="form-grid"><label><span>Naam klant</span><input required autoFocus value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Bijvoorbeeld Studio Noord of Sophie de Wit" /></label><label><span>Contactpersoon <small>optioneel</small></span><input value={form.contact} onChange={(event) => update("contact", event.target.value)} placeholder="Alleen nodig bij een bedrijf" /></label><label className="wide-field"><span>E-mailadres</span><input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="naam@voorbeeld.nl" /></label></div></div></section><section><p className="form-step">2</p><div><h2>Waar woont of is je klant gevestigd?</h2><p>Dit adres komt straks automatisch op de factuur.</p><div className="form-grid"><label className="wide-field"><span>Straat en huisnummer</span><input required value={form.street} onChange={(event) => update("street", event.target.value)} placeholder="Voorbeeldstraat 12" /></label><label><span>Postcode</span><input required value={form.postalCode} onChange={(event) => update("postalCode", event.target.value)} placeholder="1234 AB" /></label><label><span>Plaats</span><input required value={form.city} onChange={(event) => update("city", event.target.value)} placeholder="Amsterdam" /></label></div></div></section></form><aside className="card customer-preview"><p className="eyebrow">VOORBEELD</p><div className={`customer-avatar ${customer?.color ?? "mint"}`}>{generatedInitials}</div><h2>{form.name || "Naam klant"}</h2><p>{form.contact || "Particuliere klant"}</p><a>{form.email || "e-mailadres"}</a><div className="preview-address-block"><span>FACTUURADRES</span><p>{form.street || "Straat en huisnummer"}<br/>{form.postalCode || "Postcode"} {form.city || "Plaats"}</p></div><div className="preview-tip"><Icon name="check" size={16}/><p>Deze gegevens worden automatisch gebruikt bij een nieuwe factuur.</p></div></aside></div></div>;
}

function HelpCenter({ onCreateInvoice, onCreateCustomer, onCreateExpense, onViewInvoices, onViewCustomers, onViewExpenses, onViewProfit, onViewVat, onViewYearEnd, onViewSettings }: { onCreateInvoice: () => void; onCreateCustomer: () => void; onCreateExpense: () => void; onViewInvoices: () => void; onViewCustomers: () => void; onViewExpenses: () => void; onViewProfit: () => void; onViewVat: () => void; onViewYearEnd: () => void; onViewSettings: () => void }) {
  const helpSteps = [
    { number: "1", title: "Zet je bedrijfsgegevens goed", body: "Vul naam, adres, KvK, btw-id en IBAN in. Dan komen deze gegevens automatisch op je facturen.", action: "Instellingen openen", onClick: onViewSettings },
    { number: "2", title: "Voeg klanten toe", body: "Een klant is nodig om snel een factuur te maken en later notities of opvolgacties vast te leggen.", action: "Klant toevoegen", onClick: onCreateCustomer },
    { number: "3", title: "Maak en volg facturen", body: "Maak facturen, download ze als PDF en houd bij of ze openstaan, betaald zijn of te laat zijn.", action: "Factuur maken", onClick: onCreateInvoice },
    { number: "4", title: "Voer kosten en bonnetjes in", body: "Geef het bedrag inclusief btw op. Rekenrust rekent zelf uit welk deel kosten en welk deel btw is.", action: "Kosten invoeren", onClick: onCreateExpense },
  ];
  const explainCards = [
    { title: "Btw-opgaaf", body: "Hier zie je in gewone taal of je btw moet betalen of terugkrijgt. Eerst staat het bedrag centraal, daarna de uitsplitsing.", action: "Btw bekijken", onClick: onViewVat },
    { title: "Winst & verlies", body: "Hier zie je omzet min kosten. Grote aankopen die je afschrijft worden per jaar meegenomen.", action: "Winst bekijken", onClick: onViewProfit },
    { title: "Jaarcheck", body: "Een rustige controlelijst voor het einde van het jaar: concepten, ontbrekende bonnetjes, btw en bedrijfsgegevens.", action: "Jaarcheck openen", onClick: onViewYearEnd },
  ];
  const dictionary = [
    { term: "Conceptfactuur", explanation: "Een veilige proefversie. Deze telt nog niet mee voor omzet of btw." },
    { term: "Btw", explanation: "Belasting die je op verkoopfacturen rekent en op zakelijke kosten betaalt." },
    { term: "Voorbelasting", explanation: "Btw die je zelf hebt betaald op zakelijke kosten. Die mag je vaak verrekenen." },
    { term: "Afschrijving", explanation: "Een grote aankoop verspreid je over meerdere jaren in je winst- en verliesrekening." },
  ];
  const subscriptionItems = [
    { title: "Proefperiode", body: "Je start rustig met 14 dagen proberen. Daarna vraagt Rekenrust om activatie, zodat het platform niet ongemerkt gratis doorloopt." },
    { title: "Betaling", body: "Betalen loopt via Mollie. Na een geslaagde betaling zet Rekenrust je pakket automatisch op actief." },
    { title: "Pakket wijzigen", body: "Voor activatie kun je zelf wisselen. Na activatie staat het pakket vast en wijzigen we dit veilig via contact." },
  ];
  const supportItems = [
    { title: "Vraag over Rekenrust", body: "Gebruik de hulpteksten in Rekenrust of neem contact op als iets onduidelijk is. Liever één vraag te veel dan blijven zoeken." },
    { title: "Sparren over administratie", body: "Voor inhoudelijke administratievragen kun je met Ralf sparren. Rekenrust helpt met overzicht; persoonlijk advies blijft maatwerk." },
    { title: "Technisch probleem", body: "Noteer wat je wilde doen en welke melding je zag. Dan is sneller duidelijk of het om invoer, betaling of techniek gaat." },
  ];

  return <><section className="page-heading"><div><p className="eyebrow">HULP & UITLEG</p><h1>Waar wil je mee aan de slag?</h1><p>Korte uitleg zonder boekhoudtaal. Kies wat je wilt doen; Rekenrust brengt je naar de juiste plek.</p></div><button className="primary-button" onClick={onCreateInvoice}><Icon name="plus" size={18}/>Factuur maken</button></section><section className="help-hero card"><div><p className="eyebrow">SNEL BEGINNEN</p><h2>De simpelste volgorde voor je administratie</h2><p>Als je net start, hoef je niet alles tegelijk te begrijpen. Begin bovenaan en werk rustig naar beneden.</p></div><div className="help-quick-actions"><button className="secondary-button" onClick={onViewCustomers}>Klanten bekijken</button><button className="secondary-button" onClick={onViewExpenses}>Kosten bekijken</button><button className="secondary-button" onClick={onViewInvoices}>Facturen bekijken</button></div></section><section className="help-steps">{helpSteps.map((step) => <article className="card help-step" key={step.title}><span>{step.number}</span><div><h2>{step.title}</h2><p>{step.body}</p><button className="text-button" onClick={step.onClick}>{step.action} <Icon name="arrow" size={15}/></button></div></article>)}</section><section className="card help-support-panel"><div><p className="eyebrow">CONTACT & ABONNEMENT</p><h2>Rekenrust gebruiken met vertrouwen</h2><p>Hier staat in gewone taal wat ondernemers mogen verwachten rond betalen, support en pakketkeuze.</p></div><div className="support-columns"><div><h3>Abonnement</h3>{subscriptionItems.map((item) => <article key={item.title}><strong>{item.title}</strong><span>{item.body}</span></article>)}</div><div><h3>Hulp nodig?</h3>{supportItems.map((item) => <article key={item.title}><strong>{item.title}</strong><span>{item.body}</span></article>)}</div></div></section><section className="card help-dictionary"><div><p className="eyebrow">WOORDENLIJST</p><h2>Boekhoudwoorden in gewone taal</h2><p>Een paar termen die vaak terugkomen in Rekenrust, kort uitgelegd.</p></div><div>{dictionary.map((item) => <article key={item.term}><strong>{item.term}</strong><span>{item.explanation}</span></article>)}</div></section><section className="help-grid">{explainCards.map((card) => <article className="card help-info" key={card.title}><p className="eyebrow">UITLEG</p><h2>{card.title}</h2><p>{card.body}</p><button className="secondary-button" onClick={card.onClick}>{card.action}</button></article>)}<article className="card help-info"><p className="eyebrow">RAPPORT</p><h2>Ondernemersrapport</h2><p>Download één PDF met omzet, kosten, winst, open facturen en btw. Handig voor jezelf of je boekhouder.</p><a className="secondary-button" href="/api/reports/entrepreneur/export" download>Rapport downloaden</a></article><article className="card help-info help-privacy"><p className="eyebrow">VERTROUWEN</p><h2>Privacy en gegevensbeheer</h2><p>In Instellingen lees je welke gegevens Rekenrust bewaart, waarvoor ze worden gebruikt en hoe je zelf grip houdt met back-ups, wachtwoord en sessies.</p><button className="secondary-button" onClick={onViewSettings}>Privacy bekijken</button></article><article className="card help-info help-live"><p className="eyebrow">ONLINE</p><h2>Online gebruiken</h2><p>Rekenrust draait online met Supabase voor opslag, Resend voor e-mail en Mollie voor betalingen. Test vóór echte klanten altijd de volledige route met een testaccount.</p><ol><li><strong>Besloten pilot:</strong> start met enkele vertrouwde ondernemers.</li><li><strong>Live gebruik:</strong> pas na controle van privacy, support en betaalproces.</li></ol><button className="secondary-button" onClick={onViewSettings}>Livegang controleren</button></article></section></>;
}

function Settings({ onSaved, onLoggedOut }: { onSaved: (settings: CompanySettings) => void; onLoggedOut: () => void }) {
  const [form, setForm] = useState<CompanySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSettings() {
      const response = await fetch("/api/settings");
      const data = await response.json() as { settings?: CompanySettings; error?: string };
      if (response.ok && data.settings) setForm({ ...data.settings, companyType: data.settings.companyType ?? "sole_proprietor" });
      else setError(data.error ?? "De bedrijfsgegevens konden niet worden geladen.");
    }
    void loadSettings();
  }, []);

  function update<K extends keyof CompanySettings>(field: K, value: CompanySettings[K]) { setForm((current) => current ? { ...current, [field]: value } : current); }
  async function chooseLogo(file?: File) {
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Kies een png- of jpg-logo.");
      return;
    }
    if (file.size > 500 * 1024) {
      setError("Het logo is te groot. Kies een bestand kleiner dan 500 KB.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Het logo kon niet worden gelezen."));
      reader.readAsDataURL(file);
    });
    update("invoiceLogo", dataUrl);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true); setError(""); setMessage("");
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json() as { settings?: CompanySettings; error?: string };
    if (!response.ok || !data.settings) setError(data.error ?? "Opslaan is niet gelukt.");
    else { setForm(data.settings); onSaved(data.settings); setMessage("Bedrijfsgegevens veilig opgeslagen"); }
    setSaving(false);
  }

  if (!form && !error) return <div className="detail-loading"><span className="loading-spinner"/>Bedrijfsgegevens worden geladen…</div>;
  if (!form) return <div className="editor-error">{error}</div>;
  const fields = [form.companyName, form.companyType, form.owner, form.email, form.street, form.postalCode, form.city, form.kvkNumber, form.vatNumber, form.iban, String(form.invoicePaymentTerm), String(form.defaultVatRate), form.invoiceFooter];
  const completed = fields.filter((value) => value.trim()).length;
  const percentage = Math.round(completed / fields.length * 100);

  return <><section className="page-heading"><div><p className="eyebrow">JOUW ONDERNEMING</p><h1>Bedrijfsinstellingen</h1><p>Deze gegevens verschijnen automatisch op iedere factuur.</p></div><button className="primary-button" form="settings-form" disabled={saving}>{saving ? "Veilig opslaan…" : "Wijzigingen opslaan"}</button></section>{error && <div className="editor-error">{error}</div>}{message && <div className="settings-success"><Icon name="check" size={17}/>{message}</div>}<div className="settings-grid"><form id="settings-form" className="card settings-form" onSubmit={submit}><div className="settings-section"><div className="settings-section-title"><span className="form-step">1</span><div><h2>Bedrijf en contact</h2><p>De naam waaronder je klanten jou kennen.</p></div></div><div className="form-grid"><label><span>Bedrijfsnaam</span><input required value={form.companyName} onChange={(event) => update("companyName", event.target.value)} /></label><label><span>Jouw naam</span><input required value={form.owner} onChange={(event) => update("owner", event.target.value)} /></label><label className="wide-field"><span>Zakelijk e-mailadres</span><input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label className="wide-field"><span>Soort onderneming</span><select value={form.companyType} onChange={(event) => update("companyType", event.target.value as CompanyType)}><option value="sole_proprietor">Eenmanszaak / zzp</option><option value="bv_dga">B.V. / DGA</option><option value="other">Anders</option></select><small>{form.companyType === "bv_dga" ? "Rekenrust bewaart dit als signaal: basisadministratie kan, DGA-specifieke zaken vragen extra controle." : "Deze keuze helpt Rekenrust om waarschuwingen en uitleg beter af te stemmen."}</small></label></div></div><div className="settings-section"><div className="settings-section-title"><span className="form-step">2</span><div><h2>Vestigingsadres</h2><p>Gebruik het adres waar je onderneming feitelijk gevestigd is.</p></div></div><div className="form-grid"><label className="wide-field"><span>Straat en huisnummer</span><input required value={form.street} onChange={(event) => update("street", event.target.value)} /></label><label><span>Postcode</span><input required value={form.postalCode} onChange={(event) => update("postalCode", event.target.value)} /></label><label><span>Plaats</span><input required value={form.city} onChange={(event) => update("city", event.target.value)} /></label></div></div><div className="settings-section"><div className="settings-section-title"><span className="form-step">3</span><div><h2>Factuur- en betaalgegevens</h2><p>Gebruik je btw-id, niet het omzetbelastingnummer waarin bij een eenmanszaak je BSN kan staan.</p></div></div><div className="form-grid"><label><span>KvK-nummer</span><input required inputMode="numeric" value={form.kvkNumber} onChange={(event) => update("kvkNumber", event.target.value)} /></label><label><span>Btw-id</span><input required value={form.vatNumber} onChange={(event) => update("vatNumber", event.target.value)} /></label><label className="wide-field"><span>IBAN</span><input required value={form.iban} onChange={(event) => update("iban", event.target.value)} /></label></div></div><div className="settings-section"><div className="settings-section-title"><span className="form-step">4</span><div><h2>Standaard factuurinstellingen</h2><p>Deze voorkeuren vult Rekenrust automatisch in bij nieuwe facturen.</p></div></div><div className="form-grid"><label><span>Standaard betaaltermijn</span><select value={form.invoicePaymentTerm} onChange={(event) => update("invoicePaymentTerm", Number(event.target.value) as CompanySettings["invoicePaymentTerm"])}><option value="7">7 dagen</option><option value="14">14 dagen</option><option value="30">30 dagen</option><option value="60">60 dagen</option></select></label><label><span>Standaard btw-tarief</span><select value={form.defaultVatRate} onChange={(event) => update("defaultVatRate", Number(event.target.value) as VatRate)}><option value="21">21% btw</option><option value="9">9% btw</option><option value="0">0% btw</option></select></label><label className="wide-field"><span>Vaste tekst onderaan factuur</span><textarea value={form.invoiceFooter} onChange={(event) => update("invoiceFooter", event.target.value)} maxLength={240} placeholder="Bijvoorbeeld: bedankt voor de fijne samenwerking." /><small>Deze tekst kun je bij het maken van een factuur nog aanpassen.</small></label></div><div className="logo-upload-row"><div><span>Logo op factuur</span><p>Gebruik bij voorkeur een liggend png- of jpg-logo tot 500 KB.</p></div>{form.invoiceLogo ? <img src={form.invoiceLogo} alt="Huidig factuurlogo" /> : <span className="logo-placeholder">Nog geen logo</span>}<label className="secondary-button logo-upload-button"><input type="file" accept="image/png,image/jpeg" onChange={(event) => void chooseLogo(event.target.files?.[0])}/>{form.invoiceLogo ? "Logo vervangen" : "Logo kiezen"}</label>{form.invoiceLogo && <button type="button" className="text-button" onClick={() => update("invoiceLogo", "")}>Logo verwijderen</button>}</div></div></form><aside className="settings-side"><div className="card readiness-card"><p className="eyebrow">FACTUUR GEREED</p><div className="readiness-score"><strong>{percentage}%</strong><span>compleet</span></div><div className="progress-track"><span style={{ width: `${percentage}%` }}/></div><p>{percentage === 100 ? "Mooi. Alle standaard bedrijfsvelden voor je Nederlandse facturen zijn ingevuld." : "Vul de ontbrekende velden in voordat je een factuur verstuurt."}</p></div><DgaSettingsCard companyType={form.companyType} /><SupportCard /><LiveReadinessCard /><StorageHealthCard /><PrivacyCard /><SessionCard onLoggedOut={onLoggedOut} /><EmailVerificationCard /><PasswordCard /><BackupCard /><div className="card settings-note"><Icon name="check" size={18}/><p><strong>Demogegevens</strong>De huidige nummers en het adres zijn voorbeelden. Vervang ze door je eigen bedrijfsgegevens voordat je facturen echt verstuurt.</p></div></aside></div></>;
}

function DgaSettingsCard({ companyType }: { companyType: CompanyType }) {
  if (companyType !== "bv_dga") {
    return <><div className="card settings-note"><Icon name="check" size={18}/><p><strong>Soort onderneming</strong>Ingesteld als {companyTypeLabel(companyType)}. De standaard Rekenrust-flow blijft gericht op eenvoudige ondernemersadministratie.</p></div><BillingStatusCard /></>;
  }
  return <><div className="card dga-settings-card"><p className="eyebrow">DGA-VOORBEREIDING</p><h2>B.V. / DGA staat aan</h2><p>Rekenrust kan de basisadministratie ondersteunen: klanten, facturen, kosten, btw en rapporten. Laat DGA-specifieke onderdelen apart begeleiden: gebruikelijk loon, loonheffing, rekening-courant, dividend, vennootschapsbelasting en jaarrekening.</p><ul><li>Gebruik Rekenrust als verzamel- en controlesysteem.</li><li>Controleer periodiek met je adviseur wat buiten Rekenrust valt.</li><li>Voorkom dat DGA-posten als gewone kosten worden verwerkt.</li></ul></div><BillingStatusCard /></>;
}

function BillingStatusCard() {
  const [billing, setBilling] = useState<BillingStatusOverview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [planChanging, setPlanChanging] = useState<PlanId | null>(null);

  function formatDate(value: string | null) {
    if (!value) return "Nog niet bekend";
    return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  }

  function statusLabel(status: string) {
    if (status === "active") return "Actief";
    if (status === "trialing") return "Proefperiode";
    if (status === "past_due") return "Betaling nodig";
    if (status === "canceled") return "Gestopt";
    return status || "Onbekend";
  }

  function mollieCustomerLabel(currentBilling: BillingStatusOverview | null) {
    if (!currentBilling) return "...";
    if (!currentBilling.mollieConfigured) return "Niet ingesteld";
    return currentBilling.mollieCustomerId ? "Gekoppeld" : "Nog niet gekoppeld";
  }

  function mollieSubscriptionLabel(currentBilling: BillingStatusOverview | null) {
    if (!currentBilling) return "...";
    if (!currentBilling.mollieConfigured) return "Niet ingesteld";
    if (currentBilling.mollieSubscriptionId) return currentBilling.subscriptionStatus === "past_due" ? "Aandacht nodig" : "Actief gekoppeld";
    if (currentBilling.subscriptionStatus === "trialing") return "Nog proefperiode";
    return "Nog niet actief";
  }

  function molliePaymentLabel(currentBilling: BillingStatusOverview | null) {
    if (!currentBilling) return "...";
    if (!currentBilling.mollieConfigured) return "Niet ingesteld";
    if (currentBilling.mollieLastPaymentId) return "Betaling bekend";
    if (currentBilling.subscriptionStatus === "trialing") return "Nog geen betaling";
    return "Nog onbekend";
  }

  async function loadBilling(method: "GET" | "POST" = "GET") {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/billing/status", { method });
      const data = await response.json() as { billing?: BillingStatusOverview; message?: string; error?: string };
      if (!response.ok || !data.billing) throw new Error(data.error ?? "Abonnementsstatus kon niet worden geladen.");
      setBilling(data.billing);
      window.dispatchEvent(new CustomEvent("helder-billing-updated", { detail: data.billing }));
      if (data.message) setMessage(data.message);
      return data.billing;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Abonnementsstatus kon niet worden geladen.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function changePlan(planType: PlanId) {
    setPlanChanging(planType);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/billing/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planType }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Pakket wijzigen is niet gelukt.");
      await loadBilling("GET");
      setMessage(data.message ?? "Pakket gewijzigd.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pakket wijzigen is niet gelukt.");
    } finally {
      setPlanChanging(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBilling("GET"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const daysLeft = trialDaysLeft(billing?.trialEndsAt ?? null);
  const tone = billing?.subscriptionStatus === "active" ? "billing-status-card billing-status-active" : billing?.subscriptionStatus === "past_due" ? "billing-status-card billing-status-warning" : "billing-status-card";
  const canChangePlan = Boolean(billing && billing.subscriptionStatus !== "active" && !billing.mollieSubscriptionId);

  return <section className={`card ${tone}`}><p className="eyebrow">ABONNEMENT</p><h2>{billing ? `${billing.planName} · ${billing.priceLabel}` : "Abonnement laden"}</h2><p>{billing ? `Status: ${statusLabel(billing.subscriptionStatus)}${billing.subscriptionStatus === "trialing" && daysLeft !== null ? ` · ${daysLeft} dagen proefperiode over` : ""}.` : "Rekenrust controleert pakket, proefperiode en Mollie-koppeling."}</p><div className="billing-status-list"><span><strong>{billing ? statusLabel(billing.subscriptionStatus) : "..."}</strong><small>Status</small></span><span><strong>{formatDate(billing?.trialEndsAt ?? null)}</strong><small>Einde proefperiode</small></span><span><strong>{formatDate(billing?.subscriptionActivatedAt ?? null)}</strong><small>Geactiveerd op</small></span></div>{billing && <div className="billing-plan-switch"><strong>Pakket kiezen</strong><p>{canChangePlan ? "Je kunt je pakket nog aanpassen voordat het abonnement actief wordt." : "Je pakket staat vast voor dit actieve abonnement. Wijzigen kan veilig via contact."}</p>{HELDER_PLANS.map((plan) => <button type="button" key={plan.id} className={billing.planType === plan.id ? "plan-option selected" : "plan-option"} onClick={() => void changePlan(plan.id)} disabled={!canChangePlan || loading || Boolean(planChanging)}><strong>{plan.name}<em>{plan.priceLabel}</em></strong><small>{planChanging === plan.id ? "Pakket wijzigen…" : plan.shortDescription}</small></button>)}</div>}<div className="billing-id-list"><span><strong>{mollieCustomerLabel(billing)}</strong><small>Betaalprofiel</small></span><span><strong>{mollieSubscriptionLabel(billing)}</strong><small>Abonnement bij Mollie</small></span><span><strong>{molliePaymentLabel(billing)}</strong><small>Laatste betaling</small></span></div>{billing?.mollieLastPaymentId && <small className="billing-reference">Interne betaalreferentie is bekend en wordt alleen gebruikt voor controle en support.</small>}{billing && !billing.mollieConfigured && <small className="security-error">Mollie API-key ontbreekt nog in deze omgeving.</small>}{message && <small className="security-success">{message}</small>}{error && <small className="security-error">{error}</small>}<button className="secondary-button" type="button" onClick={() => void loadBilling("POST")} disabled={loading}>{loading ? "Controleren…" : "Mollie-status opnieuw controleren"}</button></section>;
}

function SupportCard() {
  return <section className="card support-card"><p className="eyebrow">CONTACT</p><h2>Hulp of sparren?</h2><p>Loop je vast in Rekenrust of twijfel je over een administratieve keuze? Neem contact op met Ralf. Dan kijken we samen wat praktisch en verstandig is.</p><div className="support-list"><span><strong>Technische vraag</strong><small>Beschrijf wat je wilde doen en welke melding je zag.</small></span><span><strong>Administratievraag</strong><small>Gebruik Rekenrust voor overzicht; inhoudelijk advies blijft persoonlijk maatwerk.</small></span></div><small>Reageer nooit met wachtwoorden, API-sleutels of volledige betaalgegevens in een bericht.</small></section>;
}

function LiveReadinessCard() {
  const [readiness, setReadiness] = useState<LiveReadiness | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadReadiness(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/readiness");
      const data = await response.json() as { readiness?: LiveReadiness; error?: string };
      if (!response.ok || !data.readiness) throw new Error(data.error ?? "Livegang-check is niet gelukt.");
      setReadiness(data.readiness);
    } catch {
      setReadiness({
        ok: false,
        score: 0,
        storageMode: "local",
        checkedAt: new Date().toISOString(),
        message: "De livegang-check kon niet worden uitgevoerd.",
        nextAction: "Open Instellingen opnieuw of herstart Rekenrust en probeer de livegang-check nog een keer.",
        items: [],
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReadiness(false), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const score = loading ? 0 : readiness?.score ?? 0;
  const openItems = readiness?.items.filter((item) => !item.ok).slice(0, 3) ?? [];

  return <section className={readiness?.ok ? "card live-card live-card-ok" : "card live-card"}><p className="eyebrow">LIVEGANG-CHECK</p><div className="readiness-score"><strong>{loading ? "…" : `${score}%`}</strong><span>klaar</span></div><div className="progress-track"><span style={{ width: `${score}%` }}/></div><p>{loading ? "Rekenrust controleert de belangrijkste livegangpunten." : readiness?.message}</p>{!loading && readiness?.nextAction && <div className="live-next-action"><strong>Volgende actie</strong><span>{readiness.nextAction}</span></div>}{openItems.length > 0 && <div className="live-items">{openItems.map((item) => <div key={item.key}><span>{item.ok ? "✓" : "!"}</span><p><strong>{item.label}</strong>{item.detail}<small>{item.action}</small></p></div>)}</div>}<button type="button" className="secondary-button" onClick={() => void loadReadiness(true)} disabled={loading}>{loading ? "Controleren…" : "Opnieuw controleren"}</button></section>;
}

function StorageHealthCard() {
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadHealth(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/health");
      const data = await response.json() as StorageHealth;
      setHealth(data);
    } catch {
      setHealth({
        ok: false,
        storage: "local",
        database: "niet bereikbaar",
        fileStorage: "niet bereikbaar",
        bucket: null,
        configured: false,
        message: "De opslagstatus kon niet worden gecontroleerd.",
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHealth(false), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const title = health?.storage === "supabase" ? "Online opslag" : "Lokale opslag";
  const subtitle = health?.storage === "supabase" ? "Supabase" : "Deze computer";
  const status = loading ? "Controleren…" : health?.ok ? "In orde" : "Aandacht nodig";

  return <section className={health?.ok ? "card storage-card storage-card-ok" : "card storage-card storage-card-warning"}><p className="eyebrow">OPSLAGSTATUS</p><h2>{title}</h2><p>{loading ? "Rekenrust controleert waar je gegevens worden bewaard." : health?.message}</p><div className="storage-status"><span>{status}</span><strong>{subtitle}</strong></div><div className="session-facts"><span><strong>{health?.database ?? "..."}</strong><small>Database</small></span><span><strong>{health?.fileStorage ?? "..."}</strong><small>{health?.bucket ? `Bonnenopslag: ${health.bucket}` : "Bonnenopslag"}</small></span></div><button type="button" className="secondary-button" onClick={() => void loadHealth(true)} disabled={loading}>{loading ? "Controleren…" : "Opnieuw controleren"}</button></section>;
}

function BackupCard() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [inspection, setInspection] = useState<BackupInspection | null>(null);

  async function checkBackup(showLoading = true) {
    if (showLoading) setChecking(true);
    try {
      const response = await fetch("/api/backup/status");
      const data = await response.json() as { status?: BackupInspection; error?: string };
      if (!response.ok || !data.status) throw new Error(data.error ?? "Back-upcontrole is niet gelukt.");
      setInspection(data.status);
    } catch (caught) {
      setInspection(null);
      setError(caught instanceof Error ? caught.message : "Back-upcontrole is niet gelukt.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void checkBackup(false), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    setMessage("");
    setError("");
    if (!window.confirm("Weet je zeker dat je deze back-up wilt terugzetten? Je huidige klanten, facturen, kosten en CRM-notities worden vervangen.")) return;
    setBusy(true);
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Terugzetten is niet gelukt.");
      setMessage("Back-up teruggezet. Rekenrust wordt opnieuw geladen…");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kies een geldig Rekenrust-back-upbestand.");
      setBusy(false);
    }
  }

  const backupStatus = checking ? "Controleren…" : inspection?.ok ? "Back-up lijkt goed" : "Aandacht nodig";
  const backupCounts = inspection ? `${inspection.counts.customers} klanten · ${inspection.counts.invoices} facturen · ${inspection.counts.expenses} kosten · ${inspection.counts.receiptFiles} bonnen` : "Nog geen controle uitgevoerd";

  return <div className="card backup-card"><p className="eyebrow">BACK-UP</p><h2>Administratie bewaren</h2><p>Download een gegevensbestand met klanten, facturen, kosten, bonbestanden, notities, acties en factuurinstellingen. Wachtwoorden en sessies zitten hier niet in.</p><div className={inspection?.ok ? "backup-check backup-check-ok" : "backup-check"}><div><span>{backupStatus}</span><strong>{backupCounts}</strong></div><button type="button" className="text-button" onClick={() => void checkBackup(true)} disabled={checking}>{checking ? "Bezig…" : "Controleer"}</button></div>{inspection?.message && <small className={inspection.ok ? "security-success" : "security-error"}>{inspection.message}</small>}{inspection?.warnings.slice(0, 2).map((warning) => <small className="security-error" key={warning}>{warning}</small>)}<a className="primary-button" href="/api/backup/export" download>Back-up downloaden</a><label className="restore-backup"><input type="file" accept="application/json" disabled={busy} onChange={(event) => void restoreBackup(event.target.files?.[0])}/><span>{busy ? "Terugzetten…" : "Back-up terugzetten"}</span></label>{message && <small className="security-success">{message}</small>}{error && <small className="security-error">{error}</small>}<small>Let op: met veel of grote bonnen kan het back-upbestand groter worden.</small></div>;
}

function PrivacyCard() {
  return <section className="card privacy-card"><p className="eyebrow">PRIVACY</p><h2>Gegevensbeheer in gewone taal</h2><p>Rekenrust bewaart alleen gegevens die nodig zijn om je administratie te gebruiken en je account veilig te laten werken.</p><div className="privacy-list"><div><strong>Wat bewaren we?</strong><span>Accountgegevens, bedrijfsgegevens, klanten, facturen, kosten, bonnetjes, notities en acties.</span></div><div><strong>Waarvoor?</strong><span>Om facturen te maken, btw te berekenen, kosten te bewaren en klantopvolging overzichtelijk te houden.</span></div><div><strong>Wat kun je zelf?</strong><span>Je gegevens aanpassen, een back-up downloaden, je wachtwoord wijzigen en overal uitloggen.</span></div><div><strong>Welke diensten helpen mee?</strong><span>Online gebruikt Rekenrust onder meer Vercel, Supabase, Resend en Mollie voor hosting, opslag, e-mail en betalingen.</span></div></div><Link className="secondary-button" href="/privacy" target="_blank">Privacyverklaring openen</Link><small>Deze uitleg is bedoeld voor transparantie. Laat de definitieve juridische tekst controleren voordat Rekenrust breed live gaat.</small></section>;
}

function SessionCard({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [sessions, setSessions] = useState<{ activeSessions: number; currentSessionExpiresAt: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSessions() {
      const response = await fetch("/api/auth/sessions");
      const data = await response.json() as { sessions?: { activeSessions: number; currentSessionExpiresAt: string | null }; error?: string };
      if (response.ok && data.sessions) setSessions(data.sessions);
      else setError(data.error ?? "Sessies konden niet worden geladen.");
    }
    void loadSessions();
  }, []);

  async function logoutEverywhere() {
    if (!window.confirm("Wil je echt overal uitloggen? Je komt daarna terug op het inlogscherm.")) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/sessions", { method: "DELETE" });
    if (response.ok) onLoggedOut();
    else {
      const data = await response.json() as { error?: string };
      setError(data.error ?? "Overal uitloggen is niet gelukt.");
      setBusy(false);
    }
  }

  const expiry = sessions?.currentSessionExpiresAt
    ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(sessions.currentSessionExpiresAt))
    : "onbekend";

  return <section className="card session-card"><p className="eyebrow">SESSIES</p><h2>Ingelogde apparaten</h2><p>Je blijft maximaal 7 dagen ingelogd. Log overal uit als je op een gedeelde computer hebt gewerkt.</p><div className="session-facts"><span><strong>{sessions?.activeSessions ?? "…"}</strong><small>actieve sessie{sessions?.activeSessions === 1 ? "" : "s"}</small></span><span><strong>{expiry}</strong><small>huidige sessie verloopt</small></span></div>{error && <p className="security-error">{error}</p>}<button className="secondary-button danger-button" disabled={busy} onClick={() => void logoutEverywhere()}>{busy ? "Uitloggen…" : "Overal uitloggen"}</button></section>;
}

function EmailVerificationCard() {
  const [email, setEmail] = useState("");
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadSession() {
      const response = await fetch("/api/auth/session");
      if (!response.ok) return;
      const data = await response.json() as { user: User };
      setEmail(data.user.email);
      setVerified(data.user.emailVerified);
    }
    void loadSession();
  }, []);

  async function requestCode() {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/auth/email-verification/request", { method: "POST" });
    const data = await response.json() as { verificationCode?: string; error?: string };
    if (!response.ok) setError(data.error ?? "Code maken is niet gelukt.");
    else {
      setCode(data.verificationCode ?? "");
      setMessage(data.verificationCode ? "Lokale testcode aangemaakt. In een online versie versturen we deze per e-mail." : "Bevestigingsmail klaargezet.");
    }
    setBusy(false);
  }

  async function confirmCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/email-verification/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: inputCode }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) setError(data.error ?? "Bevestigen is niet gelukt.");
    else {
      setVerified(true);
      setCode("");
      setInputCode("");
      setMessage("E-mailadres bevestigd.");
    }
    setBusy(false);
  }

  return <section className="card security-card"><p className="eyebrow">E-MAIL</p><h2>E-mailadres bevestigen</h2><p>{verified ? `${email || "Je e-mailadres"} is bevestigd.` : "Bevestig je e-mailadres. In deze lokale versie tonen we de testcode direct."}</p>{!verified && <><button className="secondary-button" type="button" disabled={busy} onClick={() => void requestCode()}>{busy ? "Code maken…" : "Bevestigingscode maken"}</button>{code && <p className="local-code">Testcode: <strong>{code}</strong></p>}<form onSubmit={confirmCode}><label><span>Bevestigingscode</span><input value={inputCode} onChange={(event) => setInputCode(event.target.value)} placeholder="Plak de code hier" /></label><button className="primary-button" disabled={busy || !inputCode.trim()}>E-mailadres bevestigen</button></form></>}{error && <p className="security-error">{error}</p>}{message && <p className="security-success">{message}</p>}</section>;
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== repeatPassword) {
      setError("De twee nieuwe wachtwoorden zijn niet gelijk.");
      return;
    }
    setSaving(true);
    const response = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) setError(data.error ?? "Wachtwoord wijzigen is niet gelukt.");
    else {
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      setMessage("Wachtwoord gewijzigd.");
    }
    setSaving(false);
  }

  return <form className="card security-card" onSubmit={submit}><p className="eyebrow">VEILIGHEID</p><h2>Wachtwoord wijzigen</h2><p>Gebruik dit als je vermoedt dat iemand je wachtwoord kent, of gewoon af en toe uit voorzorg.</p><label><span>Huidig wachtwoord</span><input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label><span>Nieuw wachtwoord</span><input required type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label><span>Nieuw wachtwoord herhalen</span><input required type="password" autoComplete="new-password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} /></label>{error && <p className="security-error">{error}</p>}{message && <p className="security-success">{message}</p>}<button className="primary-button" disabled={saving}>{saving ? "Bijwerken…" : "Wachtwoord opslaan"}</button><small>Minimaal 8 tekens. Kies iets dat je niet op andere plekken gebruikt.</small></form>;
}

function Expenses({ expenses, vat, onCreate, onEdit, onDelete }: { expenses: Expense[]; vat: VatSummary; onCreate: () => void; onEdit: (expense: Expense) => void; onDelete: (id: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Alle");
  const [error, setError] = useState("");
  const categories = Array.from(new Set(expenses.map((expense) => expense.category))).sort((a, b) => a.localeCompare(b, "nl"));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredExpenses = expenses.filter((expense) => {
    const matchesCategory = category === "Alle" || expense.category === category;
    const searchable = `${expense.supplier} ${expense.description} ${expense.category} ${expense.date} ${expense.vatRate}% ${euro(expense.amountInclCents)}`.toLowerCase();
    return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
  const resultText = filteredExpenses.length === expenses.length
    ? `${expenses.length} kosten`
    : `${filteredExpenses.length} van ${expenses.length} kosten gevonden`;

  async function removeExpense(expense: Expense) {
    setError("");
    if (!window.confirm(`Weet je zeker dat je de kostenpost van ${expense.supplier} wilt verwijderen?`)) return;
    try { await onDelete(expense.id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Verwijderen is niet gelukt."); }
  }

  return <><section className="page-heading"><div><p className="eyebrow">UITGAVEN</p><h1>Kosten</h1><p>Zakelijke aankopen, bonnetjes en betaalde btw op één plek.</p></div><button className="primary-button" onClick={onCreate}><Icon name="plus" size={18}/>Kosten invoeren</button></section><section className="expense-metrics"><div className="card"><span>Kosten in {vat.period}</span><strong>{euro(vat.expenseTotalCents)}</strong><small>Bedragen inclusief btw</small></div><div className="card"><span>Betaalde btw</span><strong>{euro(vat.paidVatCents)}</strong><small>Wordt verrekend in je btw-overzicht</small></div><div className="card"><span>Aantal uitgaven</span><strong>{expenses.length}</strong><small>In je volledige administratie</small></div></section>{expenses.length === 0 ? <EmptyAction icon="receipt" title="Je hebt nog geen kosten ingevoerd" body="Voer je eerste zakelijke aankoop in. Gebruik gewoon het totaalbedrag inclusief btw; Rekenrust rekent de btw zelf uit." actionLabel="Eerste kostenpost invoeren" onAction={onCreate} /> : <><div className="filter-row"><div className="search table-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek op leverancier, omschrijving of bedrag"/></div><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter op categorie"><option value="Alle">Alle categorieën</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><p className="filter-result">{resultText}</p>{error && <div className="editor-error">{error}</div>}<section className="card expense-table-card"><div className="card-header"><div><p className="eyebrow">RECENTE UITGAVEN</p><h2>Ingevoerde kosten</h2></div></div>{filteredExpenses.length === 0 ? <div className="empty-table"><Icon name="search" size={18}/><p>Geen kosten gevonden. Pas je zoekterm of filter aan.</p></div> : <div className="table-scroll"><table><thead><tr><th>LEVERANCIER</th><th>OMSCHRIJVING</th><th>CATEGORIE</th><th>DATUM</th><th>VERWERKING</th><th>BTW</th><th>BEDRAG</th><th>BON</th><th>ACTIES</th></tr></thead><tbody>{filteredExpenses.map((expense) => <tr key={expense.id}><td><strong>{expense.supplier}</strong></td><td>{expense.description}</td><td><span className="category-badge">{expense.category}</span></td><td>{expense.date}</td><td>{expense.depreciationYears > 1 ? <span className="category-badge">Afschrijving {expense.depreciationYears} jaar</span> : <span className="no-receipt">Directe kosten</span>}</td><td>{euro(expense.vatCents)} <small className="vat-rate">({expense.vatRate}%)</small></td><td><strong>{euro(expense.amountInclCents)}</strong></td><td>{expense.receiptName ? <a className="receipt-link" href={`/api/expenses/${expense.id}/receipt`} target="_blank" rel="noreferrer"><Icon name="receipt" size={14}/>Open bon</a> : <span className="no-receipt">Geen bon</span>}</td><td><div className="table-actions"><button onClick={() => onEdit(expense)}>Bewerken</button><button className="danger-link" onClick={() => void removeExpense(expense)}>Verwijderen</button></div></td></tr>)}</tbody></table></div>}</section></>}</>;
}

function YearEndChecklist({ invoices, expenses, vat, profitLoss, onViewInvoices, onCreateExpense, onViewExpenses, onViewProfit, onViewVat, onViewSettings }: { invoices: Invoice[]; expenses: Expense[]; vat: VatSummary; profitLoss: ProfitLossSummary | null; onViewInvoices: () => void; onCreateExpense: () => void; onViewExpenses: () => void; onViewProfit: () => void; onViewVat: () => void; onViewSettings: () => void }) {
  const year = profitLoss?.year ?? new Date().getFullYear();
  const finalInvoices = invoices.filter((invoice) => invoice.status !== "Concept");
  const conceptInvoices = invoices.filter((invoice) => invoice.status === "Concept");
  const missingReceipts = expenses.filter((expense) => !expense.receiptName);
  const vatHasNumbers = vat.receivedVatCents > 0 || vat.paidVatCents > 0;
  const profitHasNumbers = Boolean(profitLoss && (profitLoss.revenueCents > 0 || profitLoss.regularExpensesCents > 0 || profitLoss.depreciationCents > 0));
  const reserveCents = Math.max(vat.payableVatCents, 0) + Math.round(Math.max(profitLoss?.profitCents ?? 0, 0) * 0.3);
  const items: ChecklistItem[] = [
    { title: conceptInvoices.length === 0 ? "Facturen zijn definitief" : `${conceptInvoices.length} conceptfactuur${conceptInvoices.length === 1 ? "" : "en"} controleren`, description: conceptInvoices.length === 0 ? `${finalInvoices.length} factuur${finalInvoices.length === 1 ? "" : "en"} tellen mee voor je cijfers.` : "Conceptfacturen tellen nog niet mee voor omzet, btw en winst.", done: conceptInvoices.length === 0 && finalInvoices.length > 0, actionLabel: "Facturen openen", action: onViewInvoices },
    { title: expenses.length > 0 ? "Kosten zijn ingevoerd" : "Voer zakelijke kosten in", description: expenses.length > 0 ? `${expenses.length} kostenpost${expenses.length === 1 ? "" : "en"} staan klaar.` : "Kosten en bonnetjes maken je btw en winst veel vollediger.", done: expenses.length > 0, actionLabel: expenses.length > 0 ? "Kosten bekijken" : "Kosten invoeren", action: expenses.length > 0 ? onViewExpenses : onCreateExpense },
    { title: missingReceipts.length === 0 && expenses.length > 0 ? "Bonnetjes zijn compleet" : `${missingReceipts.length} bonnetje${missingReceipts.length === 1 ? "" : "s"} ontbreekt`, description: missingReceipts.length === 0 && expenses.length > 0 ? "Bij alle kosten staat een bewijsstuk." : "Voeg waar mogelijk een bon of pdf toe, zodat je later niets hoeft te zoeken.", done: expenses.length > 0 && missingReceipts.length === 0, actionLabel: "Bonnetjes nalopen", action: onViewExpenses },
    { title: vatHasNumbers ? "Btw-overzicht staat klaar" : "Btw-overzicht vullen", description: vatHasNumbers ? `${vat.period}: ${euro(Math.abs(vat.payableVatCents))} ${vat.payableVatCents >= 0 ? "te betalen" : "terug te krijgen"}.` : "Zodra facturen en kosten erin staan, rekent Rekenrust dit voor je uit.", done: vatHasNumbers, actionLabel: "Btw bekijken", action: onViewVat },
    { title: profitHasNumbers ? "Winst en verlies berekend" : "Winst en verlies opbouwen", description: profitHasNumbers ? `Conceptresultaat ${year}: ${euro(profitLoss?.profitCents ?? 0)}.` : "Dit overzicht ontstaat automatisch uit je facturen, kosten en afschrijvingen.", done: profitHasNumbers, actionLabel: "Winst bekijken", action: onViewProfit },
    { title: "Bedrijfsgegevens aanwezig", description: "Controleer naam, adres, KvK, btw-id en IBAN nog één keer voordat je rapporten deelt.", done: true, actionLabel: "Instellingen openen", action: onViewSettings },
  ];
  const completed = items.filter((item) => item.done).length;
  const percentage = Math.round(completed / items.length * 100);

  return <><section className="page-heading"><div><p className="eyebrow">AFRONDEN</p><h1>Jaarcheck {year}</h1><p>Een rustige controlelijst voordat je cijfers deelt of gebruikt voor je aangifte.</p></div><div className="year-actions"><a className="primary-button" href="/api/year-end/export" download={`concept-jaarcheck-${year}.pdf`}>Jaarcheck PDF</a><a className="secondary-button" href="/api/profit-loss/export" download={`concept-winst-en-verlies-${year}.pdf`}>Winst PDF</a><a className="secondary-button" href="/api/vat/export" download={`concept-btw-overzicht-${vat.period.toLowerCase().replace(/\s+/g, "-")}.pdf`}>Btw PDF</a></div></section><section className="card year-hero"><div><p className="eyebrow">VOORTGANG</p><h2>{completed} van {items.length} punten klaar</h2><p>{percentage === 100 ? "Mooi. Je administratie oogt compleet voor deze jaarcheck." : "Loop de open punten rustig langs. Rekenrust brengt je direct naar de juiste plek."}</p></div><div className="year-score"><strong>{percentage}%</strong><span>gereed</span><div className="progress-track"><span style={{ width: `${percentage}%` }}/></div></div></section><section className="year-summary-grid"><div className="card summary-card"><p>Definitieve facturen</p><strong>{finalInvoices.length}</strong><span>Concepten tellen nog niet mee</span></div><div className="card summary-card"><p>Kosten zonder bon</p><strong>{missingReceipts.length}</strong><span>Handig om nog te controleren</span></div><div className="card summary-card dark-summary"><p>Apart te houden</p><strong>{euro(reserveCents)}</strong><span>Btw plus grove winstbelasting</span></div></section><section className="card year-check-card"><div className="card-header"><div><p className="eyebrow">CHECKLIST</p><h2>Wat moet nog gebeuren?</h2></div></div><div className="year-check-list">{items.map((item) => <div className={item.done ? "year-check-item done" : "year-check-item"} key={item.title}><span className="start-check"><Icon name="check" size={13}/></span><div><strong>{item.title}</strong><small>{item.description}</small></div><button className={item.done ? "text-button" : "secondary-button"} onClick={item.action}>{item.actionLabel}</button></div>)}</div></section><div className="notice"><span>i</span><p><strong>Goed om te weten</strong>Deze jaarcheck is een praktische voorbereiding. Een boekhouder of fiscalist kan daarna beoordelen of alles fiscaal precies klopt.</p></div></>;
}

function ProfitLoss() {
  const [summary, setSummary] = useState<ProfitLossSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfitLoss() {
      const response = await fetch("/api/profit-loss");
      const data = await response.json() as { profitLoss?: ProfitLossSummary; error?: string };
      if (response.ok && data.profitLoss) setSummary(data.profitLoss);
      else setError(data.error ?? "De winst- en verliesrekening kon niet worden geladen.");
    }
    void loadProfitLoss();
  }, []);

  if (!summary && !error) return <div className="detail-loading"><span className="loading-spinner"/>Winst en verlies worden berekend…</div>;
  if (!summary) return <div className="editor-error">{error}</div>;
  const resultLabel = summary.profitCents >= 0 ? "winst" : "verlies";
  return <><section className="page-heading"><div><p className="eyebrow">RESULTAAT</p><h1>Winst- en verliesrekening</h1><p>Conceptoverzicht voor {summary.year}, zonder btw-bedragen.</p></div><a className="secondary-button" href="/api/profit-loss/export" download={`concept-winst-en-verlies-${summary.year}.pdf`}>Download PDF</a></section><section className={summary.profitCents >= 0 ? "profit-hero card" : "profit-hero profit-loss-negative card"}><div><p className="eyebrow">RESULTAAT {summary.year}</p><h2>{euro(Math.abs(summary.profitCents))} {resultLabel}</h2><p>Omzet min gewone kosten en afschrijvingen. Dit is een praktisch conceptoverzicht, geen definitieve fiscale aangifte.</p></div><span>{euro(summary.profitCents)}</span></section><section className="profit-grid"><div className="card summary-card"><p>Omzet zonder btw</p><strong>{euro(summary.revenueCents)}</strong><span>Verstuurde en betaalde verkoopfacturen</span></div><div className="card summary-card"><p>Gewone kosten</p><strong>− {euro(summary.regularExpensesCents)}</strong><span>Direct aftrekbare kosten zonder btw</span></div><div className="card summary-card"><p>Afschrijvingen</p><strong>− {euro(summary.depreciationCents)}</strong><span>Jaarbedrag van investeringen</span></div></section><div className="notice"><span>i</span><p><strong>Hoe zie je afschrijvingen terug?</strong>Een investering telt niet in één keer volledig mee als kosten. Rekenrust verdeelt het bedrag zonder btw over 5 of 10 jaar en zet alleen het jaarbedrag in deze winst- en verliesrekening.</p></div><section className="card expense-table-card"><div className="card-header"><div><p className="eyebrow">AFSCHRIJVINGEN</p><h2>Investeringen die over meerdere jaren lopen</h2></div><span className="category-badge">{euro(summary.investmentPurchasesCents)} nieuwe investeringen dit jaar</span></div>{summary.depreciationRows.length === 0 ? <div className="empty-table"><Icon name="check" size={18}/><p>Nog geen kostenposten met afschrijving ingevoerd.</p></div> : <div className="table-scroll"><table><thead><tr><th>INVESTERING</th><th>AANSCHAFJAAR</th><th>LOOPTIJD</th><th>AANSCHAF EXCL. BTW</th><th>AFSCHRIJVING DIT JAAR</th><th>NOG TE GAAN</th></tr></thead><tbody>{summary.depreciationRows.map((row) => <tr key={row.id}><td><strong>{row.supplier}</strong><br/><small className="vat-rate">{row.description}</small></td><td>{row.purchaseYear}</td><td>{row.depreciationYears} jaar</td><td>{euro(row.purchaseAmountExclCents)}</td><td><strong>{euro(row.currentYearDepreciationCents)}</strong></td><td>{row.remainingYears} jaar</td></tr>)}</tbody></table></div>}</section></>;
}

function VatOverview({ vat, profitLoss, onViewProfit }: { vat: VatSummary; profitLoss: ProfitLossSummary | null; onViewProfit: () => void }) {
  const isPayable = vat.payableVatCents >= 0;
  const resultTitle = isPayable ? "Af te dragen btw" : "Terug te vragen btw";
  const resultAmount = euro(Math.abs(vat.payableVatCents));
  const vatToPayCents = Math.max(vat.payableVatCents, 0);
  const estimatedIncomeTaxCents = Math.round(Math.max(profitLoss?.profitCents ?? 0, 0) * 0.3);
  const totalTaxReserveCents = vatToPayCents + estimatedIncomeTaxCents;
  const hasProfitLoss = Boolean(profitLoss);
  return <>
    <section className="page-heading"><div><p className="eyebrow">BELASTINGEN</p><h1>Btw-overzicht</h1><p>Conceptberekening voor {vat.period}, uitgelegd in gewone taal.</p></div><a className="secondary-button" href="/api/vat/export" download={`concept-btw-overzicht-${vat.period.toLowerCase().replace(/\s+/g, "-")}.pdf`}>Download PDF</a></section>
    <section className={isPayable ? "vat-hero card" : "vat-hero vat-hero-refund card"}>
      <div><p className="eyebrow">BELANGRIJKSTE BEDRAG</p><h2>{resultTitle}: {resultAmount}</h2><p>{isPayable ? "Dit is de btw die je volgens Rekenrust moet afdragen voor deze periode." : "Je hebt in deze periode meer btw betaald op kosten dan ontvangen op verkoopfacturen."} Dit blijft een concept tot je de aangifte controleert.</p></div>
      <span className="vat-hero-amount">{resultAmount}</span>
    </section>
    <div className="notice"><span>i</span><p><strong>Controleer vóór je indient</strong>Dit is een concept op basis van je opgeslagen facturen en kosten. Conceptfacturen tellen nog niet mee.</p></div>
    <section className="vat-summary-grid"><div className="card summary-card"><p>Btw op verkoopfacturen</p><strong>{euro(vat.receivedVatCents)}</strong><span>Deze btw heb je bij klanten in rekening gebracht</span></div><div className="card summary-card"><p>Kosten zonder btw</p><strong>{euro(vat.expenseExclTotalCents)}</strong><span>{vat.expenseCount} kostenpost{vat.expenseCount === 1 ? "" : "en"} in {vat.period}</span></div><div className="card summary-card"><p>Btw op kosten</p><strong>− {euro(vat.paidVatCents)}</strong><span>Deze voorbelasting mag je vaak verrekenen</span></div><div className="card summary-card dark-summary"><p>{resultTitle}</p><strong>{resultAmount}</strong><span>{vat.period}</span></div></section>
    <section className="card reserve-card"><div className="reserve-main"><span className="reserve-icon">€</span><div><p className="eyebrow">BELASTINGPOTJE</p><h2>{euro(totalTaxReserveCents)} apart houden</h2><p>Dit is een rustige indicatie: af te dragen btw plus een grove schatting voor inkomstenbelasting. Bij een btw-teruggave telt Rekenrust de btw hier niet als te betalen bedrag mee.</p></div></div><div className="reserve-breakdown"><span><small>Af te dragen btw</small><strong>{euro(vatToPayCents)}</strong></span><span><small>Geschatte inkomstenbelasting</small><strong>{hasProfitLoss ? euro(estimatedIncomeTaxCents) : "Nog onbekend"}</strong></span><span><small>Totaal belastingpotje</small><strong>{euro(totalTaxReserveCents)}</strong></span></div><div className="reserve-actions"><button className="text-button" onClick={onViewProfit}>Winst bekijken <Icon name="arrow" size={15}/></button></div></section>
    <section className="vat-steps card"><div className="card-header"><div><p className="eyebrow">ZO REKENT REKENRUST</p><h2>Van facturen naar btw-bedrag</h2></div></div><div className="vat-step-list"><div><span>1</span><strong>Verkoopfacturen</strong><p>Rekenrust telt de btw op je verstuurde en betaalde verkoopfacturen bij elkaar op.</p></div><div><span>2</span><strong>Zakelijke kosten</strong><p>Daarna trekt Rekenrust de btw af die je hebt betaald op ingevoerde kosten en bonnetjes.</p></div><div><span>3</span><strong>Uitkomst</strong><p>Het verschil is het bedrag dat je waarschijnlijk moet betalen of terugkrijgt.</p></div></div></section>
    <div className="vat-explanation card"><span className="round-icon">%</span><div><h2>De rekensom</h2><p>Btw op verkoopfacturen min btw op kosten. Dit rapport kun je downloaden als pdf voor je eigen controle of overleg met je boekhouder.</p></div><strong>{euro(vat.receivedVatCents)} − {euro(vat.paidVatCents)} = {resultAmount} {isPayable ? "af te dragen" : "terug te vragen"}</strong></div>
    <section className="vat-help-grid"><div className="card vat-help-card"><h2>Wat betekent “ontvangen btw”?</h2><p>Dat is de btw die jij op verkoopfacturen aan klanten hebt berekend. Die btw is niet echt omzet; je draagt die normaal gesproken af.</p></div><div className="card vat-help-card"><h2>Wat betekent “voorbelasting”?</h2><p>Dat is btw die jij op zakelijke kosten hebt betaald. Die mag je vaak verrekenen met de btw die je hebt ontvangen.</p></div></section>
  </>;
}

function ExpenseEditor({ onCancel, onSave, expense }: { onCancel: () => void; onSave: (input: ExpenseInput) => Promise<void>; expense?: Expense }) {
  const [supplier, setSupplier] = useState(expense?.supplier ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [category, setCategory] = useState(expense?.category ?? "Software");
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(expense ? (expense.amountInclCents / 100).toFixed(2).replace(".", ",") : "");
  const [vatRate, setVatRate] = useState<VatRate>(expense?.vatRate ?? 21);
  const [depreciationYears, setDepreciationYears] = useState(expense?.depreciationYears ?? 1);
  const [receipt, setReceipt] = useState<{ name: string; mimeType: string; data: string; size: number } | null>(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const amountCents = parseEuro(amount);
  const calculated = useMemo(() => calculateExpense(amountCents, vatRate), [amountCents, vatRate]);
  const expenseReady = supplier.trim().length > 0 && description.trim().length > 0 && amountCents > 0;
  const expenseHint = !supplier.trim()
    ? "Begin met de naam van de leverancier, bijvoorbeeld de winkel of softwarepartij."
    : !description.trim()
      ? "Geef kort aan wat je hebt gekocht. Dat maakt terugzoeken later makkelijker."
      : amountCents === 0
        ? "Vul het totaalbedrag in dat op de bon staat, inclusief btw."
        : "Controleer rechts de btw-berekening. Na opslaan telt deze kostenpost mee in je btw-overzicht.";

  async function chooseReceipt(file?: File) {
    setError("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Het bonnetje mag maximaal 5 MB groot zijn."); return; }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"];
    if (!allowed.includes(file.type)) { setError("Kies een pdf, jpg, png of foto van je bon."); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Het bonnetje kon niet worden gelezen."));
      reader.readAsDataURL(file);
    });
    setRemoveExistingReceipt(false);
    setReceipt({ name: file.name, mimeType: file.type, data: dataUrl.split(",")[1] ?? "", size: file.size });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try { await onSave({ supplier, description, category, expenseDate, amountInclCents: parseEuro(amount), vatRate, depreciationYears, receipt: receipt ? { name: receipt.name, mimeType: receipt.mimeType, data: receipt.data } : undefined, removeReceipt: removeExistingReceipt }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Opslaan is niet gelukt."); setSaving(false); }
  }

  return <div className="editor-page expense-editor-page"><header className="editor-header"><div><button className="back-button" onClick={onCancel}>←</button><div><p className="eyebrow">{expense ? "KOSTEN BEWERKEN" : "NIEUWE UITGAVE"}</p><h1>{expense ? "Kostenpost aanpassen" : "Zakelijke kosten invoeren"}</h1></div></div><div><button className="secondary-button" onClick={onCancel}>Annuleren</button><button className="primary-button" form="expense-form" disabled={saving || !expenseReady}>{saving ? "Veilig opslaan…" : expense ? "Wijzigingen opslaan" : "Kosten opslaan"}</button></div></header>{error && <div className="editor-error">{error}</div>}<div className="invoice-helper expense-helper card"><Icon name={expenseReady ? "check" : "receipt"} size={18}/><p><strong>{expenseReady ? "Deze kostenpost is klaar om op te slaan." : "Neem rustig je bon over."}</strong>{expenseHint}</p></div><div className="expense-editor-grid"><form id="expense-form" className="card expense-form" onSubmit={submit}><div className="form-section"><h2>Wat heb je gekocht?</h2><p className="form-help">Neem de gegevens over van je bon of factuur. Je hoeft hier geen boekhoudkundige omschrijving van te maken.</p><div className="form-grid"><label><span>Leverancier</span><input required autoFocus value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Bijvoorbeeld Adobe" /></label><label><span>Categorie</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Software</option><option>Reiskosten</option><option>Kantoor</option><option>Apparatuur</option><option>Marketing</option><option>Advies</option><option>Overig</option></select></label><label className="wide-field"><span>Omschrijving</span><input required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Bijvoorbeeld maandabonnement" /></label></div></div><div className="form-section"><h2>Wat stond er op de bon?</h2><p className="form-help">Vul het totaalbedrag inclusief btw in. Dat is meestal het bedrag dat je hebt betaald.</p><div className="form-grid"><label><span>Datum</span><input required type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label><label><span>Bedrag inclusief btw</span><div className="currency-input large"><span>€</span><input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></div></label><label className="wide-field"><span>Btw-tarief</span><div className="vat-choice">{([21, 9, 0] as VatRate[]).map((rate) => <button type="button" key={rate} className={vatRate === rate ? "selected" : ""} onClick={() => setVatRate(rate)}>{rate === 0 ? "Geen btw" : `${rate}% btw`}</button>)}</div></label></div><div className="invoice-mini-note"><Icon name="check" size={15}/><span>Weet je het btw-tarief niet zeker? Kijk op de bon. Staat er geen btw op, kies dan “Geen btw”.</span></div></div><div className="form-section"><h2>Hoe telt dit mee voor je winst?</h2><p className="form-help">Kleine of terugkerende kosten tel je meestal direct mee. Grotere aankopen zoals laptop, machine of camera kun je verdelen over meerdere jaren.</p><div className="depreciation-choice">{([1, 5, 10] as const).map((years) => <button type="button" key={years} className={depreciationYears === years ? "selected" : ""} onClick={() => setDepreciationYears(years)}><strong>{years === 1 ? "Directe kosten" : `${years} jaar afschrijven`}</strong><small>{years === 1 ? "Volledig in dit jaar" : `${euro(Math.round(calculated.amountExclCents / years))} per jaar`}</small></button>)}</div></div><div className="form-section"><h2>Bonnetje bewaren <small className="optional-label">optioneel</small></h2><p className="form-help">Voeg een foto of pdf toe. Dan heb je het bewijsstuk later meteen bij de hand.</p>{expense?.receiptName && !receipt && !removeExistingReceipt && <div className="existing-receipt"><Icon name="check" size={15}/><span><strong>Huidig bonnetje blijft bewaard</strong><small>{expense.receiptName}</small></span><button type="button" onClick={() => setRemoveExistingReceipt(true)}>Verwijderen</button></div>}<label className={`receipt-upload ${receipt ? "has-receipt" : ""}`}><input type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif" onChange={(event) => void chooseReceipt(event.target.files?.[0])}/><span className="receipt-upload-icon"><Icon name={receipt ? "check" : "plus"} size={18}/></span><span><strong>{receipt ? receipt.name : expense?.receiptName && !removeExistingReceipt ? "Bonnetje vervangen" : "Kies een foto of pdf"}</strong><small>{receipt ? `${(receipt.size / 1024).toFixed(0)} KB · klaar om op te slaan` : "Pdf, jpg of png · maximaal 5 MB"}</small></span></label>{receipt && <button type="button" className="remove-receipt" onClick={() => setReceipt(null)}>Nieuw bonnetje verwijderen</button>}{removeExistingReceipt && !receipt && <button type="button" className="remove-receipt" onClick={() => setRemoveExistingReceipt(false)}>Bestaand bonnetje toch behouden</button>}</div></form><aside className="card expense-preview"><p className="eyebrow">BEREKENING</p><span className="expense-preview-icon"><Icon name="receipt" size={24}/></span><h2>{supplier || "Leverancier"}</h2><p>{description || "Omschrijving van de uitgave"}</p><div className="expense-calculation"><p><span>Bedrag zonder btw</span><strong>{euro(calculated.amountExclCents)}</strong></p><p><span>Betaalde btw ({vatRate}%)</span><strong>{euro(calculated.vatCents)}</strong></p><p className="expense-total"><span>Totaal op de bon</span><strong>{euro(calculated.amountInclCents)}</strong></p></div>{calculated.vatCents > 0 ? <div className="expense-vat-impact"><strong>{euro(calculated.vatCents)}</strong><span>gaat mee als betaalde btw in je btw-overzicht</span></div> : <div className="expense-vat-impact muted"><strong>Geen btw</strong><span>deze kostenpost verlaagt je btw-bedrag niet</span></div>}<div className="expense-vat-impact muted"><strong>{depreciationYears === 1 ? "Directe kosten" : `${euro(Math.round(calculated.amountExclCents / depreciationYears))} per jaar`}</strong><span>{depreciationYears === 1 ? "komt volledig in de winst- en verliesrekening" : `wordt als afschrijving over ${depreciationYears} jaar verdeeld`}</span></div>{receipt ? <div className="preview-receipt"><Icon name="check" size={15}/><span><strong>Nieuw bonnetje toegevoegd</strong><small>{receipt.name}</small></span></div> : expense?.receiptName && !removeExistingReceipt ? <div className="preview-receipt"><Icon name="check" size={15}/><span><strong>Bonnetje bewaard</strong><small>{expense.receiptName}</small></span></div> : null}<div className="preview-tip"><Icon name="check" size={16}/><p>Na opslaan verschijnt deze kostenpost direct in je kostenlijst, btw-overzicht en winst- en verliesrekening.</p></div></aside></div></div>;
}

function InvoiceEditor({ customers, defaults, onCancel, onSave, invoice }: { customers: Customer[]; defaults: { paymentTerm: number; vatRate: VatRate; footer: string; logo: string }; onCancel: () => void; onSave: (draft: InvoiceDraft) => Promise<void>; invoice?: InvoiceDetailData }) {
  const initialPaymentTerm = invoice ? Math.round((new Date(`${invoice.dueDate}T12:00:00`).getTime() - new Date(`${invoice.issueDate}T12:00:00`).getTime()) / 86400000) : defaults.paymentTerm;
  const [customerId, setCustomerId] = useState(invoice?.customer.id ?? customers[0]?.id ?? "");
  const [lines, setLines] = useState<InvoiceLine[]>(invoice?.lines.map((line) => ({ ...line })) ?? [{ id: crypto.randomUUID(), description: "Strategisch advies", quantity: 1, unitPriceCents: 100000, vatRate: defaults.vatRate }]);
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? new Date().toISOString().slice(0, 10));
  const [paymentTerm, setPaymentTerm] = useState([7, 14, 30, 60].includes(initialPaymentTerm) ? initialPaymentTerm : 14);
  const [invoiceFooter, setInvoiceFooter] = useState(invoice?.company.invoiceFooter ?? defaults.footer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const totals = useMemo(() => calculateInvoice(lines), [lines]);
  const customer = customers.find((item) => item.id === customerId) ?? customers[0];
  const dueDate = useMemo(() => { const date = new Date(`${issueDate}T12:00:00`); date.setDate(date.getDate() + paymentTerm); return date.toISOString().slice(0, 10); }, [issueDate, paymentTerm]);
  const incompleteLineCount = lines.filter((line) => !line.description.trim() || line.quantity <= 0 || line.unitPriceCents <= 0).length;
  const invoiceReady = Boolean(customerId) && incompleteLineCount === 0 && totals.totalCents > 0;
  const nextHint = !customerId
    ? "Voeg eerst een klant toe via Klanten. Daarna kun je hier een factuur maken."
    : incompleteLineCount > 0
      ? incompleteLineCount === 1 ? "Controleer de factuurregel: omschrijving, aantal en prijs moeten ingevuld zijn." : `Controleer ${incompleteLineCount} factuurregels: omschrijving, aantal en prijs moeten ingevuld zijn.`
      : totals.totalCents === 0
        ? "Vul minimaal één regel met omschrijving, aantal en prijs in."
      : "Controleer de voorbeeldfactuur rechts. Opslaan maakt eerst een veilig concept.";

  function updateLine(id: string, patch: Partial<InvoiceLine>) { setLines(lines.map((line) => line.id === id ? { ...line, ...patch } : line)); }
  async function save() { if (!invoiceReady) { setError(nextHint); return; } setSaving(true); setError(""); try { await onSave({ customerId, issueDate, dueDate, invoiceFooter, lines: lines.map((line) => ({ ...line, description: line.description.trim() })) }); } catch (caught) { setError(caught instanceof Error ? caught.message : "Opslaan is niet gelukt."); setSaving(false); } }

  return <div className="editor-page"><header className="editor-header"><div><button className="back-button" onClick={onCancel}>←</button><div><p className="eyebrow">{invoice ? `CONCEPT ${invoice.id}` : "NIEUWE FACTUUR"}</p><h1>{invoice ? "Conceptfactuur bewerken" : "Factuur opstellen"}</h1></div></div><div><button className="secondary-button" onClick={onCancel}>Annuleren</button><button className="primary-button" onClick={save} disabled={saving || !invoiceReady}>{saving ? "Veilig opslaan…" : invoice ? "Wijzigingen opslaan" : "Opslaan als concept"}</button></div></header>{error && <div className="editor-error">{error}</div>}<div className="invoice-helper card"><Icon name={invoiceReady ? "check" : "file"} size={18}/><p><strong>{invoiceReady ? "Deze factuur is klaar om als concept op te slaan." : "Je bent er bijna."}</strong>{nextHint}</p></div><div className="editor-grid"><section className="card form-card"><div className="form-section"><h2>Factuurgegevens</h2><p className="form-help">Kies de klant en datum. Rekenrust bepaalt automatisch het factuurnummer en de vervaldatum.</p><div className="form-grid"><label><span>Klant</span><select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>{customers.length === 0 && <option value="">Nog geen klant toegevoegd</option>}{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>Factuurnummer</span><input value={invoice?.id ?? "Wordt automatisch bepaald"} readOnly/></label><label><span>Factuurdatum</span><input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)}/></label><label><span>Betaaltermijn</span><select value={paymentTerm} onChange={(event) => setPaymentTerm(Number(event.target.value))}><option value="7">7 dagen</option><option value="14">14 dagen</option><option value="30">30 dagen</option><option value="60">60 dagen</option></select></label></div><div className="invoice-mini-note"><Icon name="check" size={15}/><span>Vervaldatum: <strong>{new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${dueDate}T12:00:00`))}</strong></span></div></div><div className="form-section"><div className="section-title"><div><h2>Wat heb je geleverd?</h2><p className="form-help">Vul per regel in wat je hebt gedaan of verkocht. De prijs is exclusief btw; het totaal inclusief btw zie je rechts.</p></div><span>Bedragen exclusief btw</span></div><div className="line-labels"><span>OMSCHRIJVING</span><span>AANTAL</span><span>PRIJS</span><span>BTW</span><span /></div>{lines.map((line) => <div className="invoice-line" key={line.id}><textarea aria-label="Omschrijving" placeholder="Bijvoorbeeld advies, ontwerp of training" value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })}/><input aria-label="Aantal" type="number" min="0" step="0.5" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })}/><div className="currency-input"><span>€</span><input aria-label="Prijs" defaultValue={(line.unitPriceCents / 100).toFixed(2).replace(".", ",")} onBlur={(e) => updateLine(line.id, { unitPriceCents: parseEuro(e.target.value) })}/></div><select aria-label="Btw" value={line.vatRate} onChange={(e) => updateLine(line.id, { vatRate: Number(e.target.value) as 0 | 9 | 21 })}><option value="21">21%</option><option value="9">9%</option><option value="0">0%</option></select><button className="trash-button" disabled={lines.length === 1} onClick={() => setLines(lines.filter(l => l.id !== line.id))}><Icon name="trash" size={17}/></button></div>)}<button className="add-line" onClick={() => setLines([...lines, { id: crypto.randomUUID(), description: "", quantity: 1, unitPriceCents: 0, vatRate: defaults.vatRate }])}><Icon name="plus" size={17}/>Factuurregel toevoegen</button><div className="invoice-mini-note"><Icon name="check" size={15}/><span>Twijfel je over het btw-tarief? Je standaardtarief is {defaults.vatRate}%, maar je kunt dit per regel aanpassen.</span></div></div><div className="form-section"><label className="notes"><span>Standaardtekst op de factuur</span><textarea value={invoiceFooter} onChange={(event) => setInvoiceFooter(event.target.value)} maxLength={240}/><small>Deze tekst komt onderaan deze factuur. Je kunt de standaardtekst wijzigen via Instellingen.</small></label></div></section><aside className="card preview-card"><InvoiceBrand logo={invoice?.company.invoiceLogo ?? defaults.logo} variant="preview" /><div className="invoice-status-note"><span>Concept</span><p>Deze factuur telt pas mee voor omzet en btw nadat je hem als verstuurd markeert.</p></div><div className="preview-title"><div><span>FACTUUR</span><strong>{invoice?.id ?? "Volgend nummer"}</strong></div><div><span>FACTUURDATUM</span><strong>{new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${issueDate}T12:00:00`))}</strong></div></div><div className="preview-address"><span>FACTUUR AAN</span><strong>{customer?.name ?? "Kies eerst een klant"}</strong><p>{customer ? <>{customer.contact && <>{customer.contact}<br/></>}{customer.street}<br/>{customer.postalCode} {customer.city}</> : "De klantgegevens verschijnen hier automatisch."}</p></div><div className="preview-lines">{lines.map(line => <div key={line.id}><span>{line.description || "Nieuwe regel"}<small>{line.quantity} × {euro(line.unitPriceCents)}</small></span><strong>{euro(Math.round(line.quantity * line.unitPriceCents))}</strong></div>)}</div><div className="totals"><p><span>Subtotaal</span><strong>{euro(totals.subtotalCents)}</strong></p>{Object.entries(totals.vatByRate).filter(([, amount]) => amount > 0).map(([rate, amount]) => <p key={rate}><span>Btw {rate}%</span><strong>{euro(amount)}</strong></p>)}<p className="grand-total"><span>Totaal</span><strong>{euro(totals.totalCents)}</strong></p></div><div className="payment-note"><Icon name="check" size={16}/><span>Betaling binnen {paymentTerm} dagen · totaal inclusief btw</span></div></aside></div></div>;
}
