-- ════════════════════════════════════════════════════════════
--  Anasdata — RESEED BUNDLES  (MTN + Telecel, cheapdata.shop prices)
--
--  Run this in the Supabase SQL Editor to REPLACE the whole bundle
--  catalogue with the current price list. It clears the bundles table
--  and inserts the MTN + Telecel bundles (non-expiry).
--
--  Safe: it only touches the `bundles` table. Orders are untouched.
--  (You can still add/edit/delete individual bundles later from the
--   admin dashboard — this is just the starting catalogue.)
-- ════════════════════════════════════════════════════════════

delete from public.bundles;

insert into public.bundles (network, name, data, data_value, price, badge, sort_order) values
  -- ─────────────── MTN ───────────────
  ('mtn','MTN 1GB','1GB',1,4.70,null,1),
  ('mtn','MTN 2GB','2GB',2,9.30,null,2),
  ('mtn','MTN 3GB','3GB',3,13.50,null,3),
  ('mtn','MTN 4GB','4GB',4,18.50,null,4),
  ('mtn','MTN 5GB','5GB',5,22.50,'Best Value',5),
  ('mtn','MTN 6GB','6GB',6,26.50,null,6),
  ('mtn','MTN 8GB','8GB',8,35.00,null,7),
  ('mtn','MTN 10GB','10GB',10,43.00,'Popular',8),
  ('mtn','MTN 15GB','15GB',15,61.00,null,9),
  ('mtn','MTN 20GB','20GB',20,80.50,null,10),
  ('mtn','MTN 25GB','25GB',25,101.00,null,11),
  ('mtn','MTN 30GB','30GB',30,122.50,null,12),
  ('mtn','MTN 40GB','40GB',40,160.50,null,13),
  ('mtn','MTN 50GB','50GB',50,203.50,'Power User',14),
  ('mtn','MTN 100GB','100GB',100,407.50,'Premium',15),
  -- ─────────────── Telecel ───────────────
  ('telecel','Telecel 10GB','10GB',10,40.00,'Popular',1),
  ('telecel','Telecel 12GB','12GB',12,46.00,null,2),
  ('telecel','Telecel 15GB','15GB',15,56.00,null,3),
  ('telecel','Telecel 20GB','20GB',20,74.00,'Best Value',4),
  ('telecel','Telecel 25GB','25GB',25,90.75,null,5),
  ('telecel','Telecel 30GB','30GB',30,109.00,null,6),
  ('telecel','Telecel 35GB','35GB',35,130.65,null,7),
  ('telecel','Telecel 40GB','40GB',40,145.00,null,8),
  ('telecel','Telecel 45GB','45GB',45,165.00,null,9),
  ('telecel','Telecel 50GB','50GB',50,178.00,null,10),
  ('telecel','Telecel 100GB','100GB',100,397.00,'Premium',11);
