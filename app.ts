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
    let callbackUrl: string | undefined = `${protocol}://${host}/api/payhero/callback`;
    
    const envCallback = process.env.PAYHERO_CALLBACK_URL || process.env.VITE_PAYHERO_CALLBACK_URL;
    if (envCallback === 'none') {
      callbackUrl = undefined;
    } else if (envCallback) {
      callbackUrl = envCallback;
    }

    const externalReference = `${userId}-${Date.now()}`;
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

    await supabase.from('transactions').insert({
      user_id: userId,
      type: 'DEPOSIT',
      amount: amount,
      status: 'pending',
      account_type: 'REAL',
      method: 'Payhero',
      external_id: externalReference
    });

    const authHeader = PAYHERO_API_KEY?.startsWith('Basic ') || PAYHERO_API_KEY?.startsWith('Bearer ') 
      ? PAYHERO_API_KEY 
      : `Bearer ${PAYHERO_API_KEY}`;

    const response = await axios.post('https://backend.payhero.co.ke/api/v2/payments', payload, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    res.json(response.data);
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
        .order('created_at', { ascending: false })
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
  
  try {
    if (!PAYHERO_API_KEY) {
      throw new Error('Payhero API Key is missing.');
    }

    const authHeader = PAYHERO_API_KEY?.startsWith('Basic ') || PAYHERO_API_KEY?.startsWith('Bearer ') 
      ? PAYHERO_API_KEY 
      : `Bearer ${PAYHERO_API_KEY}`;

    // Note: Payhero status check endpoint might vary. 
    // This is a common pattern for their API.
    const response = await axios.get(`https://backend.payhero.co.ke/api/v2/payments?external_reference=${external_reference}`, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // If Payhero returns the transaction, we can update our DB if it's successful
    const payment = response.data.data?.[0] || response.data;
    if (payment && (payment.status === 'Success' || payment.status === 'Successful')) {
      const userId = external_reference.split('-')[0];
      const client = supabaseAdmin || supabase;
      
      // Check if already completed to avoid double crediting
      const { data: existingTx } = await client
        .from('transactions')
        .select('status, amount')
        .eq('external_id', external_reference)
        .single();

      if (existingTx && existingTx.status !== 'completed') {
        const amountUsd = existingTx.amount;
        const { data: user } = await client.from('users').select('real_balance').eq('id', userId).single();
        
        if (user) {
          const newBalance = Number((Number(user.real_balance) + amountUsd).toFixed(2));
          await client.from('users').update({ real_balance: newBalance }).eq('id', userId);
          await client.from('transactions').update({ status: 'completed' }).eq('external_id', external_reference);
        }
      }
    }

    res.json(response.data);
  } catch (error: any) {
    console.error('Status check error:', error.message);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

router.post('/payhero/callback', async (req, res) => {
  const payload = req.body;
  const { status, external_reference, amount, transaction_id } = payload;

  if (status === 'Success' || status === 'Successful') {
    const userId = external_reference?.split('-')[0] || external_reference;
    const amountKes = Number(amount);
    const USD_TO_KES = 1;
    const amountUsd = Number((amountKes / USD_TO_KES).toFixed(2));

    try {
      // Use Admin client to bypass RLS for background balance updates
      const client = supabaseAdmin || supabase;
      
      const { data: user } = await client
        .from('users')
        .select('real_balance')
        .eq('id', userId)
        .single();

      if (user) {
        const newBalance = Number((Number(user.real_balance) + amountUsd).toFixed(2));
        await client.from('users').update({ real_balance: newBalance }).eq('id', userId);
        
        await client.from('transactions').update({
          status: 'completed',
          external_id: transaction_id || payload.CheckoutRequestID || external_reference,
          amount: amountUsd
        }).eq('user_id', userId).eq('external_id', external_reference);
      }
    } catch (error) {
      console.error('Callback error:', error);
    }
  } else if (external_reference) {
    const userId = external_reference.split('-')[0];
    const client = supabaseAdmin || supabase;
    await client.from('transactions').update({ status: 'failed' }).eq('user_id', userId).eq('external_id', external_reference);
  }

  res.json({ status: 'received' });
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
      .update({ status: 'failed' })
      .eq('status', 'pending')
      .eq('type', 'DEPOSIT')
      .lt('created_at', fifteenMinutesAgo)
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
