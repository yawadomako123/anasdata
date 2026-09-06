import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, count, error } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  console.log('Total orders:', count, error);
}
check();
