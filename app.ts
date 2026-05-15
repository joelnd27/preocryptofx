import express from 'express';
import axios from 'axios';
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
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin API Routes (Bypasses RLS using Service Role Key)
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

// Payhero API Config
const PAYHERO_API_KEY = process.env.PAYHERO_API_KEY || process.env.VITE_PAYHERO_API_KEY;
const PAYHERO_CHANNEL_ID = process.env.PAYHERO_CHANNEL_ID || process.env.VITE_PAYHERO_CHANNEL_ID;

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

router.post('/payhero/initiate', async (req, res) => {
  const { amount, phone, userId, username } = req.body;

  try {
    const USD_TO_KES = 130;
    const amountKes = Math.round(amount * USD_TO_KES);

    let formattedPhone = (phone || '').replace(/\D/g, '');
    if (formattedPhone.length === 9 && (formattedPhone.startsWith('7') || formattedPhone.startsWith('1'))) {
      formattedPhone = '254' + formattedPhone;
    } else if (formattedPhone.length === 10 && formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    }

    if (!PAYHERO_API_KEY || !PAYHERO_CHANNEL_ID) {
      throw new Error('Payhero API Key or Channel ID is missing.');
    }

    if (!supabaseAdmin) {
      console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing. Balance updates will fail.');
      // We don't block initiation, but we log it clearly
    }

    const host = req.get('host');
    const protocol = (host?.includes('localhost') || host?.includes('127.0.0.1')) ? 'http' : 'https';
    
    // De-duplicate: Mark previous pending deposits for this user as cancelled/stale
    // before creating a new one to avoid multiple pending entries in history.
    try {
      const adminClient = supabaseAdmin || supabase;
      await adminClient.from('transactions')
        .update({ status: 'rejected' })
        .eq('user_id', userId)
        .eq('type', 'DEPOSIT')
        .eq('status', 'pending')
        .neq('status', 'completed');
    } catch (err) {
      console.warn('Failed to clean up prior pending deposits:', err);
    }

    // On Netlify, the actual API is at /.netlify/functions/api
    // But with our redirects, /api/payhero/callback works too.
    let callbackUrl: string | undefined;
    
    const envCallback = process.env.PAYHERO_CALLBACK_URL || process.env.VITE_PAYHERO_CALLBACK_URL;
    
    if (envCallback === 'none') {
      callbackUrl = undefined;
    } else if (envCallback) {
      callbackUrl = envCallback;
    } else {
      // Auto-detect based on host
      callbackUrl = `${protocol}://${host}/api/payhero/callback`;
      
      // If we are on Netlify and have a site name, we can be even more specific
      if (process.env.SITE_NAME && !host.includes('localhost')) {
        callbackUrl = `https://${process.env.SITE_NAME}.netlify.app/api/payhero/callback`;
      }
    }

    console.log(`Using Callback URL: ${callbackUrl}`);

    const externalReference = `${userId}-${Date.now()}`;
    
    console.log(`Initiating Payhero payment: ${amount} USD (${amountKes} KES) for user ${userId}. Ref: ${externalReference}`);
    console.log(`Callback URL: ${callbackUrl}`);

    const payload: any = {
      amount: amountKes,
      phone_number: formattedPhone,
      channel_id: Number(PAYHERO_CHANNEL_ID),
      provider: 'm-pesa',
      external_reference: externalReference
    };

    if (callbackUrl) {
      payload.callback_url = callbackUrl;
    }

    const client = supabaseAdmin || supabase;
    const { error: insertError } = await client.from('transactions').insert({
      user_id: userId,
      type: 'DEPOSIT',
      amount: amount,
      status: 'pending',
      account_type: 'REAL',
      method: 'Payhero',
      external_id: externalReference
    });

    if (insertError) {
      console.error('Failed to record pending transaction:', insertError);
      // We continue anyway so the user can still pay, but logging is important
    }

    const authHeader = PAYHERO_API_KEY?.startsWith('Basic ') || PAYHERO_API_KEY?.startsWith('Bearer ') 
      ? PAYHERO_API_KEY 
      : `Bearer ${PAYHERO_API_KEY}`;

    const response = await axios.post('https://backend.payhero.co.ke/api/v2/payments', payload, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log('Payhero Response:', JSON.stringify(response.data));

    // If we got a CheckoutRequestID, update the transaction record so we can track it better
    if (response.data.CheckoutRequestID) {
      await client.from('transactions')
        .update({ method: `Payhero (${response.data.CheckoutRequestID})` })
        .eq('external_id', externalReference);
    }

    res.json({
      ...response.data,
      external_reference: externalReference
    });
  } catch (error: any) {
    console.error('Initiate payment error:', error);
    res.status(500).json({ 
      error: 'Failed to initiate payment', 
      details: error.response?.data || error.message 
    });
  }
});

// Secure Balance Management (User accessible but strict)
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

    // Verify profit is within reasonable bounds of the target_profit if manually closing
    // For now we accept currentProfit but we should ideally validate it
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

router.get('/payhero/status/:external_reference', async (req, res) => {
  const { external_reference } = req.params;
  console.log(`Checking status for: ${external_reference}`);
  
  try {
    if (!PAYHERO_API_KEY) {
      throw new Error('Payhero API Key is missing.');
    }

    const authHeader = PAYHERO_API_KEY?.startsWith('Basic ') || PAYHERO_API_KEY?.startsWith('Bearer ') 
      ? PAYHERO_API_KEY 
      : `Bearer ${PAYHERO_API_KEY}`;

    // First, try to find the CheckoutRequestID from our DB if external_reference is our ref
    const client = supabaseAdmin || supabase;
    
    // Build a very robust query to find the transaction
    let query = client.from('transactions').select('method, external_id, amount, id, user_id, status');
    
    // Helper to check if a string is a valid UUID
    const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    // We search by external_id, id, OR if the external_reference IS a CheckoutRequestID, we check the method field
    const orConditions = [
      `external_id.eq."${external_reference}"`,
      `method.ilike."%${external_reference}%"`
    ];

    // Only add ID check if it's a valid UUID to avoid Postgres syntax errors
    if (isUUID(external_reference)) {
      orConditions.push(`id.eq."${external_reference}"`);
    }
    
    const { data: tx, error: txError } = await query.or(orConditions.join(',')).maybeSingle();

    if (txError) {
      console.error('Database error fetching transaction for status check:', txError);
    }

    let queryId = external_reference;
    let isCheckoutId = false;
    if (tx?.method && tx.method.includes('Payhero (')) {
      const match = tx.method.match(/Payhero \(([^)]+)\)/);
      if (match) {
        queryId = match[1];
        isCheckoutId = true;
      }
    }

    console.log(`Querying Payhero with ID: ${queryId} (isCheckoutId: ${isCheckoutId})`);

    let response;
    if (isCheckoutId) {
      // If we have a CheckoutRequestID, we query the specific payment
      response = await axios.get(`https://backend.payhero.co.ke/api/v2/payments/${queryId}`, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
    } else {
      // Fallback to querying by external_reference
      response = await axios.get(`https://backend.payhero.co.ke/api/v2/payments?external_reference=${external_reference}`, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
    }
    
    console.log('Payhero Status Response:', JSON.stringify(response.data));

    const payment = response.data.data?.[0] || response.data.data || response.data;
    console.log('Extracted Payment Data:', JSON.stringify(payment));
    
    const paymentId = payment.MpesaReceiptNumber || payment.transaction_id || payment.TransID || payment.CheckoutRequestID || payment.MerchantRequestID;
    
    const isSuccess = 
      payment && (
        (typeof payment.status === 'string' && (payment.status.toLowerCase() === 'success' || payment.status.toLowerCase() === 'successful')) || 
        payment.ResultCode === 0 || 
        payment.ResultCode === '0'
      ) && paymentId;

    if (isSuccess) {
      const ref = tx?.external_id || external_reference;
      
      console.log(`Manual status check success for ${external_reference}. Ref: ${ref}`);

      // ATOMIC UPDATE: Only proceed if we successfully change status from pending to completed
      const { data: updatedTx, error: updateError } = await client
        .from('transactions')
        .update({ 
          status: 'completed', 
          method: `Payhero status (${paymentId || 'M-Pesa'})` 
        })
        .or(`external_id.eq."${ref}",id.eq."${ref}"`)
        .eq('status', 'pending')
        .select();

      if (!updateError && updatedTx && updatedTx.length > 0) {
        const completedTx = updatedTx[0];
        console.log(`Transaction ${completedTx.id} successfully marked as completed via status check. Crediting user...`);
        
        // Use RPC for atomic balance increment
        const { error: rpcError } = await client.rpc('increment_balance', {
          user_id: completedTx.user_id,
          amount: Number(completedTx.amount)
        });

        if (rpcError) {
          console.error('CRITICAL: Failed to increment balance via RPC in status check:', rpcError);
          // Special case: if RPC fails, we might have a serious issue as status is already completed
        } else {
          console.log(`User ${completedTx.user_id} successfully credited with ${completedTx.amount} via status check.`);
        }
      } else {
        console.log(`Status check success for ${ref}, but transaction was already processed or is not in pending state.`);
      }
    } else if (payment && (payment.status === 'failed' || payment.ResultCode === 1032)) {
      // 1032 is Request Cancelled by User
      await client.from('transactions').update({ status: 'rejected' }).or(`external_id.eq."${external_reference}",method.ilike."%${external_reference}%"`).eq('status', 'pending');
      console.log(`Transaction ${external_reference} marked as rejected via status check.`);
    }
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Status check error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to check payment status' });
  }
});

router.get('/payhero/callback', (req, res) => {
  res.send('PayHero Webhook Endpoint is ACTIVE. Use POST for actual callbacks.');
});

router.post('/payhero/callback', async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body[0] : req.body;
  console.log('--- PAYHERO CALLBACK RECEIVED ---');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Payload:', JSON.stringify(payload));

  if (!payload || Object.keys(payload).length === 0) {
    console.error('Callback received empty payload.');
    return res.status(400).json({ error: 'Empty payload' });
  }
  
  try {
    // 1. Extract success indicators (Check root and nested data)
    const data = payload.response || payload.data || (payload.Body && payload.Body.stkCallback) || payload;
    
    // Check if this is just an initiation response (contains ResponseCode but not ResultCode)
    const isInitiation = (payload.ResponseCode !== undefined || data.ResponseCode !== undefined) && 
                         (payload.ResultCode === undefined && data.ResultCode === undefined);
    
    if (isInitiation) {
      console.log('Detected PayHero initiation response. Ignoring as it is not a final callback.');
      return res.status(200).json({ message: 'Initiation received' });
    }

    const status = payload.status !== undefined ? payload.status : (data.status || data.Status || payload.Status);
    const resultCode = payload.ResultCode !== undefined ? payload.ResultCode : data.ResultCode;
    const resultDesc = data.ResultDesc || data.ResultDescription || data.status_reason || payload.ResultDesc || payload.ResultDescription || payload.status_reason;
    
    // IMPORTANT: ResponseCode '0' means "Request Accepted", NOT "Payment Successful".
    // We only count it as success if status is explicitly "success" or ResultCode is 0.
    const isSuccess = 
      (typeof status === 'string' && (status.toLowerCase() === 'success' || status.toLowerCase() === 'successful')) || 
      resultCode === 0 || 
      resultCode === '0' ||
      data.Success === true;

    // 2. Extract identifiers (Check root, nested 'data', 'response', and 'Body.stkCallback')
    
    // Standard Safaricom Metadata extraction if available
    let metadataAmount = 0;
    let metadataReceipt = '';
    if (data.CallbackMetadata && Array.isArray(data.CallbackMetadata.Item)) {
      const items = data.CallbackMetadata.Item;
      const amountItem = items.find((i: any) => i.Name === 'Amount');
      const receiptItem = items.find((i: any) => i.Name === 'MpesaReceiptNumber');
      if (amountItem) metadataAmount = Number(amountItem.Value);
      if (receiptItem) metadataReceipt = receiptItem.Value;
    }

    const ref = data.external_reference || data.ExternalReference || data.BillRefNumber || data.Reference || data.reference || payload.external_reference || payload.ExternalReference || payload.BillRefNumber || payload.Reference;
    const checkoutId = data.CheckoutRequestID || data.checkout_request_id || data.CheckoutID || data.MerchantRequestID || payload.CheckoutRequestID || payload.checkout_request_id || payload.CheckoutID;
    const transactionId = data.transaction_id || data.TransactionID || data.mpesa_code || data.MpesaReceiptNumber || data.TransID || payload.transaction_id || payload.MpesaReceiptNumber || metadataReceipt;
    const amountKes = Number(data.amount || data.Amount || data.TransAmount || payload.amount || metadataAmount || 0);

    console.log(`Callback Analysis: Success=${isSuccess}, Ref=${ref}, CheckoutID=${checkoutId}, Amount=${amountKes}, TxID=${transactionId}`);

    if (isSuccess && !transactionId) {
      console.log('Callback indicates success but missing M-Pesa Receipt (transactionId). Treating as pending/initiation.');
      return res.status(200).json({ message: 'Request accepted, waiting for payment completion' });
    }

    if (!ref && !checkoutId) {
      console.error('Callback missing identifiers (ref/checkoutId). Cannot process.');
      console.log('Available keys in payload:', Object.keys(payload));
      if (payload.data) console.log('Available keys in payload.data:', Object.keys(payload.data));
      return res.status(400).json({ error: 'Missing identifiers' });
    }

    const client = supabaseAdmin || supabase;
    if (!supabaseAdmin) {
      console.warn('WARNING: supabaseAdmin is NOT initialized. Using anon client. RLS may block updates.');
    }

    if (isSuccess) {
      // 1. Find the transaction in our DB to get the correct user_id and expected amount
      // We search by external_id (our ref), id, or checkoutId (Payhero's ref)
      let query = client.from('transactions').select('user_id, amount, status, id, external_id');
      const orConditions = [];
      const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

      if (ref) {
        orConditions.push(`external_id.eq."${ref}"`);
        if (isUUID(ref)) {
          orConditions.push(`id.eq."${ref}"`);
        }
      }
      if (checkoutId) {
        orConditions.push(`external_id.eq."${checkoutId}"`);
        orConditions.push(`method.ilike."%${checkoutId}%"`);
      }
      
      if (orConditions.length > 0) {
        query = query.or(orConditions.join(','));
      } else {
        console.error('No identifiers found in callback payload.');
        return res.status(400).json({ error: 'Missing identifiers' });
      }

      let { data: tx, error: fetchError } = await query.maybeSingle();

      if (fetchError) {
        console.error('Error fetching transaction for callback:', fetchError);
        return res.status(500).json({ error: 'Database error' });
      }

      // Fallback: If not found by ref, try to extract userId from ref and find latest pending
      if (!tx && ref && ref.includes('-')) {
        try {
          const parts = ref.split('-');
          // A UUID has 5 parts. Our ref is uuid-timestamp.
          if (parts.length >= 5) {
            const potentialUserId = parts.slice(0, 5).join('-');
            if (potentialUserId.length === 36) {
              console.log(`Attempting fallback search for user: ${potentialUserId}`);
              const { data: fallbackTx } = await client
                .from('transactions')
                .select('user_id, amount, status, id, external_id')
                .eq('user_id', potentialUserId)
                .eq('status', 'pending')
                .eq('type', 'DEPOSIT')
                .order('timestamp', { ascending: false })
                .limit(1)
                .maybeSingle();
              
              if (fallbackTx) {
                console.log(`Fallback match successful! Using transaction ${fallbackTx.id}`);
                tx = fallbackTx;
              }
            }
          }
        } catch (fallbackErr) {
          console.error('Fallback matching error:', fallbackErr);
        }
      }

      if (!tx) {
        console.error(`No transaction found for Ref: ${ref} or CheckoutID: ${checkoutId}`);
        // Log all pending transactions to help debug
        const { data: pendingTxs } = await client.from('transactions').select('id, external_id, amount').eq('status', 'pending').limit(5);
        console.log('Recent pending transactions:', JSON.stringify(pendingTxs));
        return res.status(404).json({ error: 'Transaction not found' });
      }

      if (tx.status === 'completed') {
        console.log(`Transaction ${tx.id} already marked as completed. Skipping further processing.`);
        return res.json({ success: true, message: 'Already processed' });
      }

      // ATOMIC UPDATE: Only proceed if we successfully change status from pending/rejected to completed
      // We allow moving from 'rejected' too, just in case de-duplication marked it rejected but user still paid.
      const { data: updatedTxs, error: updateError } = await client
        .from('transactions')
        .update({ 
          status: 'completed', 
          method: `Payhero callback (${transactionId || 'M-Pesa'})` 
        })
        .eq('id', tx.id)
        .in('status', ['pending', 'rejected']) // Critical: Must be pending or rejected
        .select();

      if (updateError || !updatedTxs || updatedTxs.length === 0) {
        console.warn(`Transaction ${tx.id} was already processed or its status changed. Skipping balance update.`);
        return res.json({ success: true, message: 'Already processed or status changed' });
      }

      const userId = tx.user_id;
      const amountUsd = Number(tx.amount); 

      console.log(`Processing success for user ${userId}. Amount: ${amountUsd} USD. (Transaction ID: ${tx.id})`);

      // 2. Update balance atomically using RPC
      const { error: rpcError } = await client.rpc('increment_balance', {
        user_id: userId,
        amount: amountUsd
      });
      
      if (rpcError) {
        console.error('CRITICAL: Failed to increment balance via RPC in callback:', rpcError);
        // We should probably log this to a special table or alert admin
        return res.status(500).json({ error: 'Failed to credit balance' });
      }

      console.log(`Balance successfully updated for ${userId} with ${amountUsd} USD`);
      return res.json({ success: true, message: 'Processed successfully' });

    } else {
      console.log(`Payment failed/cancelled. Reason: ${resultDesc}`);
      
      // Mark as rejected
      await client.from('transactions')
        .update({ status: 'rejected' })
        .eq('status', 'pending')
        .or(`external_id.eq."${ref}",external_id.eq."${checkoutId}"`);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Callback processing exception:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Hardcoded authorized admin emails and IDs for backend security
const ADMIN_EMAILS = ['wren20688@gmail.com'];
const ADMIN_IDS = ['304020c9-3695-4f8f-85fe-9ee12eda8152'];

// Admin API Routes (Bypasses RLS using Service Role Key)
router.post('/admin/update-user', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Verify the requester is an admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // CRITICAL: Double-check email and ID for high-security restriction
    const isMasterAdmin = (user.email || '').toLowerCase() === 'wren20688@gmail.com' && user.id === '304020c9-3695-4f8f-85fe-9ee12eda8152';
    
    if (!isMasterAdmin) {
      console.warn(`Unauthorized admin attempt by: Email[${user.email}] ID[${user.id}]`);
      return res.status(403).json({ error: 'Forbidden: Unauthorized Admin Credentials' });
    }

    const { userId, updates } = req.body;
    
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Admin client not configured. Please set SUPABASE_SERVICE_ROLE_KEY in your environment variables.' });
    }

    // 3. Perform update using admin client (bypasses RLS)
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

    // CRITICAL: Double-check email and ID for high-security restriction
    const isMasterAdmin = (user.email || '').toLowerCase() === 'wren20688@gmail.com' && user.id === '304020c9-3695-4f8f-85fe-9ee12eda8152';
    
    if (!isMasterAdmin) {
      console.warn(`Unauthorized credit attempt by: Email[${user.email}] ID[${user.id}]`);
      return res.status(403).json({ error: 'Forbidden: Unauthorized Admin Credentials' });
    }

    const { userId, amount, transactionId } = req.body;
    if (!supabaseAdmin) throw new Error('Admin client not configured');

    // 1. Update transaction if provided (Atomic check)
    if (transactionId) {
      const { data: updatedTx, error: txError } = await supabaseAdmin
        .from('transactions')
        .update({ status: 'completed', method: 'Manual Credit (Admin)' })
        .eq('id', transactionId)
        .neq('status', 'completed') // Only if not already completed
        .select();
      
      if (txError) throw txError;
      if (!updatedTx || updatedTx.length === 0) {
        return res.status(400).json({ error: 'Transaction already processed or not found' });
      }
    } else {
      // Create a manual credit record
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

    // 2. Update balance atomically
    const { error: rpcError } = await supabaseAdmin.rpc('increment_balance', {
      user_id: userId,
      amount: Number(amount)
    });

    if (rpcError) throw rpcError;

    res.json({ success: true, message: 'User credited successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/health', (req, res) => {
  const configStatus = {
    hasSupabaseAdmin: !!supabaseAdmin,
    hasPayheroKey: !!PAYHERO_API_KEY,
    hasPayheroChannel: !!PAYHERO_CHANNEL_ID,
    callbackUrl: process.env.PAYHERO_CALLBACK_URL || 'auto-generated',
    supabaseUrl: !!supabaseUrl,
    supabaseAnonKey: !!supabaseAnonKey
  };

  const issues = [];
  if (!configStatus.hasSupabaseAdmin) issues.push('SUPABASE_SERVICE_ROLE_KEY is missing. Balance updates will fail.');
  if (!configStatus.hasPayheroKey) issues.push('PAYHERO_API_KEY is missing.');
  if (!configStatus.hasPayheroChannel) issues.push('PAYHERO_CHANNEL_ID is missing.');

  res.json({ 
    status: issues.length === 0 ? 'ok' : 'degraded', 
    environment: process.env.NODE_ENV, 
    timestamp: new Date().toISOString(),
    config: configStatus,
    issues: issues,
    path: req.path
  });
});

// Mount the router at the root level for maximum compatibility with serverless environments
// app.use('/', router);
app.use('/api', router);
app.use('/.netlify/functions/api', router);

// Background task to mark stale pending transactions as failed (Timeout Handling)
// Marks transactions as failed if they remain pending for more than 15 minutes
setInterval(async () => {
  if (!supabaseAdmin || !supabaseUrl) {
    console.warn('Stale transaction cleanup skipped: SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL is not configured.');
    return;
  }

  try {
    // 24 hours ago (Much safer for manual processing)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update({ status: 'rejected' })
      .eq('status', 'pending') // Double guarantee: Only target pending
      .neq('status', 'completed') // Explicitly exclude completed
      .eq('type', 'DEPOSIT')
      .lt('timestamp', twentyFourHoursAgo)
      .select();
    
    if (error) {
      console.error('Error cleaning up stale transactions:', error);
    } else if (data && data.length > 0) {
      console.log(`Cleaned up ${data.length} stale transactions (older than 24 hours).`);
    }
  } catch (err) {
    console.error('Stale transaction cleanup exception:', err);
  }
}, 30 * 60 * 1000); // Check every 30 minutes instead of 5

// Background task for Automatic Account Verification (Offline)
// Processes pending verifications every 60 seconds
setInterval(async () => {
  if (!supabaseAdmin) return;

  try {
    const now = Date.now();
    const fiveMinutesInMs = 5 * 60 * 1000;
    const tenMinutesInMs = 10 * 60 * 1000;

    // Fetch users in pending status
    const { data: pendingUsers, error } = await supabaseAdmin
      .from('users')
      .select('id, verification_status, verification_submitted_at')
      .eq('verification_status', 'pending');

    if (error) {
      console.error('Offline Verification Sync Error:', error);
      return;
    }

    if (!pendingUsers || pendingUsers.length === 0) return;

    for (const user of pendingUsers) {
      if (!user.verification_submitted_at) continue;

      const submittedAt = Number(user.verification_submitted_at);
      const ageInMs = now - submittedAt;

      // Use same deterministic threshold as frontend
      const seed = parseInt(user.id.slice(0, 8), 36) || 0;
      const threshold = fiveMinutesInMs + ((seed % 1000) / 1000 * (tenMinutesInMs - fiveMinutesInMs));

      if (ageInMs >= threshold) {
        console.log(`[Offline-Verify] Automatically verifying user ${user.id} (Waited: ${Math.round(ageInMs/60000)}m)`);
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

// Background Task: Automatic Withdrawal Completion
// Normal users' withdrawals are auto-completed after 15-20 minutes
setInterval(async () => {
  if (!supabaseAdmin) return;

  try {
    const now = Date.now();
    const fifteenMinutesInMs = 15 * 60 * 1000;
    const twentyMinutesInMs = 20 * 60 * 1000;

    // Fetch pending withdrawals for normal users ('user' role)
    const { data: pendingWithdrawals, error } = await supabaseAdmin
      .from('transactions')
      .select('id, user_id, timestamp, users!inner(role)')
      .eq('type', 'WITHDRAW')
      .eq('status', 'pending')
      .eq('users.role', 'user');

    if (error) {
      console.error('[Offline-Withdraw] Sync Error:', error);
      return;
    }

    if (!pendingWithdrawals || pendingWithdrawals.length === 0) return;

    for (const tx of pendingWithdrawals) {
      // Parse timestamp - handle both ISO strings and numeric timestamps
      const createdAt = isNaN(Number(tx.timestamp)) ? new Date(tx.timestamp).getTime() : Number(tx.timestamp);
      const ageInMs = now - createdAt;

      // Deterministic threshold (15-20 minutes)
      const seed = parseInt(tx.id.slice(0, 8), 36) || 0;
      const threshold = fifteenMinutesInMs + ((seed % 1000) / 1000 * (twentyMinutesInMs - fifteenMinutesInMs));

      if (ageInMs >= threshold) {
        console.log(`[Offline-Withdraw] Automatically completing withdrawal ${tx.id} for user ${tx.user_id} (Waited: ${Math.round(ageInMs/60000)}m)`);
        await supabaseAdmin
          .from('transactions')
          .update({ 
            status: 'completed',
            method: 'Auto-Processing (System)'
          })
          .eq('id', tx.id);
      }
    }
  } catch (err) {
    console.error('[Offline-Withdraw] Exception:', err);
  }
}, 60 * 1000);

// Background Task: Global Trade Reconciliation & Bot Simulation
// Ensures trades close on time and bots generate profit even when users are offline
setInterval(async () => {
  if (!supabaseAdmin) return;

  try {
    const now = new Date();
    
    // 1. Reconcile Expired Trades
    const { data: openTrades, error: tradesError } = await supabaseAdmin
      .from('trades')
      .select('*, users(role, active_account, real_balance, demo_balance, total_profit_real, total_profit_demo, daily_profit_real, daily_profit_demo)')
      .eq('status', 'OPEN');

    if (!tradesError && openTrades) {
      for (const trade of openTrades) {
        const expiryTime = new Date(new Date(trade.timestamp).getTime() + (trade.duration || 0) * 1000);
        if (now >= expiryTime) {
          console.log(`[Reconcile] Closing expired trade ${trade.id} for user ${trade.user_id}`);
          
          const user = trade.users;
          const isReal = trade.account_type === 'REAL';
          const isDemo = trade.account_type === 'DEMO';
          const isMarketer = user.role === 'marketer';
          const isAdmin = user.role === 'admin';
          
          let winChance = 0.5;
          if (isDemo) winChance = 0.92;
          else if (isMarketer || isAdmin) winChance = 0.95;
          else winChance = 0.02;

          // Prefer stored target_profit if available, otherwise calculate it
          let profit = trade.target_profit !== undefined ? Number(trade.target_profit) : 0;
          
          if (trade.target_profit === undefined) {
             const isWin = Math.random() < winChance;
             if (isWin) {
               profit = Number((trade.amount * (0.02 + Math.random() * 0.28)).toFixed(2));
             } else {
               profit = Number((-trade.amount * (0.02 + Math.random() * 0.28)).toFixed(2));
             }
          }

          const balanceField = isReal ? 'real_balance' : 'demo_balance';
          const totalProfitField = isReal ? 'total_profit_real' : 'total_profit_demo';
          const dailyProfitField = isReal ? 'daily_profit_real' : 'daily_profit_demo';
          
          const currentBalance = Number(user[balanceField] || 0);
          const newBalance = Number((currentBalance + trade.amount + profit).toFixed(2));
          const newTotalProfit = Number((Number(user[totalProfitField] || 0) + profit).toFixed(2));
          const newDailyProfit = Number((Number(user[dailyProfitField] || 0) + profit).toFixed(2));

          // Update Trade
          await supabaseAdmin.from('trades').update({
            status: 'CLOSED',
            profit: profit
          }).eq('id', trade.id);

          // Update User
          await supabaseAdmin.from('users').update({
            [balanceField]: newBalance,
            [totalProfitField]: newTotalProfit,
            [dailyProfitField]: newDailyProfit
          }).eq('id', trade.user_id);
        }
      }
    }

    // 2. Offline Bot Simulation (Every minute for anyone with active bots)
    // Runs every minute via the outer setInterval (60 * 1000)
    const { data: botUsers, error: botError } = await supabaseAdmin
      .from('bot_settings')
      .select('*, users(role, active_account, real_balance, demo_balance, total_profit_real, total_profit_demo, daily_profit_real, daily_profit_demo)')
      .or('scalping_active.eq.true,trend_active.eq.true,ai_active.eq.true,custom_active.eq.true');

    if (!botError && botUsers) {
      for (const setting of botUsers) {
        const user = setting.users;
        if (!user) continue;

        const isReal = user.active_account === 'REAL';
        const balanceField = isReal ? 'real_balance' : 'demo_balance';
        const currentBalance = Number(user[balanceField] || 0);

        // Security check: Stop bot if balance is below minimum ($10)
        if (currentBalance < 10) {
          console.log(`[Bot-Offline] Balance too low ($${currentBalance}) for user ${setting.user_id}. Deactivating bots.`);
          await supabaseAdmin.from('bot_settings').update({
            scalping_active: false,
            trend_active: false,
            ai_active: false,
            custom_active: false,
            updated_at: new Date().toISOString()
          }).eq('user_id', setting.user_id);
          continue;
        }

        console.log(`[Bot-Offline] Simulating bot profit for user ${setting.user_id}`);
        
        const isDemo = user.active_account === 'DEMO';
        const isMarketer = user.role === 'marketer';
        const isAdmin = user.role === 'admin';

        let winChance = 0.5;
        if (isDemo) winChance = 0.92;
        else if (isMarketer || isAdmin) winChance = 0.95;
        else winChance = 0.02; // Standard user: tight win rate

        // Adjust base amount to be per-minute (comparable to frontend 15s sum)
        const baseAmount = (4 + Math.random() * 8); 
        const isWin = Math.random() < winChance;
        const profit = isWin ? Number(baseAmount.toFixed(2)) : Number((-baseAmount).toFixed(2));

        const totalProfitField = isReal ? 'total_profit_real' : 'total_profit_demo';
        const dailyProfitField = isReal ? 'daily_profit_real' : 'daily_profit_demo';

        const newBalance = Math.max(0, Number((currentBalance + profit).toFixed(2)));
        const newTotalProfit = Number((Number(user[totalProfitField] || 0) + profit).toFixed(2));
        const newDailyProfit = Number((Number(user[dailyProfitField] || 0) + profit).toFixed(2));

        // Create consolidated bot trade record
        await supabaseAdmin.from('trades').insert({
          user_id: setting.user_id,
          coin: 'OFFLINE_BOT',
          amount: Math.abs(profit),
          type: profit >= 0 ? 'BUY' : 'SELL',
          price: 65000, 
          status: 'CLOSED',
          profit: profit,
          account_type: user.active_account,
          timestamp: new Date().toISOString(),
          duration: 0,
          source: 'BOT'
        });

        // Update User Profile
        await supabaseAdmin.from('users').update({
          [balanceField]: newBalance,
          [totalProfitField]: newTotalProfit,
          [dailyProfitField]: newDailyProfit
        }).eq('id', setting.user_id);

        // Update Bot Settings (Timestamp is crucial for client catch-up prevention)
        const botId = setting.scalping_active ? 'scalping' : (setting.trend_active ? 'trend' : (setting.ai_active ? 'ai' : 'custom'));
        const currentStats = setting.bot_stats || {};
        const newStats = {
          ...currentStats,
          [botId]: {
            profit: Number(((currentStats[botId]?.profit || 0) + profit).toFixed(2)),
            trades: (currentStats[botId]?.trades || 0) + 1
          }
        };
        const newLog = `[${new Date().toLocaleTimeString()}] Offline execution: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USDT`;
        const updatedLogs = [newLog, ...(setting.bot_logs || [])].slice(0, 50);

        await supabaseAdmin.from('bot_settings').update({
          bot_stats: newStats,
          bot_logs: updatedLogs,
          updated_at: new Date().toISOString()
        }).eq('user_id', setting.user_id);
      }
    }
  } catch (err) {
    console.error('[Background-Task] Task Exception:', err);
  }
}, 60 * 1000); 

// Final fallback health check at the app level
app.get('/ping', (req, res) => res.send('pong'));

// 404 Handler for API - Only handles paths starting with /api
router.use((req, res) => {
  console.log(`API 404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: 'Not Found', 
    message: `The requested endpoint ${req.method} ${req.url} was not found on this server.`,
    debug: {
      url: req.url,
      originalUrl: req.originalUrl,
      method: req.method,
      baseUrl: req.baseUrl,
      path: req.path
    }
  });
});

export default app;
