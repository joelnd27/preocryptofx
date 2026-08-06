import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  const { data, error } = await supabaseAdmin.from('transactions').select('*').limit(1);
  if (error) console.error('Error:', error);
  else console.log('Columns:', Object.keys(data[0] || {}));
}
check();
