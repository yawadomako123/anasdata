// ════════════════════════════════════════════════════════════
//  Shared bundle helpers for Edge Functions (verify-payment, ussd).
//
//  Bundles now live in the `bundles` table (admin-editable). These
//  helpers read them SERVER-SIDE with the service-role client, so the
//  price used to verify payments and to build the USSD menu always
//  comes from the database — never from the customer.
// ════════════════════════════════════════════════════════════
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type NetworkId = 'mtn' | 'telecel';

export interface Bundle {
  id: string;
  network: NetworkId;
  name: string;
  data: string;
  price: number; // GHS
}

export const NETWORKS: Record<NetworkId, { name: string }> = {
  mtn: { name: 'MTN' },
  telecel: { name: 'Telecel' },
};

export const NETWORK_ORDER: NetworkId[] = ['mtn', 'telecel'];

// deno-lint-ignore no-explicit-any
const mapBundle = (row: any): Bundle => ({
  id: row.id,
  network: row.network,
  name: row.name,
  data: row.data,
  price: Number(row.price),
});

/** One active bundle by id (used to verify the amount before recording). */
export async function getBundle(
  supabase: SupabaseClient,
  id: string
): Promise<Bundle | null> {
  const { data, error } = await supabase
    .from('bundles')
    .select('*')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();
  if (error || !data) return null;
  return mapBundle(data);
}

/** All active bundles for a network, in display order (for the USSD menu). */
export async function bundlesByNetwork(
  supabase: SupabaseClient,
  network: NetworkId
): Promise<Bundle[]> {
  const { data, error } = await supabase
    .from('bundles')
    .select('*')
    .eq('network', network)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('price', { ascending: true });
  if (error || !data) return [];
  return data.map(mapBundle);
}
