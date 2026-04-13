import express from 'express';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";
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

// Gemini AI Setup
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// API Routes
const router = express.Router();

router.post('/ai/chat', async (req, res) => {
  const { message } = req.body;

  if (!GEMINI_API_KEY) {
    return res.json({ text: "I'm currently in maintenance mode. Please try again later or contact support if you have an urgent request." });
  }

  try {
    const model = ai!.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: `You are the PreoCryptoFX AI assistant, a friendly and expert crypto trading guide. 
      Your goal is to provide a smooth, natural conversation. 
      Answer questions about crypto, trading, and the PreoCryptoFX platform clearly and helpfully.
      
      RULES:
      1. Be professional yet warm. 
      2. Use plain text only (no markdown, no bold, no headers).
      3. If a user asks about their balance not reflecting, advise them to wait a few minutes or refresh.
      4. NEVER mention "speaking to an agent" or "contacting support" unless the user explicitly asks for a human or an agent first.
      5. If and ONLY IF the user explicitly asks to "talk to a person", "speak to an agent", or "human support", respond exactly with: "Connecting to an agent, please wait..."
      6. Do not offer agent support proactively. Focus on solving the user's query yourself.`
    });

    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    // Only return the escalation message if the AI explicitly decided it was necessary 
    // OR if the user message is a very clear direct request for a human.
    const lowerMsg = message.toLowerCase().trim();
    const isExplicitAgentRequest = 
      lowerMsg === 'agent' || 
      lowerMsg === 'human' || 
      lowerMsg === 'support' ||
      ((lowerMsg.includes('speak to') || lowerMsg.includes('talk to') || lowerMsg.includes('chat with')) && 
       (lowerMsg.includes('agent') || lowerMsg.includes('human') || lowerMsg.includes('person') || lowerMsg.includes('someone')));
    
    if (isExplicitAgentRequest || text.includes('Connecting to an agent')) {
      return res.json({ text: 'Connecting to an agent, please wait...' });
    }

    res.json({ text: text || "I'm here to help! What would you like to know about trading today?" });
  } catch (error: any) {
    console.error('AI Chat error:', error);
    res.json({ text: "I'm having a bit of trouble connecting right now. Could you try rephrasing your question?" });
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
    res.status(500).json({ 
      error: 'Failed to initiate payment', 
      details: error.response?.data || error.message 
    });
  }
});

router.post('/payhero/callback', async (req, res) => {
  const payload = req.body;
  const { status, external_reference, amount, transaction_id } = payload;

  if (status === 'Success' || status === 'Successful') {
    const userId = external_reference?.split('-')[0] || external_reference;
    const amountKes = Number(amount);
    const USD_TO_KES = 130;
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
