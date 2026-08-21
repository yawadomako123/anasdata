-- ════════════════════════════════════════════════════════════
--  Anasdata — RESET + SETUP  (run in Supabase SQL Editor)
--
--  ⚠️  DESTRUCTIVE: Part 1 DROPS EVERY TABLE in the "public" schema
--      (your old tables). Only run this on a project you're happy to
--      wipe. If you want to KEEP some old tables, delete Part 1 and
--      only run Part 2.
--
--  Covers BOTH sales channels:
--    • Web (React storefront + Paystack)
--    • USSD (Arkesel + mobile-money)
-- ════════════════════════════════════════════════════════════

-- ── PART 1: drop all existing tables in the public schema ──────
do $$
declare r record;
begin
  for r in (select tablename from pg_tables where schemaname = 'public') loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
end $$;

-- ── PART 2: create the Anasdata schema ─────────────────────────

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  reference      text unique not null,           -- transaction reference
  bundle_id      text not null,
  bundle_name    text not null,
  network        text not null,                  -- mtn | airteltigo | telecel
  data           text not null,                  -- e.g. "10GB"
  price          numeric(10,2) not null,         -- GHS
  phone          text not null,                  -- number to LOAD the bundle to
  email          text,
  status         text not null default 'paid',   -- pending | paid | processing | done | failed
  channel        text not null default 'web',    -- web | ussd
  payment_method text,                           -- paystack | arkesel-momo
  payment_ref    text,                           -- gateway/merchant reference
  payer_phone    text,                           -- who paid (USSD dialer), if different
  created_at     timestamptz not null default now()
);

create index orders_status_idx  on public.orders (status);
create index orders_created_idx on public.orders (created_at desc);
create index orders_paymentref_idx on public.orders (payment_ref);

-- Row Level Security: the public gets NO access to customer data.
-- Edge Functions write with the service_role key (bypasses RLS);
-- only signed-in admins (you) can read and update.
alter table public.orders enable row level security;

create policy "admins can read orders"
  on public.orders for select to authenticated using (true);

create policy "admins can update orders"
  on public.orders for update to authenticated using (true) with check (true);

-- Public order tracking: returns ONE order for an exact reference only.
create or replace function public.get_order_by_reference(p_ref text)
returns table (
  reference text, bundle_name text, data text, network text,
  phone text, price numeric, status text, created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select reference, bundle_name, data, network, phone, price, status, created_at
  from public.orders
  where reference = p_ref
  limit 1;
$$;

grant execute on function public.get_order_by_reference(text) to anon, authenticated;

-- USSD session state. Arkesel sends only the latest keypress per request,
-- so the ussd Edge Function stores the menu position here between steps.
-- RLS on with no policies → only the service_role Edge Function can touch it.
create table public.ussd_sessions (
  session_id text primary key,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.ussd_sessions enable row level security;

-- Bundle catalogue (admin-editable, non-expiry). Public reads active rows;
-- only signed-in admins can read inactive ones or add/edit/delete.
-- NOTE: the seed rows live in add-bundles.sql so it can also be run on an
-- existing database. Run add-bundles.sql after this file for a fresh setup.
create table if not exists public.bundles (
  id         uuid primary key default gen_random_uuid(),
  network    text not null check (network in ('mtn','telecel')),
  name       text not null,
  data       text not null,
  data_value numeric not null default 0,
  price      numeric(10,2) not null,
  badge      text,
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bundles_network_idx on public.bundles (network);
create index if not exists bundles_active_idx  on public.bundles (active);
alter table public.bundles enable row level security;
create policy "public read active bundles" on public.bundles for select to anon using (active = true);
create policy "admins read all bundles"    on public.bundles for select to authenticated using (true);
create policy "admins insert bundles"      on public.bundles for insert to authenticated with check (true);
create policy "admins update bundles"      on public.bundles for update to authenticated using (true) with check (true);
create policy "admins delete bundles"      on public.bundles for delete to authenticated using (true);

-- Realtime so the admin dashboard updates the instant an order lands.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  After running this:
--  • Create your admin user: Authentication → Users → Add user
--    (email + password). Turn OFF public sign-ups in
--    Authentication → Providers → Email so only you can log in.
-- ════════════════════════════════════════════════════════════
