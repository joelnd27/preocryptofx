
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function findActive() {
  const { data, error } = await supabaseAdmin
    .from('bot_settings')
    .select('user_id, scalping_active, trend_active, ai_active, custom_active, bot_stats')
    .or('scalping_active.eq.true,trend_active.eq.true,ai_active.eq.true,custom_active.eq.true,bot_stats->active_states->>vortex.eq.true,bot_stats->active_states->>orbit.eq.true,bot_stats->active_states->>starlight.eq.true,bot_stats->active_states->>galaxy.eq.true,bot_stats->active_states->>nova.eq.true,bot_stats->active_states->>wizard1.eq.true,bot_stats->active_states->>wizard2.eq.true')
    .limit(5);
  
  if (error) console.error('Error:', error);
  else console.log('Active Bots:', JSON.stringify(data, null, 2));
}

findActive();
