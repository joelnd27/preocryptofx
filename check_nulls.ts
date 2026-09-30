import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkNullability() {
  const { data, error } = await supabase.rpc('get_column_info', { t_name: 'trades' });
  if (error) {
    // If RPC doesn't exist, try to check by inserting a null value (carefully)
    console.log('RPC get_column_info not found, trying test insert...');
    const { error: insertErr } = await supabase.from('trades').insert({
        user_id: '2fcd33f8-f3d3-462e-97ca-787cc0806aeb', 
        amount: 0,
        type: 'BUY',
        status: 'CLOSED',
        timestamp: new Date().toISOString(),
        coin: 'BTC',
        price: 50000,
        account_type: 'DEMO'
        // symbol is missing
    });
    console.log('Insert error (checking for null constraint):', insertErr?.message);
  } else {
    console.log('Column info:', data);
  }
}

checkNullability();
