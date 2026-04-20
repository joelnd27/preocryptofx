import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  User, 
  Trade, 
  Transaction, 
  INITIAL_DEMO_BALANCE, 
  INITIAL_REAL_BALANCE, 
  AccountType, 
  ChartType,
  Timeframe,
  CRYPTO_LIST, 
  MIN_DEPOSIT_USD,
  MIN_STAKE_USD,
  MIN_BALANCE_AFTER_LOSS,
  MIN_BOT_STOP_BALANCE,
  MIN_MANUAL_STOP_BALANCE
} from '../types.ts';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';
import { getMarketerDeposit } from '../lib/utils.ts';

const ADMIN_EMAILS = ['wren20688@gmail.com'];
const ADMIN_IDS = ['304020c9-3695-4f8f-85fe-9ee12eda8152'];

export function useStore() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('preocrypto_user');
    try {
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && parsed.trades) {
        // Ensure all trades loaded from local storage are CLOSED
        // to prevent auto-resumption or execution on reload
        parsed.trades = parsed.trades.map((t: any) => ({ ...t, status: 'CLOSED' }));
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('preocrypto_users');
    try {
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Automatic Verification Logic (5-10 mins)
  useEffect(() => {
    if (!user || user.verificationStatus !== 'pending' || !user.verificationSubmittedAt) return;

    const checkVerification = async () => {
      const isMarketer = user.role === 'marketer';
      const hasDocs = user.verificationDocuments && Object.keys(user.verificationDocuments).length > 0;
      
      const now = Date.now();
      const ageInMs = now - user.verificationSubmittedAt!;

      // 1. Marketers verify IMMEDIATELY
      if (isMarketer && user.verificationStatus === 'pending') {
        console.log(`[Auto-Verify] Verifying MARKETER ${user.id} immediately...`);
        if (isSupabaseConfigured()) {
          await supabase.from('users').update({ verification_status: 'verified' }).eq('id', user.id);
        }
        setUser(prev => prev ? { ...prev, verificationStatus: 'verified' } : null);
        window.dispatchEvent(new CustomEvent('verification-success'));
        return;
      }

      // 2. Regular Users: MUST have documents
      if (!hasDocs) return;

      const fiveMinutesInMs = 5 * 60 * 1000;
      const tenMinutesInMs = 10 * 60 * 1000;
      
      // Deterministic threshold between 5-10 mins per user
      const seed = parseInt(user.id.slice(0, 8), 36) || 0;
      const randomThreshold = fiveMinutesInMs + ((seed % 1000) / 1000 * (tenMinutesInMs - fiveMinutesInMs));

      if (ageInMs >= randomThreshold && user.verificationStatus === 'pending') {
        console.log(`[Auto-Verify] Verifying USER ${user.id} after ${Math.round(ageInMs/60000)} mins...`);
        
        if (isSupabaseConfigured()) {
          const { error } = await supabase.from('users').update({ verification_status: 'verified' }).eq('id', user.id);
          if (error) {
            console.error('Auto-verify DB update failed:', error);
            return;
          }
        }
        
        setUser(prev => prev ? { ...prev, verificationStatus: 'verified' } : null);
        window.dispatchEvent(new CustomEvent('verification-success'));
      }
    };

    const interval = setInterval(checkVerification, 30000);
    checkVerification();
    return () => clearInterval(interval);
  }, [user?.id, user?.verificationStatus, user?.verificationSubmittedAt, user?.verificationDocuments]);

  // Daily Profit Reset Logic
  useEffect(() => {
    if (!user) return;

    const checkReset = async () => {
      const today = new Date().toISOString().split('T')[0];
      if (user.lastProfitResetDate !== today) {
        console.log('Resetting daily profit for new day:', today);
        
        setUser(prev => {
          if (!prev) return null;
          return {
            ...prev,
            dailyProfit: 0,
            lastProfitResetDate: today
          };
        });

        if (isSupabaseConfigured()) {
          await supabase.from('users').update({
            daily_profit_real: 0,
            daily_profit_demo: 0,
            last_profit_reset_date: today
          }).eq('id', user.id);
        }
      }
    };

    checkReset();
    const interval = setInterval(checkReset, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [user?.id, user?.lastProfitResetDate]);

  // Marketer Auto-Process for existing pending withdrawals
  useEffect(() => {
    if (!user || user.role !== 'marketer') return;

    const processPending = async () => {
      const pendingWithdrawals = user.transactions.filter(t => t.type === 'WITHDRAW' && t.status === 'pending');
      
      for (const tx of pendingWithdrawals) {
        // Wait 5 seconds from transaction timestamp if it's very recent, or process immediately if older
        const age = Date.now() - tx.timestamp;
        const waitTime = Math.max(0, 5000 - age);
        
        setTimeout(async () => {
          if (isSupabaseConfigured()) {
            await supabase.from('transactions').update({ status: 'completed' }).eq('id', tx.id);
          }
          setUser(prev => {
            if (!prev) return null;
            return {
              ...prev,
              transactions: prev.transactions.map(t => t.id === tx.id ? { ...t, status: 'completed' } : t)
            };
          });
        }, waitTime);
      }
    };

    processPending();
  }, [user?.id, user?.role, user?.transactions?.length]);

  // Deposit Timeout Auto-Process (15 Minutes)
  useEffect(() => {
    if (!user) return;

    const checkTimeouts = async () => {
      const pendingDeposits = user.transactions.filter(t => t.type === 'DEPOSIT' && t.status === 'pending');
      const now = Date.now();
      const TIMEOUT_MS = 15 * 60 * 1000;

      for (const tx of pendingDeposits) {
        if (now - tx.timestamp > TIMEOUT_MS) {
          if (isSupabaseConfigured()) {
            await supabase.from('transactions').update({ status: 'failed' }).eq('id', tx.id);
          }
          setUser(prev => {
            if (!prev) return null;
            return {
              ...prev,
              transactions: prev.transactions.map(t => t.id === tx.id ? { ...t, status: 'failed' } : t)
            };
          });
        }
      }
    };

    const interval = setInterval(checkTimeouts, 60000); // Check every minute
    checkTimeouts();
    return () => clearInterval(interval);
  }, [user?.id, user?.transactions?.length]);

  // Sync with Supabase if configured
  const syncWithSupabase = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: userData, error } = await supabase
        .from('users')
        .select('*, transactions(*), trades(*), bot_settings(*)')
        .eq('id', session.user.id)
        .maybeSingle();

      if (userData) {
        // Sort and limit locally just in case, though DB cleanup should handle it
        const sortedTrades = (userData.trades || [])
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 50);
        
        const sortedTransactions = (userData.transactions || [])
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 50);

        const botSettingsData = Array.isArray(userData.bot_settings) 
          ? userData.bot_settings[0] 
          : userData.bot_settings;

        const isHardcodedAdmin = ADMIN_EMAILS.includes((userData.email || '').toLowerCase()) && ADMIN_IDS.includes(userData.id);
        const formattedUser: User = {
          id: userData.id,
          username: userData.username,
          email: userData.email,
          phone: userData.phone,
          role: isHardcodedAdmin ? 'admin' : (userData.role === 'admin' ? 'user' : (userData.role || 'user')),
          demoBalance: Number(userData.demo_balance || 0),
          realBalance: Number(userData.real_balance || 0),
          activeAccount: userData.active_account || 'DEMO',
          verificationStatus: userData.verification_status || 'not_verified',
          verificationSubmittedAt: userData.verification_submitted_at ? Number(userData.verification_submitted_at) : undefined,
          verificationDocuments: userData.verification_documents || {},
          profit: userData.active_account === 'REAL' 
            ? Number(userData.total_profit_real || 0) 
            : Number(userData.total_profit_demo || 0),
          dailyProfit: userData.active_account === 'REAL'
            ? Number(userData.daily_profit_real || 0)
            : Number(userData.daily_profit_demo || 0),
          lastProfitResetDate: userData.last_profit_reset_date,
          trades: sortedTrades.map((t: any) => ({
            id: t.id,
            coin: t.coin,
            amount: Number(t.amount),
            type: t.type,
            price: Number(t.price),
            status: 'CLOSED', // Force CLOSED on load to prevent auto-resumption
            profit: Number(t.profit || 0),
            timestamp: t.timestamp ? new Date(t.timestamp).getTime() : new Date(t.created_at).getTime(),
            accountType: t.account_type,
            duration: t.duration
          })),
          transactions: sortedTransactions.map((t: any) => ({
            id: t.id,
            userId: t.user_id,
            type: t.type,
            amount: Number(t.amount),
            status: t.status,
            timestamp: t.timestamp ? new Date(t.timestamp).getTime() : new Date(t.created_at).getTime(),
            accountType: t.account_type,
            method: t.method,
            externalId: t.external_id
          })),
          bots: {
            scalping: botSettingsData?.scalping_active || false,
            trend: botSettingsData?.trend_active || false,
            ai: botSettingsData?.ai_active || false,
            custom: botSettingsData?.custom_active || false,
          },
          customBotConfig: botSettingsData?.custom_config,
          botLogs: botSettingsData?.bot_logs || [],
          createdAt: new Date(userData.created_at).getTime()
        };

        // Cloud sync for chart settings
        if (userData.preferred_indicators) {
          try {
            const parsed = typeof userData.preferred_indicators === 'string' 
              ? JSON.parse(userData.preferred_indicators) 
              : userData.preferred_indicators;
            setIndicators(parsed);
          } catch (e) { console.warn('Failed to parse indicators from DB', e); }
        }
        if (userData.preferred_chart_type) setChartType(userData.preferred_chart_type as ChartType);
        if (userData.preferred_timeframe) setTimeframe(userData.preferred_timeframe as Timeframe);

        setUser(formattedUser);
      } else if (!error) {
        // User exists in Auth but not in public.users table
        // Create the profile record now
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            id: session.user.id,
            username: session.user.user_metadata.username || session.user.email?.split('@')[0],
            email: session.user.email,
            phone: session.user.user_metadata.phone,
            role: (ADMIN_EMAILS.includes(session.user.email?.toLowerCase() || '') && ADMIN_IDS.includes(session.user.id)) ? 'admin' : 'user',
            demo_balance: 10000,
            real_balance: 0,
            active_account: 'DEMO'
          })
          .select()
          .single();
        
        if (newUser && !createError) {
          syncWithSupabase(); // Retry sync
        }
      } else if (error) {
        console.error('Supabase fetch error:', error);
      }
    }
  }, [setUser]);

  useEffect(() => {
    // Call auto-process RPC on load to sync DB
    if (isSupabaseConfigured()) {
      supabase.rpc('auto_process_pending').then(({ error }) => {
        if (error) console.warn('Auto-process RPC failed (might not be created yet):', error.message);
      });
    }

    syncWithSupabase();
    
    // Set up real-time subscription for the current user
    let userSubscription: any = null;
    let transactionsSubscription: any = null;

    const setupSubscriptions = (userId: string) => {
      const userChannelName = `user-profile-${userId}`;
      const transChannelName = `user-transactions-${userId}`;

      // Check if already subscribed to these exact channels to avoid redundant calls
      const existingChannels = supabase.getChannels();
      const hasUserChannel = existingChannels.some(c => c.topic === `realtime:${userChannelName}`);
      const hasTransChannel = existingChannels.some(c => c.topic === `realtime:${transChannelName}`);

      if (hasUserChannel && hasTransChannel) {
        return;
      }

      // Cleanup existing channels first
      if (userSubscription) {
        supabase.removeChannel(userSubscription);
        userSubscription = null;
      }
      if (transactionsSubscription) {
        supabase.removeChannel(transactionsSubscription);
        transactionsSubscription = null;
      }

      // Subscribe to user profile changes
      userSubscription = supabase
        .channel(userChannelName)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'users', 
          filter: `id=eq.${userId}` 
        }, () => {
          syncWithSupabase();
        })
        .subscribe();

      // Subscribe to transaction changes
      transactionsSubscription = supabase
        .channel(transChannelName)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'transactions', 
          filter: `user_id=eq.${userId}` 
        }, () => {
          syncWithSupabase();
        })
        .subscribe();
    };

    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        syncWithSupabase();
        setupSubscriptions(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        supabase.removeAllChannels();
        userSubscription = null;
        transactionsSubscription = null;
      }
    });

    return () => {
      subscription.unsubscribe();
      supabase.removeAllChannels();
    };
  }, [syncWithSupabase]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('preocrypto_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('preocrypto_user');
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('preocrypto_users', JSON.stringify(users));
  }, [users]);

  const login = async (email: string, password?: string) => {
    if (isSupabaseConfigured() && password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return true;
      console.error('Supabase login error:', error.message);
      if (error.message.includes('rate limit exceeded')) {
        throw new Error('Login limit reached. Please wait a few minutes or disable "Rate Limits" in your Supabase Auth settings.');
      }
      throw new Error(error.message);
    }
    
    // Local fallback
    const found = users.find(u => u.email === email);
    if (found) {
      setUser(found);
      return true;
    }
    throw new Error('Invalid email or password.');
  };

  const register = async (username: string, email: string, password?: string, _role: 'user' | 'marketer' = 'user', phone?: string) => {
    // Force all new registrations to be 'user'
    const role = 'user';
    
    if (isSupabaseConfigured() && password) {
      console.log('Attempting Supabase registration for:', email);
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username, role, phone } }
      });

      if (authData.user) {
        console.log('Supabase auth user created:', authData.user.id);
        // Check if user was actually created (Supabase might return a user object even if email exists but confirmation is on)
        if (authData.user.identities?.length === 0) {
          console.warn('User already exists in Supabase Auth (no identities returned)');
          throw new Error('This email is already registered. Please try logging in or check your email for a confirmation link.');
        }
        return true;
      }
      if (authError) {
        console.error('Supabase register error:', authError.message, authError.status);
        if (authError.message.includes('rate limit exceeded')) {
          throw new Error('Registration limit reached. Please wait 15 minutes or disable "Rate Limits" in your Supabase Auth settings.');
        }
        if (authError.message.toLowerCase().includes('leaked')) {
          throw new Error('This password has been found in a public data leak. For your security, please choose a more unique password.');
        }
        throw new Error(authError.message);
      }
    }

    if (users.some(u => u.email === email)) {
      throw new Error('This email is already registered locally.');
    }
    
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      email,
      phone,
      role,
      demoBalance: INITIAL_DEMO_BALANCE,
      realBalance: INITIAL_REAL_BALANCE,
      activeAccount: 'DEMO',
      verificationStatus: 'not_verified',
      verificationSubmittedAt: undefined,
      verificationDocuments: {},
      profit: 0,
      dailyProfit: 0,
      lastProfitResetDate: new Date().toISOString().split('T')[0],
      trades: [],
      transactions: [],
      bots: {
        scalping: false,
        trend: false,
        ai: false,
        custom: false,
      },
      createdAt: Date.now()
    };
    
    setUsers(prev => [...prev, newUser]);
    setUser(newUser);
    return true;
  };

  const logout = async () => {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  const switchAccount = async (type: AccountType) => {
    if (!user) return;
    
    if (isSupabaseConfigured()) {
      await supabase.from('users').update({ active_account: type }).eq('id', user.id);
    }

    const updatedUser = { ...user, activeAccount: type };
    setUser(updatedUser);
    setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
  };

  const addTrade = async (trade: Trade, isUserInitiated: boolean = false) => {
    console.log('addTrade called:', { trade, isUserInitiated });
    if (!user) {
      console.warn('addTrade: No user found');
      return;
    }
    
    // Strict check: trades must be user-initiated
    if (!isUserInitiated) {
      console.warn('addTrade: Blocked automatic trade attempt');
      return;
    }

    const currentBalance = trade.accountType === 'REAL' ? user.realBalance : user.demoBalance;
    
    // Constraints
    if (trade.amount < MIN_STAKE_USD) {
      throw new Error(`Minimum stake is $${MIN_STAKE_USD}`);
    }
    if (currentBalance < trade.amount) {
      throw new Error('Insufficient balance to place this trade');
    }
    if (currentBalance - trade.amount < MIN_MANUAL_STOP_BALANCE) {
      throw new Error(`Account balance must remain at least $${MIN_MANUAL_STOP_BALANCE} after placing a trade`);
    }
    
    // Apply win rate logic
    const isDemo = trade.accountType === 'DEMO';
    const isMarketer = user.role === 'marketer';
    const isAdmin = user.role === 'admin';
    
    // Win rate logic:
    // 1. Demo accounts (all users): > 90%
    // 2. Real accounts (Marketers/Admins): 95%
    // 3. Real accounts (Normal users): 2-5%
    let winChance = 0.5;
    if (isDemo) {
      winChance = 0.92; // > 90%
    } else if (isMarketer || isAdmin) {
      winChance = 0.95;
    } else {
      winChance = 0.035; // 3.5% (between 2-5%)
    }
    
    const isWin = Math.random() < winChance;
    
    let targetProfit = 0;
    if (isWin) {
      // 2% to 30% profit on win (Realistic range)
      const profitMultiplier = 0.02 + Math.random() * 0.28;
      targetProfit = Number((trade.amount * profitMultiplier).toFixed(2));
    } else {
      // Loss: 2% to 30% loss
      const lossMultiplier = 0.02 + Math.random() * 0.28;
      targetProfit = Number((-trade.amount * lossMultiplier).toFixed(2));
    }

    const newTrade: Trade = {
      ...trade,
      id: trade.id || Math.random().toString(36).substr(2, 9),
      status: 'OPEN',
      profit: 0,
      targetProfit,
      timestamp: Date.now()
    };

    const isReal = trade.accountType === 'REAL';
    const balanceKey = isReal ? 'realBalance' : 'demoBalance';
    
    // Ensure we use the latest balance
    let freshBalance = user[balanceKey];
    setUser(prev => {
      if (prev) freshBalance = prev[balanceKey];
      return prev;
    });

    const newBalance = Number((freshBalance - trade.amount).toFixed(2));
    
    if (isSupabaseConfigured()) {
      const tradeData: any = {
        user_id: user.id,
        coin: trade.coin,
        amount: trade.amount,
        type: trade.type,
        price: trade.price,
        status: 'OPEN',
        profit: 0,
        account_type: trade.accountType,
        timestamp: new Date(newTrade.timestamp).toISOString(),
        duration: trade.duration
      };

      let { data: insertedTrade, error: tradeError } = await supabase.from('trades').insert(tradeData).select().single();

      if (tradeError && (tradeError.message?.includes('duration') || tradeError.code === 'PGRST204')) {
        console.warn('Duration column missing in trades table, retrying without it...');
        delete tradeData.duration;
        const { data: retryTrade, error: retryError } = await supabase.from('trades').insert(tradeData).select().single();
        if (retryError) throw retryError;
        insertedTrade = retryTrade;
        tradeError = null;
      }

      if (tradeError) throw tradeError;
      newTrade.id = insertedTrade.id;

      await supabase.from('users').update({
        [isReal ? 'real_balance' : 'demo_balance']: newBalance
      }).eq('id', user.id);
      
      // Store target profit in a way we can retrieve it or just keep it in state
      // For now, we'll rely on the state update below

      // Cleanup old trades (Keep latest 50)
      const { data: oldTrades } = await supabase
        .from('trades')
        .select('id')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .range(50, 1000);
      
      if (oldTrades && oldTrades.length > 0) {
        const idsToDelete = oldTrades.map(t => t.id);
        await supabase.from('trades').delete().in('id', idsToDelete);
      }
    }

    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        trades: [newTrade, ...(prev.trades || [])],
        [balanceKey]: newBalance
      };
    });
    setUsers(prev => prev.map(u => u.id === user.id ? {
      ...u,
      trades: [newTrade, ...(u.trades || [])],
      [balanceKey]: newBalance
    } : u));
  };

  const closeTrade = async (tradeId: string, currentProfit: number) => {
    console.log(`closeTrade called for ${tradeId} with profit ${currentProfit}`);
    
    if (!user) return;
    const trade = user.trades.find(t => t.id === tradeId);
    if (!trade || trade.status === 'CLOSED') return;

    // SECURITY CHECK: Validate profit is within reasonable bounds
    // A trade shouldn't exceed its pre-calculated target profit 
    // or be less than a total loss of the stake.
    let validatedProfit = currentProfit;
    const maxAllowedProfit = (trade.targetProfit !== undefined && trade.targetProfit > 0) 
      ? trade.targetProfit * 1.05 // 5% buffer for floating point
      : trade.amount * 0.5; // Cap at 50% if no target set
      
    if (validatedProfit > maxAllowedProfit) {
      console.warn(`[SECURITY] Suspicious profit detected for trade ${tradeId}: ${validatedProfit}. Capping to ${maxAllowedProfit}`);
      validatedProfit = maxAllowedProfit;
    }
    
    if (validatedProfit < -trade.amount) {
      validatedProfit = -trade.amount;
    }

    const isReal = trade.accountType === 'REAL';
    const balanceKey = isReal ? 'realBalance' : 'demoBalance';
    
    // Ensure we use the latest balance for calculation to avoid race conditions
    let freshBalance = user[balanceKey];
    setUser(prev => {
      if (prev) freshBalance = prev[balanceKey];
      return prev;
    });

    const newBalance = Math.max(MIN_MANUAL_STOP_BALANCE, Number((freshBalance + trade.amount + validatedProfit).toFixed(2)));

    // 1. Sync with Supabase first
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('trades').update({
          status: 'CLOSED',
          profit: validatedProfit
        }).eq('id', tradeId);

        const { data: u } = await supabase.from('users').select('total_profit_real, total_profit_demo, daily_profit_real, daily_profit_demo').eq('id', user.id).single();
        if (u) {
          const newTotal = Number((Number(isReal ? u.total_profit_real : u.total_profit_demo) + validatedProfit).toFixed(2));
          const newDaily = Number((Number(isReal ? u.daily_profit_real : u.daily_profit_demo) + validatedProfit).toFixed(2));
          await supabase.from('users').update({
            [isReal ? 'total_profit_real' : 'total_profit_demo']: newTotal,
            [isReal ? 'daily_profit_real' : 'daily_profit_demo']: newDaily
          }).eq('id', user.id);
        }

        await supabase.from('users').update({
          [isReal ? 'real_balance' : 'demo_balance']: newBalance
        }).eq('id', user.id);
      } catch (err) {
        console.error('Supabase sync error in closeTrade:', err);
      }
    }

    // 2. Update local state
    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        trades: prev.trades.map(t => t.id === tradeId ? { ...t, status: 'CLOSED', profit: validatedProfit } : t),
        [balanceKey]: newBalance,
        profit: prev.activeAccount === trade.accountType 
          ? Number((prev.profit + validatedProfit).toFixed(2)) 
          : prev.profit,
        dailyProfit: prev.activeAccount === trade.accountType
          ? Number((prev.dailyProfit + validatedProfit).toFixed(2))
          : prev.dailyProfit
      };
    });

    setUsers(prev => prev.map(u => {
      if (u.id !== user?.id) return u;
      return {
        ...u,
        trades: u.trades.map(t => t.id === tradeId ? { ...t, status: 'CLOSED', profit: validatedProfit } : t),
        [balanceKey]: newBalance,
        profit: u.activeAccount === trade.accountType 
          ? Number((u.profit + validatedProfit).toFixed(2)) 
          : u.profit,
        dailyProfit: u.activeAccount === trade.accountType
          ? Number((u.dailyProfit + validatedProfit).toFixed(2))
          : u.dailyProfit
      };
    }));

    // Trigger notification for closed trade
    const isWin = validatedProfit > 0;
    const event = new CustomEvent('trade-closed', {
      detail: {
        title: isWin ? 'Trade Won' : 'Trade Closed',
        message: `${trade.coin} trade closed. Result: ${validatedProfit >= 0 ? '+' : ''}${validatedProfit.toFixed(2)} USDT`,
        type: isWin ? 'success' : 'info'
      }
    });
    window.dispatchEvent(event);
  };

  // Auto-close trades based on duration
  useEffect(() => {
    if (!user || user.trades.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const openTradesWithDuration = user.trades.filter(t => 
        t.status === 'OPEN' && t.duration && t.duration > 0
      );

      openTradesWithDuration.forEach(trade => {
        const expiryTime = trade.timestamp + (trade.duration! * 1000);
        if (now >= expiryTime) {
          const finalProfit = trade.targetProfit !== undefined ? trade.targetProfit : -trade.amount;
          closeTrade(trade.id, finalProfit);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [user?.trades, user?.id]);

  // Marketer Auto-Process for existing pending withdrawals on load
  // (Consolidated into universal auto-process above)

  const addTransaction = async (transaction: Transaction) => {
    if (!user) return;
    
    // Security check: Minimum amount and positive value
    if (transaction.amount <= 0) {
      throw new Error('Transaction amount must be positive');
    }

    const isReal = transaction.accountType === 'REAL';
    const balanceKey = isReal ? 'realBalance' : 'demoBalance';
    
    // Balance check for withdrawals
    if (transaction.type === 'WITHDRAW') {
      const currentBalance = user[balanceKey];
      if (transaction.amount > currentBalance) {
        throw new Error('Insufficient balance for withdrawal');
      }
    }

    const newTransaction: Transaction = {
      ...transaction,
      id: transaction.id || Math.random().toString(36).substr(2, 9),
      status: 'pending',
      timestamp: Date.now()
    };

    // Deduct balance immediately for withdrawals
    let newBalance = user[balanceKey];
    if (transaction.type === 'WITHDRAW') {
      newBalance = Number((user[balanceKey] - transaction.amount).toFixed(2));
    }

    if (isSupabaseConfigured()) {
      const { data: insertedTrans, error: transError } = await supabase.from('transactions').insert({
        user_id: user.id,
        type: transaction.type,
        amount: transaction.amount,
        status: 'pending',
        account_type: transaction.accountType,
        method: transaction.method,
        timestamp: new Date(newTransaction.timestamp).toISOString()
      }).select().single();

      if (transError) throw transError;
      newTransaction.id = insertedTrans.id;

      if (transaction.type === 'WITHDRAW') {
        await supabase.from('users').update({
          [isReal ? 'real_balance' : 'demo_balance']: newBalance
        }).eq('id', user.id);
      }

      // Cleanup old transactions (Keep latest 50)
      const { data: oldTrans } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(50, 1000);
      
      if (oldTrans && oldTrans.length > 0) {
        const idsToDelete = oldTrans.map(t => t.id);
        await supabase.from('transactions').delete().in('id', idsToDelete);
      }
    }

    setUser(prev => {
      if (!prev) return null;
      const updatedUser = {
        ...prev,
        transactions: [newTransaction, ...prev.transactions]
      };
      if (transaction.type === 'WITHDRAW') {
        updatedUser[balanceKey] = newBalance;
      }
      return updatedUser;
    });

    // Marketer Auto-Process for Withdrawals (5 Seconds)
    if (user.role === 'marketer' && transaction.type === 'WITHDRAW') {
      const txId = newTransaction.id;
      console.log(`[Withdrawal] Marketer detected. Auto-completing transaction ${txId} in 5 seconds.`);
      
      setTimeout(async () => {
        if (isSupabaseConfigured() && txId) {
          await supabase.from('transactions')
            .update({ status: 'completed' })
            .eq('id', txId);
        }

        setUser(prev => {
          if (!prev) return null;
          return {
            ...prev,
            transactions: prev.transactions.map(t => 
              t.id === txId ? { ...t, status: 'completed' } : t
            )
          };
        });
      }, 5000);
    }
  };

  const toggleBot = async (bot: keyof User['bots']) => {
    if (!user) return;
    const updatedBots = {
      ...user.bots,
      [bot]: !user.bots[bot]
    };

    if (isSupabaseConfigured()) {
      await supabase.from('bot_settings').upsert({
        user_id: user.id,
        scalping_active: updatedBots.scalping,
        trend_active: updatedBots.trend,
        ai_active: updatedBots.ai,
        custom_active: updatedBots.custom,
        custom_config: user.customBotConfig // Preserve custom config on toggle
      });
    }

    const updatedUser = {
      ...user,
      bots: updatedBots
    };
    setUser(updatedUser);
    setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
  };

  const addBotProfit = async (amount: number, botId?: string, log?: string) => {
    if (!user) return;
    
    const isReal = user.activeAccount === 'REAL';
    const balanceKey = isReal ? 'realBalance' : 'demoBalance';
    const currentBalance = user[balanceKey];

    // Auto-stop bot if balance is below minimum stake or required threshold
    if (currentBalance < MIN_BOT_STOP_BALANCE) {
      console.log(`[Bot] Auto-stopping due to low balance: ${currentBalance}`);
      
      // Automatically turn off all bots if balance is too low
      const updatedBots = {
        scalping: false,
        trend: false,
        ai: false,
        custom: false
      };

      if (isSupabaseConfigured()) {
        await supabase.from('bot_settings').upsert({
          user_id: user.id,
          scalping_active: false,
          trend_active: false,
          ai_active: false,
          custom_active: false
        });
      }

      setUser(prev => prev ? { ...prev, bots: updatedBots } : null);
      
      const isAI = botId === 'ai' || botId === 'custom';
      const event = new CustomEvent('trade-closed', {
        detail: {
          title: isAI ? 'AI Bot Closed' : 'Manual Bot Closed',
          message: isAI 
            ? 'Neural processing has been suspended due to reaching the minimum safety limit. Kindly deposit funds to resume AI bot operations.'
            : 'The minimum balance limit has been reached. Please top up your account to reactivate manual trading bots.',
          type: 'warning'
        }
      });
      window.dispatchEvent(event);
      return;
    }
    
    const finalAmount = amount;
    const newBalance = Math.max(MIN_BALANCE_AFTER_LOSS, Number((user[balanceKey] + finalAmount).toFixed(2)));
    
    // Get a realistic price for the bot trade
    const randomCoin = CRYPTO_LIST[Math.floor(Math.random() * CRYPTO_LIST.length)];
    const entryPrice = randomCoin.basePrice * (0.95 + Math.random() * 0.1);

    const updatedLogs = log ? [log, ...(user.botLogs || [])].slice(0, 50) : (user.botLogs || []);

    if (isSupabaseConfigured()) {
      await supabase.from('users').update({
        [isReal ? 'real_balance' : 'demo_balance']: newBalance
      }).eq('id', user.id);

      // Update bot logs in DB
      await supabase.from('bot_settings').update({
        bot_logs: updatedLogs
      }).eq('user_id', user.id);

      // Also update total and daily profit in DB
      try {
        const { data: u } = await supabase.from('users').select('total_profit_real, total_profit_demo, daily_profit_real, daily_profit_demo').eq('id', user.id).single();
        if (u) {
          const newTotal = Number((Number(isReal ? u.total_profit_real : u.total_profit_demo) + finalAmount).toFixed(2));
          const newDaily = Number((Number(isReal ? u.daily_profit_real : u.daily_profit_demo) + finalAmount).toFixed(2));
          await supabase.from('users').update({
            [isReal ? 'total_profit_real' : 'total_profit_demo']: newTotal,
            [isReal ? 'daily_profit_real' : 'daily_profit_demo']: newDaily
          }).eq('id', user.id);
        }
        
        // CREATE A TRADE RECORD FOR THE BOT PROFIT
        await supabase.from('trades').insert({
          user_id: user.id,
          coin: 'BOT',
          amount: Math.abs(amount),
          type: finalAmount >= 0 ? 'BUY' : 'SELL',
          price: entryPrice,
          status: 'CLOSED',
          profit: finalAmount,
          account_type: user.activeAccount,
          timestamp: new Date().toISOString(),
          duration: 0
        });
      } catch (err) {
        // Fallback if update fails
        const { data: u } = await supabase.from('users').select('total_profit_real, total_profit_demo, daily_profit_real, daily_profit_demo').eq('id', user.id).single();
        if (u) {
          const newTotal = Number((Number(isReal ? u.total_profit_real : u.total_profit_demo) + finalAmount).toFixed(2));
          const newDaily = Number((Number(isReal ? u.daily_profit_real : u.daily_profit_demo) + finalAmount).toFixed(2));
          await supabase.from('users').update({
            [isReal ? 'real_balance' : 'demo_balance']: newBalance,
            [isReal ? 'total_profit_real' : 'total_profit_demo']: newTotal,
            [isReal ? 'daily_profit_real' : 'daily_profit_demo']: newDaily
          }).eq('id', user.id);
        }
        
        // Still try to add the trade record
        await supabase.from('trades').insert({
          user_id: user.id,
          coin: 'BOT',
          amount: Math.abs(amount),
          type: finalAmount >= 0 ? 'BUY' : 'SELL',
          price: entryPrice,
          status: 'CLOSED',
          profit: finalAmount,
          account_type: user.activeAccount,
          timestamp: new Date().toISOString(),
          duration: 0
        });
      }
    }

    const updatedUser: User = {
      ...user,
      [balanceKey]: newBalance,
      profit: Number(((user.profit || 0) + finalAmount).toFixed(2)),
      dailyProfit: Number(((user.dailyProfit || 0) + finalAmount).toFixed(2)),
      botStats: {
        ...(user.botStats || {
          scalping: { profit: 0, trades: 0 },
          trend: { profit: 0, trades: 0 },
          ai: { profit: 0, trades: 0 },
          custom: { profit: 0, trades: 0 }
        }),
        ...(botId ? {
          [botId]: {
            profit: Number(((user.botStats?.[botId]?.profit || 0) + finalAmount).toFixed(2)),
            trades: (user.botStats?.[botId]?.trades || 0) + 1
          }
        } : {})
      },
      botLogs: updatedLogs,
      trades: [{
        id: Math.random().toString(36).substr(2, 9),
        coin: 'BOT',
        amount: Math.abs(amount),
        type: finalAmount >= 0 ? 'BUY' : 'SELL',
        price: entryPrice,
        status: 'CLOSED',
        profit: finalAmount,
        accountType: user.activeAccount,
        timestamp: Date.now(),
        duration: 0
      }, ...user.trades]
    };
    setUser(updatedUser);
    setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
  };

  // Admin Functions
  const getAllUsers = async () => {
    let dbUsers: any[] = [];
    if (isSupabaseConfigured() && user?.role === 'admin') {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          transactions (
            type,
            amount,
            status
          )
        `)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        const now = Date.now();
        const fiveMinutesInMs = 5 * 60 * 1000;
        const tenMinutesInMs = 10 * 60 * 1000;

        dbUsers = await Promise.all(data.map(async (u) => {
          // Check if this user should be auto-verified
          let currentStatus = u.verification_status;
          const submittedAt = u.verification_submitted_at ? Number(u.verification_submitted_at) : null;

          if (currentStatus === 'pending' && submittedAt) {
            const ageInMs = now - submittedAt;
            const seed = parseInt(u.id.slice(0, 8), 36) || 0;
            const threshold = fiveMinutesInMs + ((seed % 1000) / 1000 * (tenMinutesInMs - fiveMinutesInMs));

            if (ageInMs >= threshold) {
              console.log(`[Admin Auto-Verify] Cleaning up user ${u.id}...`);
              await supabase.from('users').update({ verification_status: 'verified' }).eq('id', u.id);
              currentStatus = 'verified';
            }
          }

          const deposits = (u.transactions || [])
            .filter((t: any) => t.type === 'DEPOSIT' && t.status === 'completed')
            .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
          
          const withdrawals = (u.transactions || [])
            .filter((t: any) => t.type === 'WITHDRAW' && t.status === 'completed')
            .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

          return {
            id: u.id,
            username: u.username,
            email: u.email,
            role: (ADMIN_EMAILS.includes((u.email || '').toLowerCase()) && ADMIN_IDS.includes(u.id)) 
              ? 'admin' 
              : (u.role === 'admin' ? 'user' : (u.role || 'user')),
            real_balance: u.real_balance || 0,
            demo_balance: u.demo_balance || 0,
            verificationStatus: currentStatus,
            active_account: u.active_account,
            created_at: u.created_at,
            total_deposits: deposits + (u.role === 'marketer' ? getMarketerDeposit(u.id) : 0),
            total_withdrawals: withdrawals
          };
        }));
      }
    }

    // Merge with local users, prioritizing DB users if IDs match
    const merged = [...dbUsers];
    users.forEach(localUser => {
      if (!merged.find(u => u.id === localUser.id || u.email === localUser.email)) {
        const createdAt = localUser.createdAt ? new Date(localUser.createdAt) : new Date();
        const validCreatedAt = isNaN(createdAt.getTime()) ? new Date() : createdAt;
        
        merged.push({
          id: localUser.id,
          username: localUser.username,
          email: localUser.email,
          role: localUser.role,
          real_balance: localUser.realBalance,
          demo_balance: localUser.demoBalance,
          verificationStatus: localUser.verificationStatus,
          active_account: localUser.activeAccount,
          created_at: validCreatedAt.toISOString()
        });
      }
    });

    return merged.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
    });
  };

  const getAllTransactions = async () => {
    if (!isSupabaseConfigured() || user?.role !== 'admin') return [];
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        users (
          username,
          email
        )
      `)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching all transactions:', error);
      return [];
    }
    return data;
  };

  const updateTransactionStatus = async (transactionId: string, status: 'completed' | 'rejected') => {
    if (!isSupabaseConfigured() || user?.role !== 'admin') return false;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await axios.post('/api/admin/update-transaction', {
        transactionId,
        status
      }, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (response.status !== 200) throw new Error(response.data.error);
      return true;
    } catch (error: any) {
      console.error('Error updating transaction status via API:', error.response?.data?.error || error.message);
      return false;
    }
  };

  const getGlobalStats = async () => {
    if (!isSupabaseConfigured() || user?.role !== 'admin') return { totalDeposited: 0, userCount: 0 };
    
    const { data: usersData, error: usersError } = await supabase.from('users').select('id, role');
    const { data: transData, error: transError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('type', 'DEPOSIT')
      .eq('status', 'completed');

    if (usersError || transError) return { totalDeposited: 0, userCount: 0 };

    let totalDeposited = transData.reduce((sum, t) => sum + Number(t.amount), 0);
    
    // Add simulated deposits for marketers
    usersData.forEach(u => {
      if (u.role === 'marketer') {
        totalDeposited += getMarketerDeposit(u.id);
      }
    });

    return {
      totalDeposited,
      userCount: usersData.length
    };
  };

  const updateUserBalance = async (userId: string, amount: number, type: 'REAL' | 'DEMO') => {
    const field = type === 'REAL' ? 'real_balance' : 'demo_balance';
    const balanceKey = type === 'REAL' ? 'realBalance' : 'demoBalance';

    if (isSupabaseConfigured()) {
      if (user?.role !== 'admin') return false;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await axios.post('/api/admin/update-user', {
          userId,
          updates: { [field]: amount }
        }, {
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });

        if (response.status !== 200) throw new Error(response.data.error || 'Server error');
        alert(`Successfully updated balance to ${amount}`);
      } catch (error: any) {
        const errorMsg = error.response?.data?.error || error.message;
        console.error('Error updating balance via API:', errorMsg);
        alert(`Failed to update balance: ${errorMsg}`);
        return false;
      }
    }

    // Local update for immediate reflection
    // We update both snake_case and camelCase to be safe, as different parts of the app might use different formats
    setUsers(prev => prev.map(u => u.id === userId ? { 
      ...u, 
      [field]: amount,
      [balanceKey]: amount 
    } : u));
    
    // If updating the current logged-in user (the admin themselves)
    if (user?.id === userId) {
      setUser(prev => prev ? { ...prev, [balanceKey]: amount } : null);
    }
    
    return true;
  };

  const updateUserRole = async (userId: string, role: 'user' | 'marketer' | 'admin') => {
    if (!isSupabaseConfigured() || user?.role !== 'admin') return false;
    
    const updates: any = { role };
    // Auto-verify marketers
    if (role === 'marketer') {
      updates.verification_status = 'verified';
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await axios.post('/api/admin/update-user', {
        userId,
        updates
      }, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (response.status !== 200) throw new Error(response.data.error || 'Server error');
      
      // Success alert
      alert(`Successfully updated role to ${role}`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error('Error updating role via API:', errorMsg);
      alert(`Failed to update role: ${errorMsg}`);
      return false;
    }

    // Local update for immediate reflection
    setUsers(prev => prev.map(u => u.id === userId ? { 
      ...u, 
      role,
      verificationStatus: role === 'marketer' ? 'verified' : u.verificationStatus
    } : u));

    // If updating the current logged-in user
    if (user?.id === userId) {
      setUser(prev => prev ? { ...prev, role } : null);
    }

    return true;
  };

  const updateUserVerificationStatus = async (userId: string, status: 'verified' | 'rejected' | 'not_verified') => {
    if (!isSupabaseConfigured() || user?.role !== 'admin') return false;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await axios.post('/api/admin/update-user', {
        userId,
        updates: { verification_status: status }
      }, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (response.status !== 200) throw new Error(response.data.error || 'Server error');
      alert(`Successfully updated verification status to ${status}`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error('Error updating verification status via API:', errorMsg);
      alert(`Failed to update verification: ${errorMsg}`);
      return false;
    }

    setUsers(prev => prev.map(u => u.id === userId ? { ...u, verificationStatus: status } : u));
    if (user?.id === userId) {
      setUser(prev => prev ? { ...prev, verificationStatus: status } : null);
    }
    return true;
  };

  const processPayheroDeposit = async (amountUsd: number, phone: string) => {
    if (!user) return false;
    
    if (amountUsd < MIN_DEPOSIT_USD) {
      throw new Error(`Minimum deposit is $${MIN_DEPOSIT_USD}`);
    }

    try {
      const response = await axios.post('/api/payhero/initiate', {
        amount: amountUsd,
        phone: (phone || '').replace('+', ''),
        userId: user.id,
        username: user.username
      });

      if (response.data.success || response.data.status === 'Success' || response.data.status === 'Successful' || response.data.CheckoutRequestID) {
        return response.data.external_reference || true;
      }
      
      const errorMsg = response.data.message || response.data.error || 'Failed to initiate payment';
      throw new Error(errorMsg);
    } catch (error: any) {
      const details = error.response?.data?.details;
      const message = error.response?.data?.error || error.message;
      console.error('Payhero Initiation Error:', details || message);
      
      let finalMsg = details ? (typeof details === 'object' ? JSON.stringify(details) : details) : message;
      
      if (finalMsg && finalMsg.includes('Too many unsuccessful requests')) {
        finalMsg = 'Too many unsuccessful requests try after 24hrs';
      }
      
      throw new Error(finalMsg);
    }
  };

  const refreshData = async () => {
    await syncWithSupabase();
  };

  const checkPaymentStatus = async (externalId: string) => {
    try {
      const response = await axios.get(`/api/payhero/status/${externalId}`);
      return response.data;
    } catch (error) {
      console.error('Error checking payment status:', error);
      return null;
    }
  };

  const failLatestDeposit = async () => {
    if (!user) return;
    
    // Find the most recent pending deposit
    const latestPending = [...(user.transactions || [])]
      .sort((a, b) => b.timestamp - a.timestamp)
      .find(t => t.type === 'DEPOSIT' && t.status === 'pending');
      
    if (!latestPending) return;

    if (isSupabaseConfigured()) {
      await supabase.from('transactions')
        .update({ status: 'rejected' })
        .eq('id', latestPending.id);
    }

    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        transactions: prev.transactions.map(t => 
          t.id === latestPending.id ? { ...t, status: 'failed' } : t
        )
      };
    });
  };

  const submitVerification = async (docs: User['verificationDocuments']) => {
    if (!user) return;
    
    const now = Date.now();
    if (isSupabaseConfigured()) {
      await supabase.from('users').update({
        verification_status: 'pending',
        verification_documents: docs,
        verification_submitted_at: now
      }).eq('id', user.id);
    }

    setUser(prev => prev ? {
      ...prev,
      verificationStatus: 'pending',
      verificationSubmittedAt: now,
      verificationDocuments: docs
    } : null);
  };

  const importBot = async (config: { name: string, strategy: string, risk: string, currency: string }) => {
    if (!user) return;
    
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
    const customConfig = { ...config, expiresAt };
    
    if (isSupabaseConfigured()) {
      await supabase.from('bot_settings').upsert({
        user_id: user.id,
        custom_config: customConfig,
        custom_active: false // Require manual start
      });
    }
    
    setUser(prev => prev ? {
      ...prev,
      customBotConfig: customConfig,
      bots: { ...prev.bots, custom: false } // Require manual start
    } : null);
  };

  // Bot Expiration Logic
  useEffect(() => {
    if (!user || !user.customBotConfig) return;
    
    const checkExpiration = async () => {
      if (Date.now() >= user.customBotConfig!.expiresAt) {
        console.log('[Bot] Custom bot expired. Removing...');
        
        if (isSupabaseConfigured()) {
          await supabase.from('bot_settings').update({
            custom_config: null,
            custom_active: false
          }).eq('user_id', user.id);
        }
        
        setUser(prev => prev ? {
          ...prev,
          customBotConfig: undefined,
          bots: { ...prev.bots, custom: false }
        } : null);
      }
    };
    
    const interval = setInterval(checkExpiration, 60000); // Check every minute
    checkExpiration();
    return () => clearInterval(interval);
  }, [user?.customBotConfig]);

  // Bot Simulation Effect
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('preocrypto_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    localStorage.setItem('preocrypto_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const [indicators, setIndicators] = useState(() => {
    const saved = localStorage.getItem('preocrypto_indicators');
    try {
      return saved ? JSON.parse(saved) : { rsi: true, ma: false, ema: false, fibonacci: false };
    } catch {
      return { rsi: true, ma: false, ema: false, fibonacci: false };
    }
  });

  useEffect(() => {
    localStorage.setItem('preocrypto_indicators', JSON.stringify(indicators));
  }, [indicators]);

  const [chartType, setChartType] = useState<ChartType>(() => {
    const saved = localStorage.getItem('preocrypto_chart_type');
    return (saved as ChartType) || 'AREA';
  });

  const [timeframe, setTimeframe] = useState<Timeframe>(() => {
    const saved = localStorage.getItem('preocrypto_timeframe');
    return (saved as Timeframe) || '1M';
  });

  useEffect(() => {
    localStorage.setItem('preocrypto_chart_type', chartType);
  }, [chartType]);

  useEffect(() => {
    localStorage.setItem('preocrypto_timeframe', timeframe);
  }, [timeframe]);

  // Sync settings to Cloud (Supabase)
  useEffect(() => {
    if (!user || !isSupabaseConfigured()) return;

    const syncSettings = async () => {
      try {
        await supabase.from('users').update({
          preferred_indicators: indicators,
          preferred_chart_type: chartType,
          preferred_timeframe: timeframe
        }).eq('id', user.id);
      } catch (err) {
        console.error('Failed to sync chart settings to cloud:', err);
      }
    };

    // Debounce cloud sync to avoid rapid API calls
    const timeout = setTimeout(syncSettings, 2000);
    return () => clearTimeout(timeout);
  }, [user?.id, indicators, chartType, timeframe]);

  return {
    user,
    setUser,
    isDarkMode,
    setIsDarkMode,
    indicators,
    setIndicators,
    chartType,
    setChartType,
    timeframe,
    setTimeframe,
    login,
    register,
    logout,
    switchAccount,
    addTrade,
    closeTrade,
    addTransaction,
    toggleBot,
    addBotProfit,
    processPayheroDeposit,
    checkPaymentStatus,
    failLatestDeposit,
    submitVerification,
    refreshData,
    importBot,
    getAllUsers,
    getGlobalStats,
    updateUserBalance,
    updateUserRole,
    updateUserVerificationStatus,
    getAllTransactions,
    updateTransactionStatus,
    adminCreditUser: async (userId: string, amount: number, transactionId?: string) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return false;

        const response = await axios.post('/api/admin/credit-user', {
          userId,
          amount,
          transactionId
        }, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (response.data.success) {
          await syncWithSupabase();
          return true;
        }
        return false;
      } catch (error) {
        console.error('Admin credit error:', error);
        return false;
      }
    }
  };
}
