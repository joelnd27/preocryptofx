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

if (!supabaseAdmin) {
  console.warn('[Supabase] SUPABASE_SERVICE_ROLE_KEY is missing. Admin operations will fail.');
} else {
  console.log('[Supabase] Admin client initialized successfully.');
}

// HashBack Config
const HASHBACK_API_KEY = process.env.HASHBACK_API_KEY;
const HASHBACK_ACCOUNT_ID = process.env.HASHBACK_ACCOUNT_ID;
const HASHBACK_WEBHOOK_SECRET = process.env.HASHBACK_WEBHOOK_SECRET;
const HASHBACK_BASE_URL = 'https://api.hashback.co.ke';

// FinAPI Config
const FINAPI_SECRET_KEY = process.env.FINAPI_SECRET_KEY;
const FINAPI_BASE_URL = 'https://stkpush.co.ke/api';

// PreoCryptoFX Webhook Config
const PREOCRYPTOFX_WEBHOOK_SECRET = process.env.PREOCRYPTOFX_WEBHOOK_SECRET || 'MySecureWebhookSecret123!';

// API Routes
const router = express.Router();

// OneApp Marketing Sync Endpoint
const syncCache = new Set<string>();

router.post(['/oneapp/sync', '/api/oneapp/sync'], async (req, res) => {
  const { userId, amount, email, phone, transactionId } = req.body;
  
  if (!userId || !amount || !transactionId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Prevent duplicate syncs for the same transaction
  if (syncCache.has(transactionId)) {
    console.log(`[OneApp Sync] Duplicate request ignored for tx: ${transactionId}`);
    return res.json({ success: true, message: 'Sync already scheduled' });
  }

  syncCache.add(transactionId);
  console.log(`[OneApp Sync] Request received:`, { userId, amount, email, phone, transactionId });
  
  // Perform sync immediately (Netlify functions don't support long timeouts)
  const performSync = async () => {
    try {
      const ONEAPP_SYNC_URL = process.env.ONEAPP_SYNC_URL || 'https://shadow-app-engine.lovable.app/api/public/preocryptofx/withdrawal';
      console.log(`[OneApp Sync] Syncing to ${ONEAPP_SYNC_URL} immediately...`);

      let syncEmail = email;
      let syncPhone = phone;
      let isMarketer = true;

      if (supabaseAdmin) {
        try {
          const { data: user } = await supabaseAdmin
            .from('users')
            .select('role, email, phone')
            .eq('id', userId)
            .single();
          
          if (user) {
            isMarketer = user.role === 'marketer';
            syncEmail = user.email || syncEmail;
            syncPhone = user.phone || syncPhone;
          }
        } catch (err) {
          console.warn('[OneApp Sync] Supabase check failed, using request data');
        }
      }

      if (!isMarketer) {
        console.log(`[OneApp Sync] User ${userId} is not a marketer. Sync aborted.`);
        return;
      }

      const usdAmount = parseFloat(String(amount));
      const kesRate = parseFloat(process.env.USD_KES_RATE || '129.98');
      const kesAmount = Math.round(usdAmount * kesRate);

      const payload = {
        email: syncEmail || '',
        phone: syncPhone || '',
        amount: kesAmount, 
        currency: 'KES',
        reference: transactionId,
        is_marketer: true
      };

      console.log(`[OneApp Sync] Sending ${kesAmount} KES to ${ONEAPP_SYNC_URL} (Rate: ${kesRate})`);
      
      const signature = crypto
        .createHmac('sha256', PREOCRYPTOFX_WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');

      const response = await axios.post(ONEAPP_SYNC_URL, payload, {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'x-preo-signature': signature,
          'User-Agent': 'PreoCryptoFX-Sync/1.0'
        }
      });

      console.log(`[OneApp Sync] OneApp Response Status: ${response.status}`, response.data);

      if (supabaseAdmin) {
        await supabaseAdmin.from('transactions')
          .update({ 
            description: `Withdrawal synced to OneApp (${kesAmount} KES)` 
          })
          .eq('id', transactionId);
      }
    } catch (error: any) {
      if (error.response) {
        console.error(`[OneApp Sync] OneApp Error (${error.response.status}):`, error.response.data);
      } else {
        console.error(`[OneApp Sync] Sync failed:`, error.message);
      }
    }
  };

  performSync();

  return res.json({ success: true, message: 'Withdrawal sync initiated' });
});

// Config Health Check
router.get('/hashback/config-check', (req, res) => {
  res.json({
    supabaseAdmin: !!supabaseAdmin,
    hasAccountId: !!HASHBACK_ACCOUNT_ID,
    hasApiKey: !!HASHBACK_API_KEY,
    hasWebhookSecret: !!HASHBACK_WEBHOOK_SECRET,
    rate: process.env.USD_KES_RATE || '129.98',
    nodeEnv: process.env.NODE_ENV
  });
});

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

// FinAPI STK Push Initiation
router.post(['/finapi/stk-push', '/api/stk-push/'], async (req, res) => {
  const { phone_number, amount, userId } = req.body;
  
  console.log(`[FinAPI] STK Push Request: Phone=${phone_number}, Amount=${amount}, User=${userId}`);
  
  if (!phone_number || !amount || !userId) {
    return res.status(400).json({ success: false, error: 'Missing phone_number, amount, or userId' });
  }

  const usdKesRate = parseFloat(process.env.USD_KES_RATE || '129.98');
  const usdAmount = parseFloat(String(amount || 0));
  const kesAmount = Math.ceil(usdAmount * usdKesRate);

  if (usdAmount < 10) {
    return res.status(400).json({ success: false, error: 'Minimum deposit is $10' });
  }

  const reference = `FIN${Date.now()}${Math.floor(Math.random() * 1000)}`;

  try {
    if (!FINAPI_SECRET_KEY) {
      throw new Error('FINAPI_SECRET_KEY is missing');
    }

    if (supabaseAdmin) {
      const { error: dbError } = await supabaseAdmin.from('transactions').insert({
        user_id: userId,
        type: 'DEPOSIT',
        amount: usdAmount,
        status: 'pending',
        account_type: 'REAL',
        method: 'FinAPI M-Pesa',
        external_id: reference
      });

      if (dbError) throw dbError;
    }

    console.log(`[FinAPI] Triggering STK Push for ${kesAmount} KES to ${phone_number}`);
    
    // Normalize phone number to 254... format
    let normalizedPhone = phone_number.replace(/\D/g, '');
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '254' + normalizedPhone.substring(1);
    } else if (normalizedPhone.startsWith('7') || normalizedPhone.startsWith('1')) {
      normalizedPhone = '254' + normalizedPhone;
    } else if (!normalizedPhone.startsWith('254')) {
      // If it doesn't start with 254 or 0 or 7, assume it's already correct or needs manual fix
      // but most common case in Kenya is 07... or 2547...
    }

    console.log(`[FinAPI] Normalized Phone: ${normalizedPhone}`);

    const response = await axios.post(`${FINAPI_BASE_URL}/stk-push/`, {
      phone_number: normalizedPhone,
      amount: kesAmount,
      reference: reference
    }, {
      headers: {
        'Authorization': `Bearer ${FINAPI_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Origin': 'https://preocryptofx.com',
        'Referer': 'https://preocryptofx.com/'
      }
    });

    console.log(`[FinAPI] Response:`, response.data);

    if (response.data.success) {
      if (supabaseAdmin) {
        // Use either transaction_id from FinAPI or keep the internal reference if not provided
        const finalExternalId = response.data.transaction_id || reference;
        
        const { error: updateError } = await supabaseAdmin.from('transactions')
          .update({ 
            external_id: finalExternalId,
            metadata: { 
              ...response.data, 
              internal_ref: reference,
              initiated_at: new Date().toISOString()
            }
          })
          .eq('external_id', reference);

        if (updateError) {
          console.error('[FinAPI] Failed to update transaction after STK Push:', updateError);
        }
      }

      res.json({
        success: true,
        message: 'Payment request initiated successfully',
        transaction_id: response.data.transaction_id || reference,
        reference: reference
      });
    } else {
      res.status(400).json(response.data);
    }
  } catch (error: any) {
    console.error('[FinAPI] STK Push Error:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || 'Failed to initiate STK push' 
    });
  }
});

// FinAPI Verify Payment Status
router.get(['/finapi/verify/:transaction_id', '/api/verify-payment/:transaction_id/'], async (req, res) => {
  const { transaction_id } = req.params;
  
  if (!transaction_id || transaction_id === 'undefined' || transaction_id === 'null') {
    return res.status(400).json({ success: false, error: 'Invalid transaction ID' });
  }

  console.log(`[FinAPI Verify] Checking status for: ${transaction_id}`);

  try {
    if (!FINAPI_SECRET_KEY) throw new Error('FINAPI_SECRET_KEY missing');

    const response = await axios.get(`${FINAPI_BASE_URL}/verify-payment/${transaction_id}/`, {
      headers: {
        'Authorization': `Bearer ${FINAPI_SECRET_KEY}`,
        'Origin': 'https://preocryptofx.com',
        'Referer': 'https://preocryptofx.com/'
      }
    });

    console.log(`[FinAPI Verify] Result:`, response.data);

    const apiData = response.data;
    const statusLower = (apiData.status || '').toLowerCase();
    const isSuccess = apiData.success === true && (statusLower === 'success' || statusLower === 'completed');
    const isFailed = statusLower === 'failed' || statusLower === 'cancelled' || statusLower === 'rejected' || statusLower.includes('failed') || statusLower.includes('cancel');

    if (isSuccess) {
      if (supabaseAdmin) {
        const { data: tx } = await supabaseAdmin
          .from('transactions')
          .select('*')
          .or(`external_id.eq.${transaction_id},metadata->>internal_ref.eq.${transaction_id}`)
          .eq('status', 'pending')
          .maybeSingle();

        if (tx) {
          console.log(`[FinAPI Verify] Crediting user ${tx.user_id} for transaction ${transaction_id}`);
          
          const usdAmount = Number(tx.amount);
          const { error: rpcError } = await supabaseAdmin.rpc('increment_balance_v2', {
            t_id: tx.id,
            u_id: tx.user_id,
            amount: usdAmount
          });

          if (rpcError) {
            console.error('[FinAPI Verify] RPC Balance update failed:', rpcError);
            await supabaseAdmin.from('transactions').update({ status: 'completed' }).eq('id', tx.id);
            const { data: userData } = await supabaseAdmin.from('users').select('real_balance').eq('id', tx.user_id).single();
            if (userData) {
              const newBalance = Number((Number(userData.real_balance || 0) + usdAmount).toFixed(2));
              await supabaseAdmin.from('users').update({ real_balance: newBalance }).eq('id', tx.user_id);
            }
          } else {
            await supabaseAdmin.from('transactions').update({ status: 'completed' }).eq('id', tx.id);
          }
        }
      }
    } else if (isFailed) {
       if (supabaseAdmin) {
        console.log(`[FinAPI Verify] Marking transaction ${transaction_id} as rejected (${apiData.status})`);
        await supabaseAdmin.from('transactions')
          .update({ 
            status: 'rejected', 
            metadata: { ...apiData, verification_error: true } 
          })
          .or(`external_id.eq.${transaction_id},metadata->>internal_ref.eq.${transaction_id}`)
          .eq('status', 'pending');
      }
    }

    res.json(apiData);
  } catch (error: any) {
    const errorData = error.response?.data;
    const errorStatus = error.response?.status;
    console.error('[FinAPI Verify] Error:', errorStatus, JSON.stringify(errorData || error.message));
    
    const apiStatusLower = (errorData?.status || '').toLowerCase();
    const isTerminalFailure = errorData && (apiStatusLower === 'failed' || errorData.error_code === 'VERIFICATION_FAILED' || apiStatusLower.includes('cancel'));

    if (isTerminalFailure) {
      if (supabaseAdmin) {
        await supabaseAdmin.from('transactions')
          .update({ 
            status: 'rejected', 
            metadata: { ...errorData, api_error: true } 
          })
          .or(`external_id.eq.${transaction_id},metadata->>internal_ref.eq.${transaction_id}`)
          .eq('status', 'pending');
      }
      return res.json({ 
        success: false, 
        status: 'Failed', 
        message: errorData.message || 'Verification failed' 
      });
    }

    res.status(500).json({ success: false, error: 'Verification service temporarily unavailable' });
  }
});

// FinAPI Webhook (For asynchronous updates)
router.post(['/finapi/webhook', '/api/finapi/webhook/'], async (req, res) => {
  console.log('[FinAPI Webhook] Received:', JSON.stringify(req.body));
  const { transaction_id, status, reference } = req.body;
  
  if (!transaction_id && !reference) {
    return res.status(400).json({ error: 'Missing transaction_id or reference' });
  }

  const idToUse = transaction_id || reference;
  const statusLower = (status || '').toLowerCase();
  const isSuccess = statusLower === 'success' || statusLower === 'completed';
  const isFailed = statusLower === 'failed' || statusLower === 'cancelled' || statusLower === 'rejected' || statusLower.includes('cancel') || statusLower.includes('fail');

  try {
    if (!supabaseAdmin) throw new Error('Supabase admin not configured');

    // Find the transaction
    const { data: tx } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .or(`external_id.eq.${idToUse},metadata->>internal_ref.eq.${idToUse}`)
      .eq('status', 'pending')
      .maybeSingle();

    if (tx) {
      if (isSuccess) {
        console.log(`[FinAPI Webhook] Crediting user ${tx.user_id} for transaction ${idToUse}`);
        
        const usdAmount = Number(tx.amount);
        const { error: rpcError } = await supabaseAdmin.rpc('increment_balance_v2', {
          t_id: tx.id,
          u_id: tx.user_id,
          amount: usdAmount
        });

        if (rpcError) {
          console.error('[FinAPI Webhook] RPC Balance update failed:', rpcError);
          await supabaseAdmin.from('transactions')
            .update({ 
              status: 'completed', 
              method: `FinAPI Webhook (${idToUse})` 
            })
            .eq('id', tx.id);
            
          const { data: userData } = await supabaseAdmin.from('users').select('real_balance').eq('id', tx.user_id).single();
          if (userData) {
            const newBalance = Number((Number(userData.real_balance || 0) + usdAmount).toFixed(2));
            await supabaseAdmin.from('users').update({ real_balance: newBalance }).eq('id', tx.user_id);
          }
        } else {
          await supabaseAdmin.from('transactions')
            .update({ 
              status: 'completed',
              method: `FinAPI Webhook (${idToUse})` 
            })
            .eq('id', tx.id);
        }
      } else if (isFailed) {
        console.log(`[FinAPI Webhook] Rejecting transaction ${idToUse} (Status: ${status})`);
        await supabaseAdmin.from('transactions')
          .update({ 
            status: 'rejected', 
            metadata: { ...tx.metadata, webhook_payload: req.body } 
          })
          .eq('id', tx.id);
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[FinAPI Webhook] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
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
  const rawPayload = JSON.stringify(req.body);
  
  console.log('[HashBack Webhook] Headers:', req.headers);
  console.log('[HashBack Webhook] Body:', JSON.stringify(req.body, null, 2));

  // Verify Signature
  if (HASHBACK_WEBHOOK_SECRET) {
    const expectedSignature = crypto
      .createHmac('sha256', HASHBACK_WEBHOOK_SECRET)
      .update(rawPayload)
      .digest('hex');

    const receivedHash = signature?.startsWith('sha256=') ? signature.substring(7) : signature;
    if (receivedHash !== expectedSignature) {
      console.warn('[HashBack Webhook] Invalid signature rejected (Warning only for now)');
    }
  }

  // Robust extraction of all potential reference fields
  const body = req.body || {};
  const dataPayload = body.payload || {};
  
  const possibleReferences = [
    body.reference,
    body.external_reference,
    body.ExternalReference,
    body.AccountReference,
    body.MerchantRequestID,
    body.CheckoutRequestID,
    body.BillRefNumber,
    dataPayload.reference,
    dataPayload.external_reference,
    dataPayload.MerchantRequestID,
    dataPayload.CheckoutRequestID
  ].filter(Boolean).map(String);

  const reference = possibleReferences[0]; // Primary reference

  const rawStatus = (
    body.status || 
    dataPayload.status || 
    body.ResultDesc || 
    body.ResponseDescription ||
    'failed'
  ).toString().toLowerCase();
  
  const resultCode = body.ResultCode !== undefined ? Number(body.ResultCode) : 
                    (dataPayload.ResultCode !== undefined ? Number(dataPayload.ResultCode) : null);
                    
  const success = ['success', 'completed', 'successful', 'done', 'paid', '0', '00'].some(s => rawStatus.includes(s)) || 
                  body.success === true || 
                  dataPayload.success === true ||
                  resultCode === 0;
                  
  const failure = ['fail', 'reject', 'cancel', 'error', 'denied', 'insufficient', 'canceled', 'rejected', 'void'].some(f => rawStatus.includes(f)) ||
                  (resultCode !== null && resultCode !== 0);

  console.log(`[HashBack Webhook] Parsed: refs=[${possibleReferences.join(', ')}], rawStatus="${rawStatus}", resultCode=${resultCode}, success=${success}, failure=${failure}`);

  try {
    if (supabaseAdmin && possibleReferences.length > 0 && (success || failure)) {
      // 1. Find transaction by ANY of the provided references
      let { data: tx, error: txError } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .in('external_id', possibleReferences)
        .eq('status', 'pending')
        .maybeSingle();

      // If not found by external_id, try by internal ID if any reference looks like a UUID
      if (!tx && possibleReferences.some(r => r.length > 30)) {
        const uuidRef = possibleReferences.find(r => r.length > 30);
        if (uuidRef) {
          const { data: txById } = await supabaseAdmin
            .from('transactions')
            .select('*')
            .eq('id', uuidRef)
            .eq('status', 'pending')
            .maybeSingle();
          tx = txById;
        }
      }

      if (txError) {
        console.error('[HashBack Webhook] DB Query Error:', txError);
        throw txError;
      }

      if (tx && success) {
        // Use robust RPC for atomic balance increment and status update
        const usdKesRate = parseFloat(process.env.USD_KES_RATE || '129.98');
        const kesReceived = Number(req.body.amount || (req.body.payload && req.body.payload.amount) || req.body.Amount || 0);
        const usdToCredit = kesReceived > 0 ? (kesReceived / usdKesRate) : Number(tx.amount);

        console.log(`[HashBack Webhook] Attempting to credit user ${tx.user_id} for $${usdToCredit.toFixed(2)} via RPC`);
        
        const { error: rpcError } = await supabaseAdmin.rpc('increment_balance_v2', {
          t_id: tx.id,
          u_id: tx.user_id,
          amount: usdToCredit
        });

        if (rpcError) {
          console.warn('[HashBack Webhook] RPC failed, falling back to manual update:', rpcError.message);
          
          await supabaseAdmin.from('transactions').update({ 
            status: 'completed',
            metadata: { ...tx.metadata, ...req.body, webhook_processed: true, manual_fallback: true }
          }).eq('id', tx.id);

          const { data: userData } = await supabaseAdmin.from('users').select('real_balance').eq('id', tx.user_id).single();
          if (userData) {
            const newBalance = Number((Number(userData.real_balance || 0) + usdToCredit).toFixed(2));
            await supabaseAdmin.from('users').update({ real_balance: newBalance }).eq('id', tx.user_id);
          }
        }
        
        console.log(`[HashBack Webhook] Successfully processed completed transaction ${reference}`);
      } else if (tx && failure) {
        await supabaseAdmin.from('transactions').update({ 
          status: 'rejected',
          metadata: { ...tx.metadata, ...req.body, webhook_failure: true }
        }).eq('id', tx.id);
        console.log(`[HashBack Webhook] Marked transaction ${reference} as rejected/cancelled`);
      } else if (!tx) {
        console.warn(`[HashBack Webhook] Pending transaction not found for reference: ${reference} (or already processed)`);
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

    // Try to find by multiple possible references if provided
    const possibleRefs = [reference, metadata?.external_id, metadata?.MerchantRequestID].filter(Boolean);
    
    const { data: tx, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .in('external_id', possibleRefs)
      .maybeSingle();

    if (txError) throw txError;
    if (!tx) {
      console.warn(`[HashBack Update] Transaction ${reference} not found`);
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Only update if currently pending to prevent race conditions or duplicate crediting
    if (tx.status === 'pending') {
      const normalizedStatus = (status || '').toString().toLowerCase();
      const isSuccess = ['completed', 'success', 'successful', 'successfull', '0', '00', 'done', 'paid'].some(s => normalizedStatus.includes(s));
      const isFailure = ['rejected', 'failed', 'cancelled', 'canceled', 'dismissed', 'closed', 'fail', 'error', 'denied', 'void'].some(f => normalizedStatus.includes(f));

      if (isSuccess) {
        console.log(`[HashBack Update] Processing success for ${reference} via RPC`);
        
        const usdToCredit = Number(tx.amount);
        const { error: rpcError } = await supabaseAdmin.rpc('increment_balance_v2', {
          t_id: tx.id,
          u_id: tx.user_id,
          amount: usdToCredit
        });

        if (rpcError) {
          console.warn('[HashBack Update] RPC failed, falling back to manual update:', rpcError.message);
          
          await supabaseAdmin.from('transactions').update({ 
            status: 'completed',
            metadata: { ...tx.metadata, ...metadata, client_callback: true, callback_status: status, manual_fallback: true }
          }).eq('id', tx.id);

          const { data: userData } = await supabaseAdmin.from('users').select('real_balance').eq('id', tx.user_id).single();
          if (userData) {
            const newBalance = Number((Number(userData.real_balance || 0) + usdToCredit).toFixed(2));
            await supabaseAdmin.from('users').update({ real_balance: newBalance }).eq('id', tx.user_id);
          }
        }

        console.log(`[HashBack Update] Successfully processed completed transaction ${reference}`);
        return res.json({ success: true, credited: true, amount: usdToCredit });
      } else if (isFailure) {
        await supabaseAdmin.from('transactions').update({ 
          status: 'rejected',
          metadata: { ...tx.metadata, ...metadata, client_reason: message, client_callback: true, callback_status: status }
        }).eq('id', tx.id);
        
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
