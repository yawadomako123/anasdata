/* ═══════════════════════════════════════════
   Bundle catalogue + networks.
   THIS is the file you edit to change prices,
   add bundles, or add a new network.
═══════════════════════════════════════════ */

export const NETWORKS = {
  mtn: {
    id: 'mtn',
    name: 'MTN',
    fullName: 'MTN Ghana',
    color: '#FFCC00',
    tagline: 'Everywhere You Go',
    hotline: '*138#',
  },
  airteltigo: {
    id: 'airteltigo',
    name: 'AirtelTigo',
    fullName: 'AirtelTigo Ghana',
    color: '#E31837',
    tagline: 'Making Sense',
    hotline: '*100#',
  },
  telecel: {
    id: 'telecel',
    name: 'Telecel',
    fullName: 'Telecel Ghana',
    color: '#E2001A',
    tagline: 'Together We Can',
    hotline: '*700#',
  },
};

export const BUNDLES = [
  // ─────────────── MTN GHANA ───────────────
  { id: 'mtn-d1', network: 'mtn', name: 'MTN Daily Lite', data: '150MB', dataValue: 0.15, duration: 1, durationUnit: 'day', category: 'daily', price: 1.0, popular: false, badge: null },
  { id: 'mtn-d2', network: 'mtn', name: 'MTN Daily', data: '500MB', dataValue: 0.5, duration: 1, durationUnit: 'day', category: 'daily', price: 2.5, popular: false, badge: null },
  { id: 'mtn-d3', network: 'mtn', name: 'MTN Daily Max', data: '1GB', dataValue: 1, duration: 1, durationUnit: 'day', category: 'daily', price: 5.0, popular: true, badge: 'Popular' },
  { id: 'mtn-w1', network: 'mtn', name: 'MTN Weekly Starter', data: '1.5GB', dataValue: 1.5, duration: 7, durationUnit: 'days', category: 'weekly', price: 10.0, popular: false, badge: null },
  { id: 'mtn-w2', network: 'mtn', name: 'MTN Weekly Plus', data: '3GB', dataValue: 3, duration: 7, durationUnit: 'days', category: 'weekly', price: 15.0, popular: true, badge: 'Best Value' },
  { id: 'mtn-w3', network: 'mtn', name: 'MTN Weekly Max', data: '5GB', dataValue: 5, duration: 7, durationUnit: 'days', category: 'weekly', price: 25.0, popular: false, badge: null },
  { id: 'mtn-m1', network: 'mtn', name: 'MTN Monthly Starter', data: '5GB', dataValue: 5, duration: 30, durationUnit: 'days', category: 'monthly', price: 30.0, popular: false, badge: null },
  { id: 'mtn-m2', network: 'mtn', name: 'MTN Monthly', data: '10GB', dataValue: 10, duration: 30, durationUnit: 'days', category: 'monthly', price: 50.0, popular: true, badge: 'Popular' },
  { id: 'mtn-m3', network: 'mtn', name: 'MTN Monthly Plus', data: '20GB', dataValue: 20, duration: 30, durationUnit: 'days', category: 'monthly', price: 85.0, popular: false, badge: null },
  { id: 'mtn-m4', network: 'mtn', name: 'MTN Monthly Max', data: '40GB', dataValue: 40, duration: 30, durationUnit: 'days', category: 'monthly', price: 150.0, popular: false, badge: 'Power User' },
  { id: 'mtn-m5', network: 'mtn', name: 'MTN Unlimited', data: 'Unlimited', dataValue: 9999, duration: 30, durationUnit: 'days', category: 'monthly', price: 250.0, popular: false, badge: 'Premium' },

  // ─────────────── AIRTELTIGO ───────────────
  { id: 'at-d1', network: 'airteltigo', name: 'AT Daily Mini', data: '100MB', dataValue: 0.1, duration: 1, durationUnit: 'day', category: 'daily', price: 0.5, popular: false, badge: null },
  { id: 'at-d2', network: 'airteltigo', name: 'AT Daily Flex', data: '300MB', dataValue: 0.3, duration: 1, durationUnit: 'day', category: 'daily', price: 1.5, popular: false, badge: null },
  { id: 'at-d3', network: 'airteltigo', name: 'AT Daily Plus', data: '750MB', dataValue: 0.75, duration: 1, durationUnit: 'day', category: 'daily', price: 3.5, popular: true, badge: 'Popular' },
  { id: 'at-w1', network: 'airteltigo', name: 'AT Weekly', data: '2GB', dataValue: 2, duration: 7, durationUnit: 'days', category: 'weekly', price: 12.0, popular: false, badge: null },
  { id: 'at-w2', network: 'airteltigo', name: 'AT Weekly Plus', data: '4GB', dataValue: 4, duration: 7, durationUnit: 'days', category: 'weekly', price: 20.0, popular: true, badge: 'Best Value' },
  { id: 'at-m1', network: 'airteltigo', name: 'AT Monthly Starter', data: '4GB', dataValue: 4, duration: 30, durationUnit: 'days', category: 'monthly', price: 25.0, popular: false, badge: null },
  { id: 'at-m2', network: 'airteltigo', name: 'AT Monthly', data: '8GB', dataValue: 8, duration: 30, durationUnit: 'days', category: 'monthly', price: 45.0, popular: true, badge: 'Popular' },
  { id: 'at-m3', network: 'airteltigo', name: 'AT Monthly Plus', data: '15GB', dataValue: 15, duration: 30, durationUnit: 'days', category: 'monthly', price: 80.0, popular: false, badge: null },
  { id: 'at-m4', network: 'airteltigo', name: 'AT Monthly Max', data: '30GB', dataValue: 30, duration: 30, durationUnit: 'days', category: 'monthly', price: 130.0, popular: false, badge: 'Power User' },

  // ─────────────── TELECEL ───────────────
  { id: 'tc-d1', network: 'telecel', name: 'Telecel Daily', data: '200MB', dataValue: 0.2, duration: 1, durationUnit: 'day', category: 'daily', price: 1.0, popular: false, badge: null },
  { id: 'tc-d2', network: 'telecel', name: 'Telecel Daily Plus', data: '600MB', dataValue: 0.6, duration: 1, durationUnit: 'day', category: 'daily', price: 3.0, popular: true, badge: 'Popular' },
  { id: 'tc-d3', network: 'telecel', name: 'Telecel Daily Max', data: '1.5GB', dataValue: 1.5, duration: 1, durationUnit: 'day', category: 'daily', price: 6.0, popular: false, badge: null },
  { id: 'tc-w1', network: 'telecel', name: 'Telecel Weekly', data: '2.5GB', dataValue: 2.5, duration: 7, durationUnit: 'days', category: 'weekly', price: 15.0, popular: false, badge: null },
  { id: 'tc-w2', network: 'telecel', name: 'Telecel Weekly Max', data: '5GB', dataValue: 5, duration: 7, durationUnit: 'days', category: 'weekly', price: 25.0, popular: true, badge: 'Best Value' },
  { id: 'tc-m1', network: 'telecel', name: 'Telecel Monthly Starter', data: '6GB', dataValue: 6, duration: 30, durationUnit: 'days', category: 'monthly', price: 35.0, popular: false, badge: null },
  { id: 'tc-m2', network: 'telecel', name: 'Telecel Monthly', data: '12GB', dataValue: 12, duration: 30, durationUnit: 'days', category: 'monthly', price: 60.0, popular: true, badge: 'Popular' },
  { id: 'tc-m3', network: 'telecel', name: 'Telecel Monthly Plus', data: '25GB', dataValue: 25, duration: 30, durationUnit: 'days', category: 'monthly', price: 100.0, popular: false, badge: null },
  { id: 'tc-m4', network: 'telecel', name: 'Telecel Monthly Pro', data: '50GB', dataValue: 50, duration: 30, durationUnit: 'days', category: 'monthly', price: 180.0, popular: false, badge: 'Power User' },
];

export const getBundleById = (id) => BUNDLES.find((b) => b.id === id) || null;
export const getBundlesByNetwork = (networkId) => BUNDLES.filter((b) => b.network === networkId);
export const getPopularBundles = (limit = 6) => BUNDLES.filter((b) => b.popular).slice(0, limit);
