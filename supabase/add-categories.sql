-- ════════════════════════════════════════════════════════════
--  Anasdata — PRODUCT CATEGORIES + EMAIL DELIVERY  (safe / additive)
--
--  Run once in the Supabase SQL Editor (project: guilqdqayfcwbxdmzhvl).
--  Nothing is dropped; safe to run more than once.
--
--  Splits the single "checker" product line into three categories so the
--  USSD menu can offer them separately:
--      checker   — results checkers (serial + PIN)
--      eticket   — event / entry tickets (reference + code)
--      voucher   — general prepaid vouchers
--
--  Also records where a code was emailed, so a customer can receive it by
--  email as well as collecting it on screen or by dialling back in.
-- ════════════════════════════════════════════════════════════

-- ── 1. Categories on the product catalogue ──────────────────
alter table public.voucher_types
  add column if not exists category text not null default 'checker';

alter table public.voucher_types drop constraint if exists voucher_types_category_check;
alter table public.voucher_types
  add constraint voucher_types_category_check
  check (category in ('checker', 'eticket', 'voucher'));

create index if not exists voucher_types_category_idx
  on public.voucher_types (category, active, sort_order);

-- ── 2. Email delivery on orders ─────────────────────────────
-- `email` already exists (nullable) and is reused as the delivery address.
alter table public.orders add column if not exists email_sent_at  timestamptz;
alter table public.orders add column if not exists email_error    text;

-- ── 3. Stock counts, per category ───────────────────────────
--  Lets the storefront and the USSD menu hide an entire category when
--  nothing in it is in stock, without ever exposing a code.
create or replace function public.voucher_stock_by_category()
returns table (category text, available bigint)
language sql security definer set search_path = public as $$
  select t.category, count(v.*)
  from public.vouchers v
  join public.voucher_types t on t.id = v.type_id
  where t.active = true
    and (v.status = 'available'
         or (v.status = 'reserved' and v.reserved_until is not null and v.reserved_until < now()))
  group by t.category;
$$;

revoke execute on function public.voucher_stock_by_category() from public;
grant execute on function public.voucher_stock_by_category() to anon, authenticated, service_role;

-- ── 4. Verify ───────────────────────────────────────────────
select category, count(*) as products, sum((active)::int) as active
from public.voucher_types
group by category
order by category;
