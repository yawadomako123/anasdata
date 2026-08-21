/* ═══════════════════════════════════════════
   Networks (static — these rarely change).

   Bundles are NOT here anymore — they live in the Supabase `bundles`
   table so you can add/delete them from the admin dashboard.
   See src/lib/bundles.js for reading/writing bundles.
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
  telecel: {
    id: 'telecel',
    name: 'Telecel',
    fullName: 'Telecel Ghana',
    color: '#E2001A',
    tagline: 'Together We Can',
    hotline: '*700#',
  },
};

export const NETWORK_ORDER = ['mtn', 'telecel'];
