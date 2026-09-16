-- ════════════════════════════════════════════════════════════
--  Anasdata — ADD AIRTELTIGO BUNDLES  (safe / additive)
--
--  Run this ONCE in the Supabase SQL Editor on an existing database.
--  It does NOT wipe anything and is safe to run more than once.
--
--  Two things happen:
--   1. The `bundles.network` CHECK constraint is widened to allow
--      'airteltigo' (it previously allowed only 'mtn' and 'telecel',
--      so inserts would have failed).
--   2. The AirtelTigo catalogue is seeded — the same sizes, prices and
--      badges as Telecel — but only if no AirtelTigo rows exist yet.
-- ════════════════════════════════════════════════════════════

-- 1. Widen the network CHECK constraint.
alter table public.bundles drop constraint if exists bundles_network_check;
alter table public.bundles
  add constraint bundles_network_check
  check (network in ('mtn','telecel','airteltigo'));

-- 2. Seed AirtelTigo, mirroring Telecel exactly. Re-running is a no-op.
insert into public.bundles (network, name, data, data_value, price, badge, sort_order)
select * from (values
  ('airteltigo','AirtelTigo 10GB','10GB',10,40.00,'Popular'::text,1),
  ('airteltigo','AirtelTigo 12GB','12GB',12,46.00,null,2),
  ('airteltigo','AirtelTigo 15GB','15GB',15,56.00,null,3),
  ('airteltigo','AirtelTigo 20GB','20GB',20,74.00,'Best Value',4),
  ('airteltigo','AirtelTigo 25GB','25GB',25,90.75,null,5),
  ('airteltigo','AirtelTigo 30GB','30GB',30,109.00,null,6),
  ('airteltigo','AirtelTigo 35GB','35GB',35,130.65,null,7),
  ('airteltigo','AirtelTigo 40GB','40GB',40,145.00,null,8),
  ('airteltigo','AirtelTigo 45GB','45GB',45,165.00,null,9),
  ('airteltigo','AirtelTigo 50GB','50GB',50,178.00,null,10),
  ('airteltigo','AirtelTigo 100GB','100GB',100,397.00,'Premium',11)
) as v(network, name, data, data_value, price, badge, sort_order)
where not exists (select 1 from public.bundles where network = 'airteltigo');

-- 3. Check it worked: expect 11 AirtelTigo rows at the same prices as Telecel.
select network, count(*) as bundles, min(price) as cheapest, max(price) as dearest
from public.bundles
where active = true
group by network
order by network;
