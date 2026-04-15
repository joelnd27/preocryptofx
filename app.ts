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
    const USD_TO_KES = 1;
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

    const host = req.get('host');
    const protocol = (host?.includes('localhost') || host?.includes('127.0.0.1')) ? 'http' : 'https';
    
    // On Netlify, the actual API is at /.netlify/functions/api
    // But with our redirects, /api/payhero/callback works too.
    let callbackUrl: string | undefined = `${protocol}://${host}/api/payhero/callback`;
    
    const envCallback = process.env.PAYHERO_CALLBACK_URL || process.env.VITE_PAYHERO_CALLBACK_URL;
    if (envCallback === 'none') {
      callbackUrl = undefined;
    } else if (envCallback) {
      callbackUrl = envCallback;
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
    const { data: tx } = await client
      .from('transactions')
      .select('method, external_id, amount')
      .or(`external_id.eq."${external_reference}",id.eq."${external_reference}"`)
      .maybeSingle();

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

    const payment = response.data.data?.[0] || response.data;
    const isSuccess = 
      payment && (
        payment.status?.toLowerCase() === 'success' || 
        payment.status?.toLowerCase() === 'successful' ||
        payment.ResultCode === 0 || 
        payment.ResultCode === '0'
      );

    if (isSuccess) {
      const ref = tx?.external_id || external_reference;
      const userId = ref.split('-')[0];
      
      // Check if already completed to avoid double crediting
      const { data: currentTx } = await client
        .from('transactions')
        .select('status, amount')
        .eq('external_id', ref)
        .maybeSingle();

      if (currentTx && currentTx.status !== 'completed') {
        const amountUsd = currentTx.amount;
        const { data: user } = await client.from('users').select('real_balance').eq('id', userId).single();
        
        if (user) {
          const newBalance = Number((Number(user.real_balance) + amountUsd).toFixed(2));
          console.log(`Manual status check success. Updating balance for ${userId}: ${newBalance}`);
          
          await client.from('users').update({ real_balance: newBalance }).eq('id', userId);
          await client.from('transactions').update({ status: 'completed' }).eq('external_id', ref).eq('status', 'pending');
        }
      }
    }
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Status check error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to check payment status' });
  }
});

router.post('/payhero/callback', async (req, res) => {
  const payload = req.body;
  console.log('--- PAYHERO CALLBACK RECEIVED ---');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Payload:', JSON.stringify(payload));
  
  try {
    // 1. Extract success indicators
    const status = payload.status || payload.Status;
    const resultCode = payload.ResultCode !== undefined ? payload.ResultCode : payload.ResponseCode;
    const resultDesc = payload.ResultDesc || payload.ResultDescription || payload.status_reason;
    
    const isSuccess = 
      status?.toLowerCase() === 'success' || 
      status?.toLowerCase() === 'successful' ||
      resultCode === 0 || 
      resultCode === '0' ||
      payload.Success === true;

    // 2. Extract identifiers
    const ref = payload.external_reference || payload.ExternalReference || payload.BillRefNumber;
    const checkoutId = payload.CheckoutRequestID || payload.checkout_request_id;
    const transactionId = payload.transaction_id || payload.TransactionID || payload.mpesa_code;
    const amountKes = Number(payload.amount || payload.Amount || 0);

    console.log(`Callback Analysis: Success=${isSuccess}, Ref=${ref}, CheckoutID=${checkoutId}, Amount=${amountKes}`);

    if (!ref && !checkoutId) {
      console.error('Callback missing identifiers (ref/checkoutId). Cannot process.');
      return res.status(400).json({ error: 'Missing identifiers' });
    }

    const client = supabaseAdmin || supabase;
    if (!supabaseAdmin) {
      console.warn('WARNING: supabaseAdmin is NOT initialized. Using anon client. RLS may block updates.');
    }

    if (isSuccess) {
      // Extract userId from ref if possible
      let userId = ref?.split('-')[0];
      
      // If ref is missing or doesn't have userId, try to find the transaction in DB
      if (!userId || userId.length < 10) {
        console.log('UserId not in ref, searching transaction in DB...');
        const { data: tx } = await client
          .from('transactions')
          .select('user_id')
          .or(`external_id.eq."${ref}",external_id.eq."${checkoutId}"`)
          .maybeSingle();
        
        if (tx) userId = tx.user_id;
      }

      if (!userId) {
        console.error('Could not determine userId for successful payment.');
        return res.status(404).json({ error: 'User not found' });
      }

      const USD_TO_KES = 1; // Keep at 1 for now as per user testing
      const amountUsd = Number((amountKes / USD_TO_KES).toFixed(2));

      console.log(`Processing success for user ${userId}. Amount: ${amountUsd} USD.`);

      // 1. Update balance
      const { data: user, error: userError } = await client
        .from('users')
        .select('real_balance')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        console.error(`User ${userId} fetch error:`, userError);
        return res.status(404).json({ error: 'User not found' });
      }

      const newBalance = Number((Number(user.real_balance) + amountUsd).toFixed(2));
      const { error: balanceError } = await client.from('users').update({ real_balance: newBalance }).eq('id', userId);
      
      if (balanceError) {
        console.error('Balance update error:', balanceError);
      } else {
        console.log(`Balance updated: ${user.real_balance} -> ${newBalance}`);
      }

      // 2. Update transaction
      const { error: txError } = await client.from('transactions').update({
        status: 'completed',
        amount: amountUsd,
        method: `Payhero (${transactionId || checkoutId || 'M-Pesa'})`
      })
      .eq('user_id', userId)
      .eq('status', 'pending')
      .or(`external_id.eq."${ref}",external_id.eq."${checkoutId}"`);

      if (txError) console.error('Transaction update error:', txError);
      else console.log(`Transaction ${ref || checkoutId} marked as completed.`);

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

// Admin API Routes (Bypasses RLS using Service Role Key)
router.post('/admin/update-user', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Verify the requester is an admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // 2. Check role in DB
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

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

router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    environment: process.env.NODE_ENV, 
    timestamp: new Date().toISOString(),
    path: req.path,
    baseUrl: req.baseUrl,
    originalUrl: req.originalUrl
  });
});

// Mount the router at the root level for maximum compatibility with serverless environments
app.use('/', router);
app.use('/api', router);
app.use('/.netlify/functions/api', router);

// Background task to mark stale pending transactions as failed (Timeout Handling)
// Runs every 5 minutes
setInterval(async () => {
  if (!supabaseAdmin || !supabaseUrl) {
    console.warn('Stale transaction cleanup skipped: SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL is not configured.');
    return;
  }

  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update({ status: 'rejected' })
      .eq('status', 'pending')
      .eq('type', 'DEPOSIT')
      .lt('timestamp', fifteenMinutesAgo)
      .select();
    
    if (error) {
      console.error('Error cleaning up stale transactions:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
    } else if (data && data.length > 0) {
      console.log(`Cleaned up ${data.length} stale transactions.`);
    }
  } catch (err) {
    console.error('Stale transaction cleanup exception:', err);
  }
}, 5 * 60 * 1000);

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
