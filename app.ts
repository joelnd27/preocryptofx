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
        .eq('status', 'pending');
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
    
    // Attempt to mark the transaction as failed if we can identify it
    try {
      const client = supabaseAdmin || supabase;
      // We don't have the exact externalReference here easily if it failed before payload creation,
      // but we can try to find the most recent pending deposit for this user
      const { data: latestPending } = await client
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'DEPOSIT')
        .eq('status', 'pending')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestPending) {
        await client.from('transactions').update({ status: 'failed' }).eq('id', latestPending.id);
      }
    } catch (dbError) {
      console.error('Error updating failed transaction status:', dbError);
    }
    
    res.status(500).json({ 
      error: 'Failed to initiate payment', 
      details: error.response?.data || error.message 
    });
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

      // Check if already completed to avoid double crediting
      let query = client.from('transactions').select('status, amount, user_id, id');
      
      if (ref) {
        query = query.or(`external_id.eq."${ref}",id.eq."${ref}"`);
      } else {
        console.error('No reference available for status check update.');
        return res.json(response.data);
      }
      
      const { data: currentTx, error: txFetchError } = await query.maybeSingle();

      if (txFetchError) {
        console.error('Error fetching transaction for status check:', txFetchError);
      } else if (currentTx && currentTx.status !== 'completed') {
        const userId = currentTx.user_id;
        const amountUsd = currentTx.amount;
        
        const { data: user, error: userFetchError } = await client
          .from('users')
          .select('real_balance, username')
          .eq('id', userId)
          .single();
        
        if (userFetchError) {
          console.error('Error fetching user for status check:', userFetchError);
        } else if (user) {
          const currentBalance = Number(user.real_balance || 0);
          const newBalance = Number((currentBalance + amountUsd).toFixed(2));
          console.log(`Manual status check success for ${user.username}. Updating balance: ${currentBalance} -> ${newBalance}`);
          
          const { error: balanceUpdateError } = await client.from('users').update({ real_balance: newBalance }).eq('id', userId);
          if (balanceUpdateError) {
            console.error('Error updating balance during status check:', balanceUpdateError);
          } else {
            await client.from('transactions')
              .update({ status: 'completed' })
              .eq('id', currentTx.id);
            console.log(`Transaction ${currentTx.id} marked as completed via status check.`);
          }
        }
      } else if (currentTx?.status === 'completed') {
        console.log(`Transaction ${currentTx.id} already completed. No update needed.`);
      }
    }
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Status check error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to check payment status' });
  }
});

// Payhero Callback handling
router.post('/payhero/callback', async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body[0] : req.body;
  console.log('--- PAYHERO CALLBACK RECEIVED ---', JSON.stringify(payload));

  try {
    const data = payload.response || payload.data || payload;
    const isSuccess = data.ResultCode === 0 || data.ResultCode === '0' || data.Success === true || data.status?.toLowerCase() === 'success';
    
    if (!isSuccess) {
      console.log('Payment failed or cancelled.');
      return res.status(200).json({ success: false });
    }

    const ref = data.external_reference || data.ExternalReference || data.reference;
    const transactionId = data.MpesaReceiptNumber || data.mpesa_code || data.TransID;
    
    if (!ref) {
      return res.status(400).json({ error: 'Missing reference' });
    }

    if (!supabaseAdmin) {
      console.error('CRITICAL: Service Role Key missing. Cannot update balance.');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // 1. Find transaction
    const { data: tx, error: txErr } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('external_id', ref)
      .eq('status', 'pending')
      .single();

    if (txErr || !tx) {
      console.error('Transaction not found or already processed:', ref);
      return res.status(200).json({ success: true, message: 'Already processed or not found' });
    }

    // 2. Atomic Update Using RPC or direct admin update
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('real_balance')
      .eq('id', tx.user_id)
      .single();

    if (userErr || !user) throw new Error('User not found');

    const newBalance = Number(user.real_balance || 0) + Number(tx.amount);

    await supabaseAdmin.from('users').update({ real_balance: newBalance }).eq('id', tx.user_id);
    await supabaseAdmin.from('transactions').update({ 
      status: 'completed', 
      method: `PayHero (${transactionId || 'M-Pesa'})` 
    }).eq('id', tx.id);

    console.log(`Successfully credited ${tx.amount} to user ${tx.user_id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Callback error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// BACKGROUND TASKS (Server-Side Logic)

// 1. User Auto-Verification (5-10 minute delay)
setInterval(async () => {
  if (!supabaseAdmin) return;
  try {
    const { data: pendingUsers } = await supabaseAdmin
      .from('users')
      .select('id, verification_submitted_at, role')
      .eq('verification_status', 'pending');

    if (!pendingUsers) return;

    for (const user of pendingUsers) {
      // Marketers are auto-verified (should have been handled on signup or via this sweep)
      if (user.role === 'marketer') {
        await supabaseAdmin.from('users').update({ verification_status: 'verified' }).eq('id', user.id);
        continue;
      }

      if (user.verification_submitted_at) {
        const now = Date.now();
        const waitTime = now - Number(user.verification_submitted_at);
        const fiveMinutes = 5 * 60 * 1000;
        
        if (waitTime >= fiveMinutes) {
          console.log(`Auto-verifying user ${user.id}`);
          await supabaseAdmin.from('users').update({ verification_status: 'verified' }).eq('id', user.id);
        }
      }
    }
  } catch (err) {
    console.error('Auto-verify sweep failed:', err);
  }
}, 60 * 1000); // Check every minute

// 2. Marketer Auto-Withdraw Approval (Few seconds delay)
setInterval(async () => {
  if (!supabaseAdmin) return;
  try {
    const { data: pendingWithdrawals } = await supabaseAdmin
      .from('transactions')
      .select('*, user:users(role)')
      .eq('type', 'WITHDRAW')
      .eq('status', 'pending');

    if (!pendingWithdrawals) return;

    for (const tx of pendingWithdrawals) {
      const userRole = (tx.user as any)?.role;
      
      if (userRole === 'marketer') {
        const txAge = Date.now() - new Date(tx.timestamp).getTime();
        const tenSeconds = 10 * 1000;

        if (txAge >= tenSeconds) {
          console.log(`Auto-approving withdrawal for marketer ${tx.user_id}`);
          await supabaseAdmin.from('transactions').update({ status: 'completed' }).eq('id', tx.id);
        }
      }
    }
  } catch (err) {
    console.error('Auto-withdraw sweep failed:', err);
  }
}, 5 * 1000); // Check every 5 seconds

// Trade & Withdrawal Endpoints
router.post('/trade/open', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { coin, amount, type, price, accountType, duration } = req.body;
    if (!supabaseAdmin) throw new Error('Admin client not configured');

    const balanceField = accountType === 'REAL' ? 'real_balance' : 'demo_balance';

    // 1. Get current balance
    const { data: userData } = await supabaseAdmin.from('users').select(balanceField).eq('id', user.id).single();
    if (!userData) throw new Error('User not found');

    const currentBalance = Number(userData[balanceField] || 0);
    if (currentBalance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    const newBalance = Number((currentBalance - amount).toFixed(2));

    // 2. Atomic Update: Create trade and update balance
    const { data: trade, error: tradeErr } = await supabaseAdmin.from('trades').insert({
      user_id: user.id,
      coin,
      amount,
      type,
      price,
      status: 'OPEN',
      account_type: accountType,
      duration
    }).select().single();

    if (tradeErr) throw tradeErr;

    await supabaseAdmin.from('users').update({ [balanceField]: newBalance }).eq('id', user.id);

    res.json({ success: true, trade, newBalance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/trade/close', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { tradeId, profit } = req.body;
    if (!supabaseAdmin) throw new Error('Admin client not configured');

    // 1. Get trade and current balance
    const { data: trade } = await supabaseAdmin.from('trades').select('*').eq('id', tradeId).eq('user_id', user.id).single();
    if (!trade || trade.status === 'CLOSED') throw new Error('Trade not found or already closed');

    const isReal = trade.account_type === 'REAL';
    const balanceField = isReal ? 'real_balance' : 'demo_balance';
    const profitField = isReal ? 'total_profit_real' : 'total_profit_demo';
    const dailyProfitField = isReal ? 'daily_profit_real' : 'daily_profit_demo';

    const { data: userData } = await supabaseAdmin.from('users').select(`${balanceField}, ${profitField}, ${dailyProfitField}`).eq('id', user.id).single();
    if (!userData) throw new Error('User not found');

    const currentBalance = Number(userData[balanceField] || 0);
    const newBalance = Number((currentBalance + trade.amount + profit).toFixed(2));
    const newTotalProfit = Number((Number(userData[profitField] || 0) + profit).toFixed(2));
    const newDailyProfit = Number((Number(userData[dailyProfitField] || 0) + profit).toFixed(2));

    // 2. Update trade and user
    await supabaseAdmin.from('trades').update({ status: 'CLOSED', profit }).eq('id', tradeId);
    await supabaseAdmin.from('users').update({ 
      [balanceField]: newBalance,
      [profitField]: newTotalProfit,
      [dailyProfitField]: newDailyProfit
    }).eq('id', user.id);

    res.json({ success: true, newBalance, profit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/withdraw/request', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !authUser) return res.status(401).json({ error: 'Unauthorized' });

    const { amount, method, accountType } = req.body;
    if (!supabaseAdmin) throw new Error('Admin client not configured');

    // 1. Check verification
    const { data: user } = await supabaseAdmin.from('users').select('*, real_balance, demo_balance').eq('id', authUser.id).single();
    if (!user) throw new Error('User not found');
    
    if (user.role !== 'marketer' && user.verification_status !== 'verified') {
      return res.status(403).json({ error: 'Account must be verified before withdrawal' });
    }

    const balanceField = accountType === 'REAL' ? 'real_balance' : 'demo_balance';
    const currentBalance = Number(user[balanceField] || 0);
    if (currentBalance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    const newBalance = Number((currentBalance - amount).toFixed(2));

    // 2. Create transaction and deduct balance
    const { data: tx, error: txErr } = await supabaseAdmin.from('transactions').insert({
      user_id: user.id,
      type: 'WITHDRAW',
      amount,
      status: 'pending',
      account_type: accountType,
      method
    }).select().single();

    if (txErr) throw txErr;

    await supabaseAdmin.from('users').update({ [balanceField]: newBalance }).eq('id', user.id);

    res.json({ success: true, transaction: tx, newBalance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify/submit', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { documents } = req.body;
    if (!supabaseAdmin) throw new Error('Admin client not configured');

    const { data: userData } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
    
    // Marketers are auto-verified
    const status = userData?.role === 'marketer' ? 'verified' : 'pending';
    const submittedAt = status === 'pending' ? Date.now() : null;

    const { data, error } = await supabaseAdmin.from('users').update({
      verification_status: status,
      verification_documents: documents,
      verification_submitted_at: submittedAt
    }).eq('id', user.id).select().single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
const ADMIN_IDS = ['304020c9-3695-4f8f-85fe-9ee12eda8152'];
const ADMIN_EMAILS = ['josphatndungu1022@gmail.com'];

// Admin API Routes (Bypasses RLS using Service Role Key)
router.get('/admin/users', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const isAuthorizedId = ADMIN_IDS.includes(user.id);
    if (!isAuthorizedId) return res.status(403).json({ error: 'Forbidden' });

    if (!supabaseAdmin) throw new Error('Admin client not configured');

    const { data, error } = await supabaseAdmin.from('users').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/admin/transactions', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const isAuthorizedId = ADMIN_IDS.includes(user.id);
    if (!isAuthorizedId) return res.status(403).json({ error: 'Forbidden' });

    if (!supabaseAdmin) throw new Error('Admin client not configured');

    const { data, error } = await supabaseAdmin.from('transactions').select('*, user:users(username, email)').eq('status', 'pending').order('timestamp', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/update-user', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Verify the requester is an admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // CRITICAL: Double-check email and ID for security
    const isAuthorizedEmail = ADMIN_EMAILS.includes(user.email || '');
    const isAuthorizedId = ADMIN_IDS.includes(user.id);
    
    if (!isAuthorizedEmail || !isAuthorizedId) {
      console.warn(`Unauthorized admin attempt by: Email[${user.email}] ID[${user.id}]`);
      return res.status(403).json({ error: 'Forbidden: Unauthorized Admin Credentials' });
    }

    // 2. Check role in DB (Optional if hardcoded check passed, but keep for consistency)
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'admin' && !isAuthorizedId) return res.status(403).json({ error: 'Forbidden' });

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

    // CRITICAL: Double-check email and ID for security
    const isAuthorizedEmail = ADMIN_EMAILS.includes(user.email || '');
    const isAuthorizedId = ADMIN_IDS.includes(user.id);
    
    if (!isAuthorizedEmail || !isAuthorizedId) {
      console.warn(`Unauthorized credit attempt by: Email[${user.email}] ID[${user.id}]`);
      return res.status(403).json({ error: 'Forbidden: Unauthorized Admin Credentials' });
    }

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'admin' && !isAuthorizedId) return res.status(403).json({ error: 'Forbidden' });

    const { userId, amount, transactionId } = req.body;
    if (!supabaseAdmin) throw new Error('Admin client not configured');

    // 1. Get current balance
    const { data: targetUser } = await supabaseAdmin.from('users').select('real_balance').eq('id', userId).single();
    if (!targetUser) throw new Error('User not found');

    const newBalance = Number((Number(targetUser.real_balance || 0) + Number(amount)).toFixed(2));

    // 2. Update balance
    await supabaseAdmin.from('users').update({ real_balance: newBalance }).eq('id', userId);

    // 3. Update transaction if provided
    if (transactionId) {
      await supabaseAdmin.from('transactions').update({ status: 'completed', method: 'Manual Credit (Admin)' }).eq('id', transactionId);
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

    res.json({ success: true, newBalance });
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
app.use('/', router);
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
    // 15 minutes ago
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update({ status: 'rejected' })
      .eq('status', 'pending')
      .eq('type', 'DEPOSIT')
      .lt('timestamp', fifteenMinutesAgo)
      .select();
    
    if (error) {
      console.error('Error cleaning up stale transactions:', error);
    } else if (data && data.length > 0) {
      console.log(`Cleaned up ${data.length} stale transactions (older than 15 minutes).`);
    }
  } catch (err) {
    console.error('Stale transaction cleanup exception:', err);
  }
}, 5 * 60 * 1000); // Check every 5 minutes

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
}, 60 * 1000); // Check every minute

// Final fallback health check at the app level
app.get('/ping', (req, res) => res.send('pong'));

// 404 Handler for API with detailed debugging
app.use((req, res) => {
  console.log(`404 Not Found: ${req.method} ${req.url}`);
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
