
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function findAll() {
  console.log('Fetching 1000 records...');
  const start = Date.now();
  const { data, error } = await supabaseAdmin
    .from('bot_settings')
    .select('user_id, scalping_active, trend_active, ai_active, custom_active, bot_stats')
    .limit(1000);
  
  console.log(`Fetch took ${Date.now() - start}ms`);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Found ${data?.length} records.`);
  
  const active = data?.filter(s => {
    const stats = s.bot_stats || {};
    const activeStates = stats.active_states || {};
    const hasActiveExtended = Object.values(activeStates).some(v => v === true || v === 'true');
    return s.scalping_active || s.trend_active || s.ai_active || s.custom_active || hasActiveExtended;
  });
  
  console.log(`Active Bots in this batch: ${active?.length}`);
  if (active && active.length > 0) {
    console.log('Sample Active:', JSON.stringify(active[0], null, 2));
  }
}

findAll();
