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
  console.log(`[App] ${new Date().toISOString()} ${req.method} ${req.url}`);
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

// HashBack Pay Button Initiation (Renamed to stk-push as per user request)
router.post(['/hashback/stk-push', '/hashback/stk-push/', '/api/hashback/stk-push'], async (req, res) => {
  console.log(`[HashBack] STK Push Route hit`);
  const { amount, userId } = req.body;
  console.log(`[HashBack] Initiation Request: Amount=${amount}, User=${userId}`);
  
  // Convert USD to KES
  const usdKesRate = parseFloat(process.env.USD_KES_RATE || '129.98');
  const usdAmount = parseFloat(String(amount || 0));
  const kesAmount = Math.ceil(usdAmount * usdKesRate);
  
  if (usdAmount < 16) {
    console.warn(`[HashBack] Amount too low: $${usdAmount}`);
    return res.status(400).json({ success: false, error: 'Minimum deposit is $16' });
  }

  // Generate a unique reference
  const reference = `HB${Date.now()}${Math.floor(Math.random() * 1000)}`;

  try {
    if (!HASHBACK_ACCOUNT_ID) {
      console.error('[HashBack] CRITICAL: HASHBACK_ACCOUNT_ID is missing in environment variables');
      return res.status(500).json({ success: false, error: 'Payment system configuration error (Missing Account ID).' });
    }

    console.log(`[HashBack] Using Account ID: ${HASHBACK_ACCOUNT_ID}`);

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
        return res.status(500).json({ success: false, error: 'Failed to record transaction in database.' });
      }
    } else if (!userId) {
      console.warn('[HashBack] No userId provided in request');
      return res.status(400).json({ success: false, error: 'User identification required for deposit.' });
    }

    console.log(`[HashBack] Initiation Success: Ref=${reference}, KES=${kesAmount}`);
    res.json({
      success: true,
      account: HASHBACK_ACCOUNT_ID,
      amount: kesAmount,
      reference: reference
    });
  } catch (error: any) {
    console.error('[HashBack] Create Payment Exception:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error during payment initiation.' });
  }
});

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
// HashBack Webhook handler
// HashBack Webhook
router.post(['/hashback/webhook', '/.netlify/functions/hashback-webhook'], async (req, res) => {
  const signature = req.headers['x-hashpay-signature'] as string;
  const payload = JSON.stringify(req.body);
  
  console.log('[HashBack Webhook] Headers:', req.headers);
  console.log('[HashBack Webhook] Body:', JSON.stringify(req.body, null, 2));

  // Verify Signature
  if (HASHBACK_WEBHOOK_SECRET) {
    const expectedSignature = crypto
      .createHmac('sha256', HASHBACK_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    const receivedHash = signature?.startsWith('sha256=') ? signature.substring(7) : signature;
    if (receivedHash !== expectedSignature) {
      console.warn('[HashBack Webhook] Invalid signature rejected (Warning only for now)');
    }
  }

  // Robust extraction
  const reference = req.body.reference || req.body.external_reference || (req.body.payload && req.body.payload.reference);
  const rawStatus = (req.body.status || (req.body.payload && req.body.payload.status) || req.body.ResultDesc || 'failed').toString().toLowerCase();
  
  const success = ['success', 'completed', 'successful', '0', '00'].some(s => rawStatus.includes(s)) || req.body.success === true;
  const failure = ['fail', 'reject', 'cancel', 'error', 'denied', 'insufficient'].some(f => rawStatus.includes(f));

  console.log('[HashBack Webhook] Parsed:', { reference, rawStatus, success, failure });

  try {
    if (supabaseAdmin && reference && (success || failure)) {
      const finalStatus = success ? 'completed' : 'rejected';
      
      // 1. Find transaction
      const { data: tx, error: txError } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('external_id', reference)
        .eq('status', 'pending')
        .maybeSingle();

      if (txError) throw txError;

      if (tx && success) {
        console.log(`[HashBack Webhook] Processing success for ${reference}`);
        
        // 1. Update Transaction
        const { error: updateError } = await supabaseAdmin
          .from('transactions')
          .update({ 
            status: 'completed',
            metadata: { ...tx.metadata, ...req.body, webhook_processed: true }
          })
          .eq('id', tx.id);

        if (updateError) {
          console.error('[HashBack Webhook] Update Transaction Error:', updateError);
          throw updateError;
        }

        // 2. Increment Balance
        const usdKesRate = parseFloat(process.env.USD_KES_RATE || '129.98');
        const kesReceived = Number(req.body.amount || (req.body.payload && req.body.payload.amount) || 0);
        const usdToCredit = kesReceived > 0 ? (kesReceived / usdKesRate) : Number(tx.amount);

        const { data: userData, error: userError } = await supabaseAdmin
          .from('users')
          .select('real_balance')
          .eq('id', tx.user_id)
          .single();

        if (userError) {
          console.error('[HashBack Webhook] Fetch User Error:', userError);
          throw userError;
        }

        const newBalance = Number((Number(userData.real_balance || 0) + usdToCredit).toFixed(2));
        
        const { error: balanceError } = await supabaseAdmin
          .from('users')
          .update({ real_balance: newBalance })
          .eq('id', tx.user_id);

        if (balanceError) {
          console.error('[HashBack Webhook] Update Balance Error:', balanceError);
          throw balanceError;
        }

        console.log(`[HashBack Webhook] Successfully credited $${usdToCredit.toFixed(2)} to user ${tx.user_id}`);
      } else if (tx && failure) {
        await supabaseAdmin
          .from('transactions')
          .update({ 
            status: 'rejected',
            metadata: { ...tx.metadata, ...req.body, webhook_failure: true }
          })
          .eq('id', tx.id);
        console.log(`[HashBack Webhook] Marked transaction ${reference} as rejected/cancelled`);
      } else if (!tx) {
        console.warn(`[HashBack Webhook] Pending transaction not found for reference: ${reference}`);
      }
    } else if (!reference) {
      console.warn('[HashBack Webhook] Missing reference in payload');
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[HashBack Webhook] Processing Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// HashBack Verify (Polling endpoint)
router.get(['/hashback/verify/:reference', '/api/hashback/verify/:reference'], async (req, res) => {
  const { reference } = req.params;
  console.log(`[HashBack Verify] Checking ref: ${reference}`);
  
  if (!reference) return res.status(400).json({ error: 'Missing reference' });

  try {
    if (supabaseAdmin) {
      const { data: tx, error: fetchError } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('external_id', reference)
        .maybeSingle();

      if (fetchError) {
        console.error('[HashBack Verify] Database Error:', fetchError);
        return res.status(500).json({ 
          success: false, 
          error: 'Database fetch error',
          details: fetchError.message
        });
      }

      if (tx) {
        console.log(`[HashBack Verify] Status for ${reference}:`, tx.status);
        
        if (tx.status !== 'pending') {
          const metadata = tx.metadata || {};
          const message = metadata.result_desc || 
                          metadata.webhook_payload?.ResultDesc || 
                          tx.description || 
                          `Transaction ${tx.status}`;

          return res.json({
            success: true,
            status: tx.status,
            isSuccess: tx.status === 'completed' || tx.status === 'success',
            isFailed: tx.status === 'rejected' || tx.status === 'failed',
            message: message
          });
        }
      } else {
        console.warn(`[HashBack Verify] No transaction found for ref: ${reference}`);
      }
    }
    
    res.json({ success: true, status: 'pending', isSuccess: false, isFailed: false });
  } catch (error: any) {
    console.error('[HashBack Verify] Exception:', error);
    res.status(500).json({ error: error.message });
  }
});

// HashBack Update Status (Client-side callback endpoint)
router.post(['/hashback/update-status', '/api/hashback/update-status'], async (req, res) => {
  const { reference, status, message, metadata } = req.body;
  console.log(`[HashBack Update] ${reference} -> ${status}: ${message}`);

  if (!reference || !status) {
    return res.status(400).json({ error: 'Missing reference or status' });
  }

  try {
    if (!supabaseAdmin) throw new Error('Database admin client not configured');

    // Find transaction
    const { data: tx, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('external_id', reference)
      .maybeSingle();

    if (txError) throw txError;
    if (!tx) {
      console.warn(`[HashBack Update] Transaction ${reference} not found`);
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Only update if currently pending to prevent race conditions or duplicate crediting
    if (tx.status === 'pending') {
      const normalizedStatus = status.toLowerCase();
      const isSuccess = ['completed', 'success', 'successful', 'successfull', '0', '00'].some(s => normalizedStatus.includes(s));
      const isFailure = ['rejected', 'failed', 'cancelled', 'canceled', 'dismissed', 'closed', 'fail', 'error'].some(f => normalizedStatus.includes(f));

      if (isSuccess) {
        console.log(`[HashBack Update] Processing success for ${reference}`);
        
        // 1. Update Transaction
        const { error: updateError } = await supabaseAdmin
          .from('transactions')
          .update({ 
            status: 'completed',
            metadata: { ...tx.metadata, ...metadata, client_callback: true, callback_status: status }
          })
          .eq('id', tx.id);

        if (updateError) {
          console.error('[HashBack Update] Update Transaction Error:', updateError);
          return res.status(500).json({ error: 'Failed to update transaction status', details: updateError });
        }

        // 2. Increment Balance
        const usdToCredit = Number(tx.amount);
        const { data: userData, error: userError } = await supabaseAdmin
          .from('users')
          .select('real_balance')
          .eq('id', tx.user_id)
          .single();

        if (userError) {
          console.error('[HashBack Update] Fetch User Error:', userError);
          return res.status(500).json({ error: 'Failed to fetch user for balance update', details: userError });
        }

        const newBalance = Number((Number(userData.real_balance || 0) + usdToCredit).toFixed(2));
        
        const { error: balanceError } = await supabaseAdmin
          .from('users')
          .update({ real_balance: newBalance })
          .eq('id', tx.user_id);

        if (balanceError) {
          console.error('[HashBack Update] Update Balance Error:', balanceError);
          return res.status(500).json({ error: 'Failed to update user balance', details: balanceError });
        }

        console.log(`[HashBack Update] Successfully credited $${usdToCredit.toFixed(2)} to user ${tx.user_id}`);
        return res.json({ success: true, credited: true, amount: usdToCredit });
      } else if (isFailure) {
        const { error: rejectError } = await supabaseAdmin
          .from('transactions')
          .update({ 
            status: 'rejected',
            metadata: { ...tx.metadata, ...metadata, client_reason: message, client_callback: true, callback_status: status }
          })
          .eq('id', tx.id);

        if (rejectError) {
          console.error('[HashBack Update] Reject Error:', rejectError);
          return res.status(500).json({ error: 'Failed to mark as rejected', details: rejectError });
        }
        
        console.log(`[HashBack Update] Marked ${reference} as rejected (Client reason: ${message})`);
        return res.json({ success: true, status: 'rejected' });
      } else {
        console.warn(`[HashBack Update] Unrecognized status: ${status}`);
        return res.json({ success: true, status: 'unrecognized', message: 'Status was not success or failure' });
      }
    } else {
      console.log(`[HashBack Update] Transaction ${reference} is already ${tx.status}. Skipping update.`);
      return res.json({ success: true, alreadyProcessed: true, currentStatus: tx.status });
    }
  } catch (error: any) {
    console.error('[HashBack Update] Exception:', error);
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

router.use((req, res) => {
  console.log(`[Router] 404 Miss: ${req.method} ${req.originalUrl} -> Path: ${req.path}`);
  res.status(404).json({
    error: 'Not Found',
    message: `The requested endpoint ${req.method} ${req.path} was not found on this server.`,
    debug: {
      method: req.method,
      url: req.originalUrl,
      path: req.path
    }
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
