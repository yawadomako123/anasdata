// ════════════════════════════════════════════════════════════
//  Shared bundle catalogue for Edge Functions (verify-payment, ussd).
//  This is the SERVER-SIDE source of truth for prices — used both to
//  verify Paystack amounts and to build the USSD menu.
//
//  ⚠️  Keep the ids/prices in sync with ../../../src/lib/data.js
// ════════════════════════════════════════════════════════════

export type NetworkId = 'mtn' | 'airteltigo' | 'telecel';

export interface Bundle {
  id: string;
  network: NetworkId;
  name: string;
  data: string;
  price: number; // GHS
  validity: string; // human-readable, e.g. "30 days"
}

export const NETWORKS: Record<NetworkId, { name: string }> = {
  mtn: { name: 'MTN' },
  airteltigo: { name: 'AirtelTigo' },
  telecel: { name: 'Telecel' },
};

// Order matters — this is the order bundles appear in the USSD menu.
export const BUNDLES: Bundle[] = [
  // ─────────────── MTN ───────────────
  { id: 'mtn-d1', network: 'mtn', name: 'MTN Daily Lite', data: '150MB', price: 1.0, validity: '1 day' },
  { id: 'mtn-d2', network: 'mtn', name: 'MTN Daily', data: '500MB', price: 2.5, validity: '1 day' },
  { id: 'mtn-d3', network: 'mtn', name: 'MTN Daily Max', data: '1GB', price: 5.0, validity: '1 day' },
  { id: 'mtn-w1', network: 'mtn', name: 'MTN Weekly Starter', data: '1.5GB', price: 10.0, validity: '7 days' },
  { id: 'mtn-w2', network: 'mtn', name: 'MTN Weekly Plus', data: '3GB', price: 15.0, validity: '7 days' },
  { id: 'mtn-w3', network: 'mtn', name: 'MTN Weekly Max', data: '5GB', price: 25.0, validity: '7 days' },
  { id: 'mtn-m1', network: 'mtn', name: 'MTN Monthly Starter', data: '5GB', price: 30.0, validity: '30 days' },
  { id: 'mtn-m2', network: 'mtn', name: 'MTN Monthly', data: '10GB', price: 50.0, validity: '30 days' },
  { id: 'mtn-m3', network: 'mtn', name: 'MTN Monthly Plus', data: '20GB', price: 85.0, validity: '30 days' },
  { id: 'mtn-m4', network: 'mtn', name: 'MTN Monthly Max', data: '40GB', price: 150.0, validity: '30 days' },
  { id: 'mtn-m5', network: 'mtn', name: 'MTN Unlimited', data: 'Unlimited', price: 250.0, validity: '30 days' },
  // ─────────────── AirtelTigo ───────────────
  { id: 'at-d1', network: 'airteltigo', name: 'AT Daily Mini', data: '100MB', price: 0.5, validity: '1 day' },
  { id: 'at-d2', network: 'airteltigo', name: 'AT Daily Flex', data: '300MB', price: 1.5, validity: '1 day' },
  { id: 'at-d3', network: 'airteltigo', name: 'AT Daily Plus', data: '750MB', price: 3.5, validity: '1 day' },
  { id: 'at-w1', network: 'airteltigo', name: 'AT Weekly', data: '2GB', price: 12.0, validity: '7 days' },
  { id: 'at-w2', network: 'airteltigo', name: 'AT Weekly Plus', data: '4GB', price: 20.0, validity: '7 days' },
  { id: 'at-m1', network: 'airteltigo', name: 'AT Monthly Starter', data: '4GB', price: 25.0, validity: '30 days' },
  { id: 'at-m2', network: 'airteltigo', name: 'AT Monthly', data: '8GB', price: 45.0, validity: '30 days' },
  { id: 'at-m3', network: 'airteltigo', name: 'AT Monthly Plus', data: '15GB', price: 80.0, validity: '30 days' },
  { id: 'at-m4', network: 'airteltigo', name: 'AT Monthly Max', data: '30GB', price: 130.0, validity: '30 days' },
  // ─────────────── Telecel ───────────────
  { id: 'tc-d1', network: 'telecel', name: 'Telecel Daily', data: '200MB', price: 1.0, validity: '1 day' },
  { id: 'tc-d2', network: 'telecel', name: 'Telecel Daily Plus', data: '600MB', price: 3.0, validity: '1 day' },
  { id: 'tc-d3', network: 'telecel', name: 'Telecel Daily Max', data: '1.5GB', price: 6.0, validity: '1 day' },
  { id: 'tc-w1', network: 'telecel', name: 'Telecel Weekly', data: '2.5GB', price: 15.0, validity: '7 days' },
  { id: 'tc-w2', network: 'telecel', name: 'Telecel Weekly Max', data: '5GB', price: 25.0, validity: '7 days' },
  { id: 'tc-m1', network: 'telecel', name: 'Telecel Monthly Starter', data: '6GB', price: 35.0, validity: '30 days' },
  { id: 'tc-m2', network: 'telecel', name: 'Telecel Monthly', data: '12GB', price: 60.0, validity: '30 days' },
  { id: 'tc-m3', network: 'telecel', name: 'Telecel Monthly Plus', data: '25GB', price: 100.0, validity: '30 days' },
  { id: 'tc-m4', network: 'telecel', name: 'Telecel Monthly Pro', data: '50GB', price: 180.0, validity: '30 days' },
];

export const getBundle = (id: string): Bundle | undefined =>
  BUNDLES.find((b) => b.id === id);

export const bundlesByNetwork = (network: NetworkId): Bundle[] =>
  BUNDLES.filter((b) => b.network === network);

export const NETWORK_ORDER: NetworkId[] = ['mtn', 'airteltigo', 'telecel'];
