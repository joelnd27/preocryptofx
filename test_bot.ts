
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function testActivation() {
  // 1. Find a user
  const { data: users, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .limit(1);
  
  if (userError || !users || users.length === 0) {
    console.error('No users found:', userError);
    return;
  }
  
  const testUser = users[0];
  console.log('Testing with user:', testUser.email, testUser.id);
  
  // 2. Force activate a bot
  const { error: toggleError } = await supabaseAdmin
    .from('bot_settings')
    .upsert({
      user_id: testUser.id,
      scalping_active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    
  if (toggleError) {
    console.error('Toggle Error:', toggleError);
    return;
  }
  
  console.log('Bot activated in DB. Waiting 25 seconds for simulation cycles...');
  
  // Wait for 2 simulation cycles (20s each)
  await new Promise(resolve => setTimeout(resolve, 25000));
  
  // 3. Check if trades were generated
  const { data: trades, error: tradesError } = await supabaseAdmin
    .from('trades')
    .select('*')
    .eq('user_id', testUser.id)
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (tradesError) console.error('Trades Error:', tradesError);
  else console.log('Recent Trades:', trades);
}

testActivation();
