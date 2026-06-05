-- ═══════════════════════════════════════════════════════════════════════════
-- INEMA FINANCIAL SOLUTIONS LTD — SUPABASE DATABASE SETUP
-- Run this entire file in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── EXTENSIONS ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── CLEAN UP (run only if resetting) ───────────────────────────────────────
-- drop table if exists repayment_schedules cascade;
-- drop table if exists loans cascade;
-- drop table if exists loan_applications cascade;
-- drop table if exists contact_messages cascade;
-- drop table if exists profiles cascade;

-- ─── PROFILES ────────────────────────────────────────────────────────────────
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text not null,
  email               text not null,
  phone               text not null,
  national_id         text unique,
  date_of_birth       date,
  gender              text check (gender in ('male', 'female')),
  marital_status      text check (marital_status in ('single', 'married', 'divorced', 'widowed')),
  residence_address   text,
  district            text,
  sector              text,
  employment_status   text check (employment_status in ('employed', 'self_employed', 'unemployed')),
  employer_name       text,
  monthly_income      numeric(15,2),
  bank_name           text,
  bank_account_number text,
  momo_number         text,
  role                text not null default 'client' check (role in ('client', 'admin', 'loan_officer')),
  crb_consent         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─── LOAN APPLICATIONS ───────────────────────────────────────────────────────
create table loan_applications (
  id                      uuid primary key default uuid_generate_v4(),
  application_number      text unique not null,
  client_id               uuid not null references profiles(id) on delete cascade,
  loan_type               text not null check (loan_type in ('salary_advance', 'quinzaine', 'school_fees', 'business')),
  requested_amount        numeric(15,2) not null,
  requested_term_months   int not null check (requested_term_months between 1 and 6),
  purpose                 text not null,
  status                  text not null default 'submitted'
                          check (status in ('draft','submitted','under_review','approved','rejected')),
  -- Documents checklist
  has_application_letter  boolean default false,
  has_id_copy             boolean default false,
  has_marital_certificate boolean default false,
  has_employment_letter   boolean default false,
  has_payslips            boolean default false,
  has_bank_statement      boolean default false,
  has_valuation_report    boolean default false,
  -- Consent
  fee_consent             boolean not null default false,
  crb_consent             boolean not null default false,
  -- Review
  reviewed_by             uuid references profiles(id),
  review_notes            text,
  reviewed_at             timestamptz,
  -- Approval
  approved_amount         numeric(15,2),
  approved_term_months    int,
  submitted_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ─── LOANS ───────────────────────────────────────────────────────────────────
create table loans (
  id                      uuid primary key default uuid_generate_v4(),
  loan_number             text unique not null,
  application_id          uuid references loan_applications(id),
  client_id               uuid not null references profiles(id) on delete cascade,
  loan_type               text not null check (loan_type in ('salary_advance', 'quinzaine', 'school_fees', 'business')),
  principal               numeric(15,2) not null,
  term_months             int not null,
  -- Rates
  monthly_interest_rate   numeric(5,4) not null default 0.05,   -- 5%
  upfront_fee_rate        numeric(5,4) not null default 0.04,   -- 4%
  vat_rate                numeric(5,4) not null default 0.18,   -- 18%
  late_payment_rate       numeric(5,4) not null default 0.05,   -- 5%
  -- Calculated amounts
  upfront_fee_amount      numeric(15,2) not null,   -- principal * 4%
  vat_amount              numeric(15,2) not null,   -- fee * 18%
  total_interest          numeric(15,2) not null,   -- principal * 5% * months
  total_repayment         numeric(15,2) not null,   -- principal + total_interest
  month1_payment          numeric(15,2) not null,   -- month 1: interest + fee + vat
  monthly_payment         numeric(15,2) not null,   -- months 2+: just interest
  -- Status
  status                  text not null default 'disbursed'
                          check (status in ('pending','under_review','approved','rejected','disbursed','active','completed','defaulted')),
  disbursed_at            timestamptz,
  due_date                timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ─── REPAYMENT SCHEDULES ─────────────────────────────────────────────────────
create table repayment_schedules (
  id                uuid primary key default uuid_generate_v4(),
  loan_id           uuid not null references loans(id) on delete cascade,
  client_id         uuid not null references profiles(id) on delete cascade,
  month_number      int not null,
  due_date          date not null,
  -- Amounts
  interest_amount   numeric(15,2) not null,    -- principal * 5%
  fee_amount        numeric(15,2) not null default 0,  -- only month 1: upfront_fee + vat
  total_due         numeric(15,2) not null,
  amount_paid       numeric(15,2) not null default 0,
  paid_at           timestamptz,
  -- Status
  status            text not null default 'upcoming'
                    check (status in ('upcoming', 'due', 'paid', 'overdue')),
  late_fee          numeric(15,2) not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  unique(loan_id, month_number)
);

-- ─── CONTACT MESSAGES ────────────────────────────────────────────────────────
create table contact_messages (
  id          uuid primary key default uuid_generate_v4(),
  full_name   text not null,
  phone       text not null,
  email       text,
  loan_type   text check (loan_type in ('salary_advance','quinzaine','school_fees','business','general')),
  message     text not null,
  is_read     boolean not null default false,
  replied_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
create index idx_applications_client    on loan_applications(client_id);
create index idx_applications_status    on loan_applications(status);
create index idx_loans_client           on loans(client_id);
create index idx_loans_status           on loans(status);
create index idx_repayment_loan         on repayment_schedules(loan_id);
create index idx_repayment_client       on repayment_schedules(client_id);
create index idx_repayment_status       on repayment_schedules(status);
create index idx_repayment_due_date     on repayment_schedules(due_date);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at        before update on profiles           for each row execute function update_updated_at();
create trigger applications_updated_at    before update on loan_applications  for each row execute function update_updated_at();
create trigger loans_updated_at           before update on loans              for each row execute function update_updated_at();

-- ─── AUTO-UPDATE REPAYMENT STATUS ────────────────────────────────────────────
-- Run this daily via Supabase cron or a scheduled function
create or replace function update_repayment_statuses()
returns void as $$
begin
  -- Mark as 'due' if due today
  update repayment_schedules
  set status = 'due'
  where status = 'upcoming'
    and due_date = current_date;

  -- Mark as 'overdue' if past due date and not paid
  update repayment_schedules
  set status = 'overdue',
      late_fee = total_due * 0.05
  where status in ('due', 'upcoming')
    and due_date < current_date
    and amount_paid < total_due;
end;
$$ language plpgsql;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
alter table profiles           enable row level security;
alter table loan_applications  enable row level security;
alter table loans              enable row level security;
alter table repayment_schedules enable row level security;
alter table contact_messages   enable row level security;

-- PROFILES: users see only their own
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

-- LOAN APPLICATIONS: clients see their own; admins see all
create policy "applications_select_own" on loan_applications
  for select using (
    auth.uid() = client_id
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin','loan_officer'))
  );
create policy "applications_insert_own" on loan_applications
  for insert with check (auth.uid() = client_id);
create policy "applications_update_admin" on loan_applications
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','loan_officer'))
  );

-- LOANS: clients see their own; admins see all
create policy "loans_select_own" on loans
  for select using (
    auth.uid() = client_id
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin','loan_officer'))
  );
create policy "loans_insert_admin" on loans
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','loan_officer'))
  );
create policy "loans_update_admin" on loans
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','loan_officer'))
  );

-- REPAYMENT SCHEDULES: clients see their own; admins see all
create policy "repayment_select_own" on repayment_schedules
  for select using (
    auth.uid() = client_id
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin','loan_officer'))
  );

-- CONTACT MESSAGES: anyone can insert; only admins can read
create policy "contact_insert_public" on contact_messages
  for insert with check (true);
create policy "contact_select_admin" on contact_messages
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ─── SEED DATA ───────────────────────────────────────────────────────────────
-- NOTE: Create the test user first via Supabase Auth dashboard or API
-- Email: test@inema.rw | Password: TestInema123!
-- Then run this after the user exists:

-- Replace 'YOUR-TEST-USER-UUID' with the actual UUID from auth.users
do $$
declare
  test_user_id uuid;
  test_loan_id uuid;
  app_id uuid;
begin
  -- Get test user (only if exists)
  select id into test_user_id from auth.users where email = 'test@inema.rw' limit 1;

  if test_user_id is null then
    raise notice 'Test user not found. Create user test@inema.rw first in Supabase Auth dashboard.';
    return;
  end if;

  -- Seed profile
  insert into profiles (id, full_name, email, phone, national_id, gender, marital_status,
    residence_address, district, employment_status, employer_name, monthly_income, momo_number, role)
  values (
    test_user_id, 'Jean Pierre Nkusi', 'test@inema.rw', '+250788123456',
    '1199880012345678', 'male', 'married',
    'KG 123 St, Kimironko', 'Gasabo', 'employed', 'Rwanda Development Board',
    450000, '+250788123456', 'client'
  ) on conflict (id) do nothing;

  -- Seed application
  insert into loan_applications (
    application_number, client_id, loan_type, requested_amount,
    requested_term_months, purpose, status, fee_consent, crb_consent,
    has_id_copy, has_payslips, has_bank_statement, has_employment_letter,
    submitted_at
  ) values (
    'INEMA-2025-0001', test_user_id, 'salary_advance', 1000000,
    3, 'Cover medical bills and emergency home repairs.', 'approved',
    true, true, true, true, true, true, now()
  ) returning id into app_id;

  test_loan_id := uuid_generate_v4();

  -- Seed approved loan: 1,000,000 for 3 months
  -- Month 1: 50,000 interest + 40,000 fee + 7,200 VAT = 97,200
  -- Months 2-3: 50,000 each
  -- Total repayment: 1,197,200
  insert into loans (
    id, loan_number, application_id, client_id, loan_type,
    principal, term_months,
    monthly_interest_rate, upfront_fee_rate, vat_rate, late_payment_rate,
    upfront_fee_amount, vat_amount, total_interest, total_repayment,
    month1_payment, monthly_payment,
    status, disbursed_at, due_date
  ) values (
    test_loan_id, 'LN-2025-0001', app_id, test_user_id, 'salary_advance',
    1000000, 3,
    0.05, 0.04, 0.18, 0.05,
    40000, 7200, 150000, 1197200,
    97200, 50000,
    'active', now(), now() + interval '3 months'
  );

  -- Seed repayment schedule
  insert into repayment_schedules (loan_id, client_id, month_number, due_date, interest_amount, fee_amount, total_due, amount_paid, status, paid_at)
  values
    -- Month 1: paid
    (test_loan_id, test_user_id, 1,
     (current_date - interval '2 months')::date,
     50000, 47200, 97200, 97200, 'paid', now() - interval '2 months'),
    -- Month 2: paid
    (test_loan_id, test_user_id, 2,
     (current_date - interval '1 month')::date,
     50000, 0, 50000, 50000, 'paid', now() - interval '1 month'),
    -- Month 3: upcoming
    (test_loan_id, test_user_id, 3,
     (current_date + interval '1 month')::date,
     50000, 0, 50000, 0, 'upcoming', null);

  raise notice 'Seed data inserted successfully for user %', test_user_id;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN DASHBOARD TABLES — Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── IMPORTED CLIENTS (from Excel) ───────────────────────────────────────
create table if not exists imported_clients (
  id                uuid primary key default uuid_generate_v4(),
  full_name         text not null,
  phone             text,
  nid               text,
  email             text,
  employer          text,
  address           text,
  bank_account      text,
  collateral        text,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ─── IMPORTED LOANS (from Excel) ─────────────────────────────────────────
create table if not exists imported_loans (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid references imported_clients(id) on delete cascade,
  client_name       text not null,
  principal         numeric(15,2) not null,
  loan_type         text default 'salary_advance',
  term_months       int,
  date_offered      date,
  repayment_date    date,
  total_due         numeric(15,2),
  amount_paid       numeric(15,2) default 0,
  outstanding       numeric(15,2),
  status            text default 'active' check (status in ('active','paid','overdue','partial')),
  collateral        text,
  has_installments  boolean default false,
  notes             text,
  source            text default 'excel',
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ─── INSTALLMENTS ────────────────────────────────────────────────────────
create table if not exists installments (
  id            uuid primary key default uuid_generate_v4(),
  loan_id       uuid references imported_loans(id) on delete cascade,
  client_name   text,
  num           int,
  amount        numeric(15,2),
  due_date      date,
  status        text default 'not paid' check (status in ('paid','not paid','partial','overdue')),
  amount_paid   numeric(15,2) default 0,
  paid_date     date,
  notes         text,
  created_at    timestamptz default now()
);

-- ─── EXPENSES ────────────────────────────────────────────────────────────
create table if not exists expenses (
  id          uuid primary key default uuid_generate_v4(),
  category    text not null,
  amount      numeric(15,2) not null,
  month       date not null,
  status      text default 'paid' check (status in ('paid','pending')),
  notes       text,
  created_at  timestamptz default now()
);

-- ─── TAX & COMPLIANCE DEADLINES ──────────────────────────────────────────
create table if not exists compliance_deadlines (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  description   text,
  deadline_date date not null,
  category      text check (category in ('tax','bnr','rssb','other')),
  is_recurring  boolean default true,
  recurrence    text,
  is_done       boolean default false,
  done_at       timestamptz,
  created_at    timestamptz default now()
);

-- ─── EXCEL UPLOAD LOG ────────────────────────────────────────────────────
create table if not exists excel_uploads (
  id            uuid primary key default uuid_generate_v4(),
  filename      text,
  uploaded_at   timestamptz default now(),
  records_count int,
  status        text default 'success',
  notes         text
);

-- ─── RLS FOR ADMIN TABLES ────────────────────────────────────────────────
alter table imported_clients enable row level security;
alter table imported_loans enable row level security;
alter table installments enable row level security;
alter table expenses enable row level security;
alter table compliance_deadlines enable row level security;
alter table excel_uploads enable row level security;

create policy "admin_only_clients" on imported_clients
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin_only_loans" on imported_loans
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin_only_installments" on installments
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin_only_expenses" on expenses
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin_only_deadlines" on compliance_deadlines
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "admin_only_uploads" on excel_uploads
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ─── SET YOUR ACCOUNT AS ADMIN ───────────────────────────────────────────
-- Run this after confirming your user UUID:
update profiles set role = 'admin' where email = 'iradukundacyusakevin@gmail.com';

-- ─── SEED COMPLIANCE DEADLINES ───────────────────────────────────────────
insert into compliance_deadlines (title, description, deadline_date, category, is_recurring, recurrence) values
('PAYE Declaration', 'Pay As You Earn - Devotha salary tax to RRA', '2026-07-15', 'tax', true, 'monthly_15th'),
('RSSB Pension', 'Employer + Employee pension contribution to RSSB', '2026-07-15', 'rssb', true, 'monthly_15th'),
('RSSB Maternity', 'Maternity leave contribution to RSSB', '2026-07-15', 'rssb', true, 'monthly_15th'),
('CBHI Contribution', 'Community Based Health Insurance contribution', '2026-07-15', 'rssb', true, 'monthly_15th'),
('VAT on Fees', '18% VAT on loan upfront fees collected', '2026-07-15', 'tax', true, 'monthly_15th'),
('BNR Q2 Report', 'BNR Quarterly Supervisory Report (Apr-Jun 2026)', '2026-07-30', 'bnr', true, 'quarterly'),
('CRB Monthly Report', 'Credit Reference Bureau monthly reporting', '2026-07-15', 'bnr', true, 'monthly_15th'),
('Corporate Income Tax', 'Annual CIT Declaration (0% rate - microfinance exemption until 2030)', '2027-03-31', 'tax', true, 'annual'),
('BNR Annual Report', 'Annual report to National Bank of Rwanda', '2027-03-31', 'bnr', true, 'annual'),
('CIT Quarterly Prepayment Q3', 'Quarterly income tax prepayment to RRA', '2026-09-30', 'tax', true, 'quarterly'),
('BNR Q3 Report', 'BNR Quarterly Supervisory Report (Jul-Sep 2026)', '2026-10-30', 'bnr', true, 'quarterly')
on conflict do nothing;
