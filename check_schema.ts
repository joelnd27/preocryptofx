import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkSchema() {
  console.log('--- Checking USERS table ---');
  const { data: users, error: usersErr } = await supabase.from('users').select('*').limit(1);
  if (usersErr) console.error('Users error:', usersErr);
  else console.log('Users columns:', Object.keys(users[0] || {}));

  console.log('\n--- Checking TRADES table ---');
  const { data: trades, error: tradesErr } = await supabase.from('trades').select('*').limit(1);
  if (tradesErr) console.error('Trades error:', tradesErr);
  else console.log('Trades columns:', Object.keys(trades[0] || {}));

  console.log('\n--- Checking BOT_SETTINGS table ---');
  const { data: bots, error: botsErr } = await supabase.from('bot_settings').select('*').limit(1);
  if (botsErr) console.error('Bot settings error:', botsErr);
  else console.log('Bot settings columns:', Object.keys(bots[0] || {}));
  
  console.log('\n--- Checking TRANSACTIONS table ---');
  const { data: trans, error: transErr } = await supabase.from('transactions').select('*').limit(1);
  if (transErr) console.error('Transactions error:', transErr);
  else console.log('Transactions columns:', Object.keys(trans[0] || {}));
}

checkSchema();
