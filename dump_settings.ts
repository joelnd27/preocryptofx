
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function dump() {
  const { data, error } = await supabaseAdmin
    .from('bot_settings')
    .select('*')
    .limit(10);
  
  if (error) console.error('Error:', error);
  else console.log('Bot Settings Sample:', JSON.stringify(data, null, 2));
}

dump();
