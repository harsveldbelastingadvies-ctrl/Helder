-- Helder Supabase schema
-- Voer dit uit in Supabase SQL Editor voordat HELDER_STORAGE=supabase online wordt gebruikt.

create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  company_name text not null,
  company_type text not null default 'sole_proprietor' check (company_type in ('sole_proprietor', 'bv_dga', 'other')),
  street text not null default '',
  postal_code text not null default '',
  city text not null default '',
  kvk_number text not null default '',
  vat_number text not null default '',
  iban text not null default '',
  invoice_payment_term integer not null default 14 check (invoice_payment_term in (7, 14, 30, 60)),
  default_vat_rate integer not null default 21 check (default_vat_rate in (0, 9, 21)),
  invoice_footer text not null default 'Bedankt voor de fijne samenwerking.',
  invoice_logo text not null default '',
  plan_type text not null default 'basis' check (plan_type in ('basis', 'dga', 'begeleiding')),
  subscription_status text not null default 'trialing' check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  mollie_customer_id text,
  mollie_last_payment_id text,
  mollie_subscription_id text,
  subscription_activated_at timestamptz,
  email_verified_at timestamptz,
  email_verification_token_hash text,
  email_verification_expires_at bigint,
  password_reset_token_hash text,
  password_reset_expires_at bigint,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at bigint not null
);

create table if not exists customers (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  contact text not null,
  email text not null,
  street text not null,
  postal_code text not null,
  city text not null,
  revenue_cents integer not null default 0,
  initials text not null,
  color text not null default 'mint',
  created_at timestamptz not null default now()
);

create table if not exists invoices (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  customer_id text not null references customers(id) on delete restrict,
  issue_date date not null,
  due_date date not null,
  total_cents integer not null,
  status text not null check (status in ('Betaald', 'Openstaand', 'Concept', 'Te laat')),
  invoice_footer text not null default 'Bedankt voor de fijne samenwerking.',
  created_at timestamptz not null default now()
);

create table if not exists invoice_lines (
  id text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  description text not null,
  quantity numeric not null,
  unit_price_cents integer not null,
  vat_rate integer not null check (vat_rate in (0, 9, 21)),
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  supplier text not null,
  description text not null,
  category text not null,
  expense_date date not null,
  amount_incl_cents integer not null,
  vat_rate integer not null check (vat_rate in (0, 9, 21)),
  depreciation_years integer not null default 1 check (depreciation_years in (1, 5, 10)),
  receipt_name text,
  receipt_storage_name text,
  receipt_mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists customer_notes (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  customer_id text not null references customers(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists customer_tasks (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  customer_id text not null references customers(id) on delete cascade,
  title text not null,
  due_date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_id on sessions(user_id);
create index if not exists sessions_expires_at on sessions(expires_at);
create index if not exists customers_user_id on customers(user_id);
create index if not exists invoices_user_id on invoices(user_id);
create index if not exists invoices_customer_id on invoices(customer_id);
create index if not exists invoice_lines_invoice_id on invoice_lines(invoice_id);
create index if not exists expenses_user_id on expenses(user_id);
create index if not exists customer_notes_customer_id on customer_notes(customer_id);
create index if not exists customer_tasks_customer_id on customer_tasks(customer_id);

insert into storage.buckets (id, name, public)
values ('helder', 'helder', false)
on conflict (id) do nothing;

alter table users add column if not exists invoice_logo text not null default '';
alter table users add column if not exists company_type text not null default 'sole_proprietor';
alter table users add column if not exists plan_type text not null default 'basis';
alter table users add column if not exists subscription_status text not null default 'trialing';
alter table users add column if not exists trial_started_at timestamptz;
alter table users add column if not exists trial_ends_at timestamptz;
alter table users add column if not exists mollie_customer_id text;
alter table users add column if not exists mollie_last_payment_id text;
alter table users add column if not exists mollie_subscription_id text;
alter table users add column if not exists subscription_activated_at timestamptz;
alter table invoices add column if not exists invoice_footer text not null default 'Bedankt voor de fijne samenwerking.';
