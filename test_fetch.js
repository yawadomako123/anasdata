import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  let q = supabase.from('orders').select('*', { count: 'exact', head: true });
  const { count } = await q;
  console.log('Total in DB:', count);

  let from = 0;
  const pageSize = 1000;
  let fetched = 0;
  while (true) {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).range(from, from + pageSize - 1);
    if (error) {
       console.error(error);
       break;
    }
    fetched += data.length;
    console.log(`Fetched ${data.length} from offset ${from}`);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log('Total fetched by loop:', fetched);
}
check();
