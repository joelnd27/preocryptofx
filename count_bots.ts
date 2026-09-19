
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function count() {
  const { count, error } = await supabaseAdmin
    .from('bot_settings')
    .select('*', { count: 'exact', head: true });
  
  if (error) console.error('Error:', error);
  else console.log('Total bot_settings:', count);

  const { count: activeCount, error: activeError } = await supabaseAdmin
    .from('bot_settings')
    .select('*', { count: 'exact', head: true })
    .or('scalping_active.eq.true,trend_active.eq.true,ai_active.eq.true,custom_active.eq.true');

  if (activeError) console.error('Active Error:', activeError);
  else console.log('Active (via columns):', activeCount);
}

count();
