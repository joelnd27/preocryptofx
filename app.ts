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
        console.log(`Transaction ${tx.id} already marked as completed. Skipping balance update.`);
        return res.json({ success: true, message: 'Already processed' });
      }

      const userId = tx.user_id;
      const amountUsd = tx.amount; 

      console.log(`Processing success for user ${userId}. Amount: ${amountUsd} USD. (Transaction ID: ${tx.id})`);

      // 2. Update balance
      const { data: userData, error: userError } = await client
        .from('users')
        .select('real_balance, username')
        .eq('id', userId)
        .single();

      if (userError || !userData) {
        console.error(`User ${userId} fetch error:`, userError);
        return res.status(404).json({ error: 'User not found' });
      }

      const currentBalance = Number(userData.real_balance || 0);
      const newBalance = Number((currentBalance + amountUsd).toFixed(2));
      
      console.log(`Updating balance for ${userData.username} (${userId}): ${currentBalance} -> ${newBalance}`);
      
      const { error: balanceError } = await client
        .from('users')
        .update({ real_balance: newBalance })
        .eq('id', userId);
      
      if (balanceError) {
        console.error('CRITICAL: Balance update error:', balanceError);
        return res.status(500).json({ error: 'Failed to update balance' });
      } 
      
      console.log(`Balance successfully updated for ${userId}`);

      // 3. Update transaction
      const { error: txError } = await client.from('transactions').update({
        status: 'completed',
        method: `Payhero (${transactionId || checkoutId || 'M-Pesa'})`
      })
      .eq('id', tx.id);

      if (txError) {
        console.error('Transaction status update error:', txError);
      } else {
        console.log(`Transaction ${tx.id} marked as completed.`);
      }

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
