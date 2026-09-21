-- ════════════════════════════════════════════════════════════
--  Anasdata — RESULT / VOTING CHECKERS  (safe / additive)
--
--  Run once in the Supabase SQL Editor (project: guilqdqayfcwbxdmzhvl).
--  Nothing is dropped; safe to run more than once.
--
--  Adds a PIN-voucher product that sells alongside data bundles and
--  fulfils ITSELF the moment payment confirms — no admin loading.
--
--  SECURITY NOTE: `vouchers` holds unsold PINs, which ARE inventory
--  value. It has RLS enabled with NO policies, exactly like
--  ussd_sessions — so only Edge Functions holding the service_role key
--  can read or write it. A leaked or borrowed admin session must never
--  be able to dump unsold stock.
-- ════════════════════════════════════════════════════════════

-- ── 1. The product catalogue ────────────────────────────────
create table if not exists public.voucher_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                  -- e.g. "BECE Results Checker"
  description text,
  price       numeric(10,2) not null,         -- GHS
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.voucher_types enable row level security;

drop policy if exists "public read active voucher types" on public.voucher_types;
create policy "public read active voucher types"
  on public.voucher_types for select to anon using (active = true);

drop policy if exists "admins read all voucher types" on public.voucher_types;
create policy "admins read all voucher types"
  on public.voucher_types for select to authenticated using (true);
-- No write policies on purpose: types are managed through an Edge Function.

-- ── 2. The PIN stock ────────────────────────────────────────
create table if not exists public.vouchers (
  id             uuid primary key default gen_random_uuid(),
  type_id        uuid not null references public.voucher_types(id) on delete restrict,
  serial         text not null,
  pin            text not null,
  status         text not null default 'available',  -- available | reserved | sold | void
  order_id       uuid references public.orders(id) on delete set null,
  reserved_until timestamptz,
  sold_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (type_id, serial)
);

-- RLS on, ZERO policies → service_role only. Do not add policies here.
alter table public.vouchers enable row level security;

create index if not exists vouchers_pick_idx on public.vouchers (type_id, status, created_at);
create index if not exists vouchers_order_idx on public.vouchers (order_id);

-- ── 3. Orders learn about a second product type ─────────────
alter table public.orders add column if not exists product_type    text not null default 'data'; -- data | checker
alter table public.orders add column if not exists voucher_type_id uuid references public.voucher_types(id);
alter table public.orders add column if not exists delivery_token  text;        -- random; gates PIN retrieval
alter table public.orders add column if not exists delivered_at    timestamptz;
alter table public.orders add column if not exists delivery_error  text;

-- A checker has no network, no GB size and no bundle row.
alter table public.orders alter column network   drop not null;
alter table public.orders alter column data      drop not null;
alter table public.orders alter column bundle_id drop not null;

create index if not exists orders_product_idx on public.orders (product_type, status);
create index if not exists orders_delivery_token_idx on public.orders (delivery_token);

-- ── 4. Reserve ONE voucher for an order, atomically ─────────
--  Called BEFORE the customer is charged, so we never take money we
--  cannot fulfil. FOR UPDATE SKIP LOCKED is what stops two simultaneous
--  buyers being handed the same PIN. Idempotent per order.
create or replace function public.reserve_voucher(
  p_type_id uuid,
  p_order_id uuid,
  p_ttl_seconds int default 900
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- Already holding one for this order? Hand back the same one.
  select id into v_id from public.vouchers where order_id = p_order_id limit 1;
  if v_id is not null then return v_id; end if;

  select id into v_id
  from public.vouchers
  where type_id = p_type_id
    and (status = 'available'
         or (status = 'reserved' and reserved_until is not null and reserved_until < now()))
  order by created_at
  for update skip locked
  limit 1;

  if v_id is null then return null; end if;  -- out of stock

  update public.vouchers
     set status = 'reserved',
         order_id = p_order_id,
         reserved_until = now() + make_interval(secs => p_ttl_seconds)
   where id = v_id;

  return v_id;
end $$;

-- ── 5. Turn a reservation into a sale ───────────────────────
--  Called when payment confirms. Idempotent: a redelivered webhook
--  returns the SAME pin instead of consuming another one.
create or replace function public.claim_voucher(p_order_id uuid)
returns table (serial text, pin text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.vouchers v
     set status = 'sold',
         sold_at = coalesce(v.sold_at, now()),
         reserved_until = null
   where v.order_id = p_order_id
     and v.status in ('reserved', 'sold')
  returning v.serial, v.pin;
end $$;

-- ── 6. Release a reservation when payment fails/expires ─────
create or replace function public.release_voucher(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.vouchers
     set status = 'available', order_id = null, reserved_until = null
   where order_id = p_order_id and status = 'reserved';
end $$;

-- ── 7. Stock counts — safe to expose (counts only, never PINs) ──
create or replace function public.voucher_stock()
returns table (type_id uuid, available bigint)
language sql security definer set search_path = public as $$
  select v.type_id, count(*)
  from public.vouchers v
  where v.status = 'available'
     or (v.status = 'reserved' and v.reserved_until is not null and v.reserved_until < now())
  group by v.type_id;
$$;

-- ── 8. Lock the functions down ──────────────────────────────
--  Postgres grants EXECUTE to PUBLIC by default. Everything that can
--  reach a PIN must be service_role only.
revoke execute on function public.reserve_voucher(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.claim_voucher(uuid)              from public, anon, authenticated;
revoke execute on function public.release_voucher(uuid)            from public, anon, authenticated;
grant  execute on function public.reserve_voucher(uuid, uuid, int) to service_role;
grant  execute on function public.claim_voucher(uuid)              to service_role;
grant  execute on function public.release_voucher(uuid)            to service_role;

-- Stock counts are harmless — the storefront uses them to hide sold-out items.
grant execute on function public.voucher_stock() to anon, authenticated, service_role;

-- ── 9. Verify ───────────────────────────────────────────────
select 'voucher_types' as table, count(*) from public.voucher_types
union all
select 'vouchers', count(*) from public.vouchers
union all
select 'checker orders', count(*) from public.orders where product_type = 'checker';
