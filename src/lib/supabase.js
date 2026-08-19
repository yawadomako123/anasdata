import { createClient } from '@supabase/supabase-js';

// Accept either naming: the VITE_PUBLIC_* names used in .env, or the shorter
// fallbacks. Whichever is set will be used.
const url =
  import.meta.env.VITE_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const anonKey =
  import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

// The app can render the storefront even before Supabase is configured,
// so we only create the client when both values are present. Anything that
// needs the backend checks `isSupabaseReady` first.
export const isSupabaseReady = Boolean(url && anonKey);

export const supabase = isSupabaseReady ? createClient(url, anonKey) : null;

export const SUPABASE_URL = url || '';
