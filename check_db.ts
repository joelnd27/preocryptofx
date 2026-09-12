
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function checkBots() {
  const { data: users, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email, demo_balance, real_balance')
    .eq('email', 'josphatndungu1022@gmail.com')
    .single();

  if (userError) {
    console.error('User Error:', userError);
    return;
  }

  console.log('User Found:', users);

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from('bot_settings')
    .select('*')
    .eq('user_id', users.id)
    .single();

  if (settingsError) {
    console.error('Settings Error:', settingsError);
    return;
  }

  console.log('Bot Settings:', JSON.stringify(settings, null, 2));

  const { data: trades, error: tradesError } = await supabaseAdmin
    .from('trades')
    .select('*')
    .eq('user_id', users.id)
    .order('timestamp', { ascending: false })
    .limit(5);

  if (tradesError) {
    console.error('Trades Error:', tradesError);
  } else {
    console.log('Recent Trades:', trades);
  }
}

checkBots();
