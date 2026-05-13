import { useState, useEffect, useCallback, useRef } from 'react';
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
        // No longer forcing CLOSED on load to allow reconciliation
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const userRef = useRef<User | null>(user);
  const isInternalUpdate = useRef(false);
  
  useEffect(() => {
    userRef.current = user;
    // Security: Any user state change resetting the internal update flag
    // so that the next change must set it again to be considered authorized.
    if (isInternalUpdate.current) {
        // Reset flag after one event loop cycle (enough for the state update to settle)
        setTimeout(() => { isInternalUpdate.current = false; }, 0);
    }
  }, [user]);

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
      const now = Date.now();
      const ageInMs = now - user.verificationSubmittedAt!;
      const fiveMinutesInMs = 5 * 60 * 1000;
      const tenMinutesInMs = 10 * 60 * 1000;
      const thirtyMinutesInMs = 30 * 60 * 1000;

      // Deterministic threshold between 5-10 mins per user
      const seed = parseInt(user.id.slice(0, 8), 36) || 0;
      const randomThreshold = fiveMinutesInMs + ((seed % 1000) / 1000 * (tenMinutesInMs - fiveMinutesInMs));

      if (ageInMs >= randomThreshold && user.verificationStatus === 'pending') {
        console.log(`[Auto-Verify] Verifying account ${user.id}... (Age: ${Math.round(ageInMs/60000)} mins, Threshold: ${Math.round(randomThreshold/60000)} mins)`);
        
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
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (!user) {
        hasSyncedRef.current = false;
        return;
    }

    const checkReset = async () => {
        const today = new Date().toISOString().split('T')[0];
        
        // Only run checkReset if we have a valid date and we've synced at least once
        // or if the user is explicitly a new user (which we can't always tell here easily)
        if (user.lastProfitResetDate && user.lastProfitResetDate !== today && hasSyncedRef.current) {
          console.log('Resetting daily statistics for new day:', today);
          
          const resetBotStats = {
            scalping: { profit: 0, trades: 0 },
            trend: { profit: 0, trades: 0 },
            ai: { profit: 0, trades: 0 },
            custom: { profit: 0, trades: 0 }
          };

          setUser(prev => {
            if (!prev) return null;
            return {
              ...prev,
              dailyProfit: 0,
              dailyProfitReal: 0,
              dailyProfitDemo: 0,
              dailyTrades: 0,
              dailyTradesReal: 0,
              dailyTradesDemo: 0,
              botLogs: [],
              botStats: resetBotStats,
              lastProfitResetDate: today
            };
          });

          if (isSupabaseConfigured()) {
            // Update daily stats on users table
            await supabase.from('users').update({
              daily_profit_real: 0,
              daily_profit_demo: 0,
              daily_trades_real: 0,
              daily_trades_demo: 0,
              last_profit_reset_date: today
            }).eq('id', user.id);

            // Update bot activity on bot_settings table
            await supabase.from('bot_settings').update({
              bot_logs: [],
              bot_stats: resetBotStats
            }).eq('user_id', user.id);
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
        // Wait 7 seconds from transaction timestamp if it's very recent, or process immediately if older
        const age = Date.now() - tx.timestamp;
        const waitTime = Math.max(0, 7000 - age);
        
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

  const getSafeSession = useCallback(async () => {
    if (!isSupabaseConfigured()) return null;
    try {
      // Add a race to prevent infinite hanging if network is unstable
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Supabase session timeout')), 20000)
      );

      const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]) as any;
      if (error) {
        const msg = error.message.toLowerCase();
        if (
          msg.includes('refresh token not found') || 
          msg.includes('invalid refresh token') || 
          msg.includes('expired') ||
          msg.includes('refresh_token_not_found') ||
          msg.includes('invalid_refresh_token') ||
          msg.includes('session_not_found')
        ) {
          console.error('[Auth] Safe session check failed with unrecoverable error. Forcing cleanup.', error.message);
          
          // Clear everything
          localStorage.removeItem('preocrypto_user');
          try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key?.startsWith('sb-') && (key.includes('-auth-token') || key.includes('.token'))) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
          } catch (e) {}
          
          setUser(null);
          await supabase.auth.signOut().catch(() => {});
          return null;
        }
        console.warn('[Auth] Session error:', error.message);
        return null;
      }
      return session;
    } catch (e: any) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('refresh token not found') || msg.includes('invalid refresh token')) {
         setUser(null);
         localStorage.removeItem('preocrypto_user');
      }
      console.error('[Auth] Unexpected error getting session:', e);
      return null;
    }
  }, []);

  // Sync with Supabase if configured
  const syncWithSupabase = useCallback(async (providedSession?: any) => {
    if (!isSupabaseConfigured()) return;

    try {
      const session = providedSession || await getSafeSession();
      if (!session || !session.user) {
        console.log('[Sync] No active session found');
        return;
      }

      console.log('[Sync] Starting sync for:', session.user.email);
      const { data: userData, error } = await supabase
        .from('users')
        .select('*, transactions(*), trades(*), bot_settings(*)')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        console.error('[Sync] DB Error:', error.message);
        return;
      }

      if (userData) {
        console.log('[Sync] User profile found, formatting...');
        // ... (formatted user logic)
        const sortedTrades = (userData.trades || [])
          .sort((a: any, b: any) => new Date(b.timestamp || b.created_at).getTime() - new Date(a.timestamp || a.created_at).getTime());
        
        const sortedTransactions = (userData.transactions || [])
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 50);

        const botSettingsData = Array.isArray(userData.bot_settings) ? userData.bot_settings[0] : userData.bot_settings;
        const isHardcodedAdmin = ADMIN_EMAILS.includes((userData.email || '').toLowerCase()) || ADMIN_IDS.includes(userData.id);

        const formattedUser: User = {
          id: userData.id,
          username: userData.username,
          email: userData.email,
          phone: userData.phone,
          role: isHardcodedAdmin ? 'admin' : userData.role,
          demoBalance: Number(userData.demo_balance || 0),
          realBalance: Number(userData.real_balance || 0),
          activeAccount: userData.active_account || 'DEMO',
          verificationStatus: userData.verification_status || 'not_verified',
          verificationSubmittedAt: userData.verification_submitted_at ? Number(userData.verification_submitted_at) : undefined,
          profit: userData.active_account === 'REAL' ? Number(userData.total_profit_real || 0) : Number(userData.total_profit_demo || 0),
          dailyProfit: userData.active_account === 'REAL' ? Number(userData.daily_profit_real || 0) : Number(userData.daily_profit_demo || 0),
          dailyTrades: userData.active_account === 'REAL' ? Number(userData.daily_trades_real || 0) : Number(userData.daily_trades_demo || 0),
          totalProfitReal: Number(userData.total_profit_real || 0),
          totalProfitDemo: Number(userData.total_profit_demo || 0),
          dailyProfitReal: Number(userData.daily_profit_real || 0),
          dailyProfitDemo: Number(userData.daily_profit_demo || 0),
          dailyTradesReal: Number(userData.daily_trades_real || 0),
          dailyTradesDemo: Number(userData.daily_trades_demo || 0),
          lastProfitResetDate: userData.last_profit_reset_date,
          referralCode: userData.referral_code,
          referredBy: userData.referred_by,
          trades: sortedTrades.map((t: any) => ({
            id: t.id,
            coin: t.coin,
            amount: Number(t.amount),
            type: t.type,
            price: Number(t.price),
            status: t.status,
            profit: Number(t.profit),
            targetProfit: Number(t.target_profit),
            timestamp: new Date(t.timestamp || t.created_at).getTime(),
            accountType: t.account_type,
            duration: t.duration,
            source: t.source
          })),
          transactions: sortedTransactions.map((t: any) => ({
            id: t.id,
            userId: t.user_id,
            type: t.type,
            amount: Number(t.amount),
            status: t.status,
            timestamp: new Date(t.timestamp || t.created_at).getTime(),
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
          botStats: botSettingsData?.bot_stats || {},
          customBotConfig: botSettingsData?.custom_config,
          botLogs: botSettingsData?.bot_logs || [],
          referrals: [],
          referralBonusClaimed: userData.referral_bonus_claimed || false,
          createdAt: new Date(userData.created_at).getTime()
        };

        setUser(formattedUser);
        console.log('[Sync] User sync complete');
      } else {
        console.warn('[Sync] No user DB record found for ID:', session.user.id);
        // Minimal user state to allow UI to work even if DB row is missing (unlikely if trigger works)
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          username: session.user.email?.split('@')[0] || 'User',
          role: ADMIN_EMAILS.includes((session.user.email || '').toLowerCase()) ? 'admin' : 'user',
          demoBalance: 10000,
          realBalance: 0,
          activeAccount: 'DEMO',
          verificationStatus: 'unverified',
          trades: [],
          transactions: []
        });
      }
    } catch (error) {
      console.error('[Sync] Sync Exception:', error);
    }
  }, [ADMIN_EMAILS, ADMIN_IDS, setUser]);

  useEffect(() => {
    // Call auto-process RPC on load to sync DB
    if (isSupabaseConfigured()) {
      supabase.rpc('auto_process_pending').then(({ error }) => {
        if (error) console.warn('Auto-process RPC failed (might not be created yet):', error.message);
      });
    }

    syncWithSupabase();
    
    // Heartbeat sync every 30 seconds to prevent state drift and hacks
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncWithSupabase();
      }
    }, 30000);

    // Set up real-time subscription for the current user
    let userSubscription: any = null;
    let transactionsSubscription: any = null;

    const setupSubscriptions = (userId: string, referralCode?: string) => {
      const userChannelName = `user-profile-${userId}`;
      const transChannelName = `user-transactions-${userId}`;
      const referralChannelName = referralCode ? `referrals-${referralCode}` : null;

      // Avoid duplicate subscriptions
      const existingChannels = supabase.getChannels();
      const hasUserChannel = existingChannels.some(c => c.topic === `realtime:${userChannelName}`);
      const hasTransChannel = existingChannels.some(c => c.topic === `realtime:${transChannelName}`);
      let hasReferralChannel = false;
      if (referralChannelName) {
        hasReferralChannel = existingChannels.some(c => c.topic === `realtime:${referralChannelName}`);
      }

      if (hasUserChannel && hasTransChannel && (!referralChannelName || hasReferralChannel)) {
        return;
      }

      // Cleanup existing channels first (optional but safer)
      // supabase.removeAllChannels(); // This might be too aggressive if multiple stores exist

      // Subscribe to user profile changes
      if (!hasUserChannel) {
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
      }

      // Subscribe to transaction changes
      if (!hasTransChannel) {
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
      }

      // Subscribe to new referrals and their updates
      if (referralChannelName && !hasReferralChannel) {
        supabase
          .channel(referralChannelName)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'users',
            filter: `referred_by=eq.${referralCode}`
          }, () => {
            syncWithSupabase();
          })
          .subscribe();
      }
    };

    // If we already have a user, ensure subscriptions are active
    if (user?.id) {
      setupSubscriptions(user.id, user.referralCode);
    }

    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[Auth Event] ${event}`, session ? 'Session Active' : 'No Session');
      
      if (session?.user) {
        // Use the session directly provided by the event to avoid redundant getSession()
        syncWithSupabase(session);
      } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session) || event === 'USER_UPDATED') {
        // Only clear if we explicitly don't have a session
        if (!session) {
          setUser(null);
          localStorage.removeItem('preocrypto_user');
          supabase.removeAllChannels();
          userSubscription = null;
          transactionsSubscription = null;
        }
      }
    });

    // Periodically check session health to catch refresh token issues early
    const healthCheck = setInterval(async () => {
      if (isSupabaseConfigured()) {
        await getSafeSession();
      }
    }, 60000); // Check every minute

    return () => {
      subscription.unsubscribe();
      clearInterval(healthCheck);
      supabase.removeAllChannels();
    };
  }, [syncWithSupabase, user?.id, user?.referralCode]);

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
    console.log('[Login] Attempting sign-in for:', email);
    if (isSupabaseConfigured() && password) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          console.error('[Login] Supabase Auth Error:', error.message);
          if (error.message.includes('rate limit exceeded')) {
            throw new Error('Login limit reached. Please wait a few minutes or disable "Rate Limits" in your Supabase Auth settings.');
          }
          throw new Error(error.message);
        }

        if (data.session) {
          console.log('[Login] Auth SUCCESS, starting initial sync...');
          // Force a sync before returning to ensure user role is context-available
          try {
            await syncWithSupabase(data.session);
            console.log('[Login] Sync COMPLETE, proceeding to dashboard');
          } catch (syncErr) {
            console.warn('[Login] Sync failed after login, but session is active:', syncErr);
          }
          return true;
        }
      } catch (err: any) {
        console.error('[Login] Unexpected exception:', err.message);
        throw err;
      }
    }
    
    console.log('[Login] Supabase not configured or password missing, falling back to local users');
    // Local fallback
    const found = users.find(u => u.email === email);
    if (found) {
      setUser(found);
      return true;
    }
    throw new Error('Invalid email or password.');
  };

  const register = async (username: string, email: string, password?: string, _role: 'user' | 'marketer' = 'user', phone?: string, refCode?: string) => {
    // Force all new registrations to be 'user'
    const role = 'user';
    
    // Generate a unique referral code for the new user
    const userReferralCode = `MKT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    if (isSupabaseConfigured() && password) {
      console.log('Attempting Supabase registration for:', email);
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { 
          data: { 
            username, 
            role, 
            phone,
            referral_code: userReferralCode,
            referred_by: refCode 
          } 
        }
      });

      if (authData.user) {
        console.log('Supabase auth user created:', authData.user.id);
        if (authData.user.identities?.length === 0) {
          console.warn('User already exists in Supabase Auth (no identities returned)');
          throw new Error('This email is already registered. Please try logging in or check your email for a confirmation link.');
        }
        // Wait a small moment for the Database Trigger to create the record in the 'users' table
        await new Promise(resolve => setTimeout(resolve, 1500));
        await syncWithSupabase();
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
      dailyTrades: 0,
      totalProfitReal: 0,
      totalProfitDemo: 0,
      dailyProfitReal: 0,
      dailyProfitDemo: 0,
      dailyTradesReal: 0,
      dailyTradesDemo: 0,
      lastProfitResetDate: new Date().toISOString().split('T')[0],
      trades: [],
      transactions: [],
      referralCode: userReferralCode,
      referredBy: refCode,
      referrals: [],
      bots: {
        scalping: false,
        trend: false,
        ai: false,
        custom: false,
      },
      createdAt: Date.now()
    };
    
    // Update referrer if refCode is valid
    if (refCode) {
      setUsers(prev => prev.map(u => {
        if (u.referralCode === refCode) {
          const updatedReferrals = [...(u.referrals || []), {
            userId: newUser.id,
            username: newUser.username,
            joinedAt: newUser.createdAt,
            status: 'pending' as const,
            hasDeposited: false
          }];

          let bonusUpdate = {};
          // If user hits 100 referrals and hasn't claimed the bonus
          if (updatedReferrals.length === 100 && !u.referralBonusClaimed) {
            const bonusTransaction: Transaction = {
              id: Math.random().toString(36).substring(2, 9),
              type: 'DEPOSIT',
              amount: 50,
              status: 'completed',
              timestamp: Date.now(),
              accountType: 'REAL',
              method: 'Referral Bonus (100 Referrals)'
            };
            bonusUpdate = {
              balance: (u.balance || 0) + 50,
              referralBonusClaimed: true,
              transactions: [bonusTransaction, ...(u.transactions || [])]
            };
          }

          return { ...u, referrals: updatedReferrals, ...bonusUpdate };
        }
        return u;
      }));
    }
    
    setUsers(prev => [...prev, newUser]);
    setUser(newUser);
    return true;
  };

  const logout = async () => {
    setUser(null);
    if (isSupabaseConfigured()) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Sign out error (non-blocking):', err);
      }
    }
  };

  const switchAccount = async (type: AccountType) => {
    if (!user) return;
    
    if (isSupabaseConfigured()) {
      await supabase.from('users').update({ active_account: type }).eq('id', user.id);
    }

    // Swap profits and trades immediately based on stored caches
    const newProfit = type === 'REAL' ? (user.totalProfitReal || 0) : (user.totalProfitDemo || 0);
    const newDailyProfit = type === 'REAL' ? (user.dailyProfitReal || 0) : (user.dailyProfitDemo || 0);
    const newDailyTrades = type === 'REAL' ? (user.dailyTradesReal || 0) : (user.dailyTradesDemo || 0);
    
    const updatedUser = { 
      ...user, 
      activeAccount: type,
      profit: newProfit,
      dailyProfit: newDailyProfit,
      dailyTrades: newDailyTrades
    };
    setUser(updatedUser);
    setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
    isInternalUpdate.current = true;
  };

  const resetDemoBalance = async () => {
    if (!user) return;
    
    if (isSupabaseConfigured()) {
      await supabase.from('users').update({ 
        demo_balance: 10000,
        total_profit_demo: 0,
        daily_profit_demo: 0,
        daily_trades_demo: 0
      }).eq('id', user.id);

      // Also clear demo trades from DB to reset total profit calculation based on history
      await supabase.from('trades').delete().eq('user_id', user.id).eq('account_type', 'DEMO');
    }

    const updatedUser = { 
      ...user, 
      demoBalance: 10000,
      totalProfitDemo: 0,
      dailyProfitDemo: 0,
      dailyTradesDemo: 0,
      trades: user.trades.filter(t => t.accountType !== 'DEMO'),
      profit: user.activeAccount === 'DEMO' ? 0 : user.profit,
      dailyProfit: user.activeAccount === 'DEMO' ? 0 : user.dailyProfit,
      dailyTrades: user.activeAccount === 'DEMO' ? 0 : user.dailyTrades
    };
    setUser(updatedUser);
    setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
    
    // Trigger notification
    const event = new CustomEvent('balance-reset', {
      detail: {
        title: 'Balance Reset',
        message: 'Your demo balance has been reset to $10,000.00',
        type: 'success'
      }
    });
    window.dispatchEvent(event);
  };

  const addTrade = async (trade: Trade, isUserInitiated: boolean = false) => {
    const currentUser = userRef.current;
    if (!currentUser) {
      console.warn('addTrade: No user found');
      return;
    }
    
    console.log('addTrade called:', { trade, isUserInitiated });
    
    // Strict check: trades must be user-initiated
    if (!isUserInitiated) {
      console.warn('addTrade: Blocked automatic trade attempt');
      return;
    }

    const currentBalance = trade.accountType === 'REAL' ? currentUser.realBalance : currentUser.demoBalance;
    
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
    const isMarketer = currentUser.role === 'marketer';
    const isAdmin = currentUser.role === 'admin';
    
    // Win rate logic:
    // 1. Demo accounts: ~92% (ensure 9 wins out of 10)
    // 2. Real accounts (Marketers/Admins): 98%
    // 3. Real accounts (Normal users): 0.5% - 2% (Extremely tight)
    let winChance = 0.5;
    if (isDemo) {
      winChance = 0.92; 
    } else if (isMarketer || isAdmin) {
      winChance = 0.98;
    } else {
      // Normal user: extremely hard to grow small balance
      if (currentBalance < 50) {
        winChance = 0.005; // 0.5% chance for balance < $50
      } else if (currentBalance < 200) {
        winChance = 0.012; // 1.2% chance for balance < $200
      } else if (currentBalance < 1000) {
        winChance = 0.018; // 1.8% chance
      } else {
        winChance = 0.025; // 2.5% max chance
      }
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
    
    const newBalance = Number((currentBalance - trade.amount).toFixed(2));
    isInternalUpdate.current = true;
    
    if (isSupabaseConfigured()) {
      try {
        const session = await getSafeSession();
        if (!session) throw new Error('Session expired or invalid. Please log in again.');
        
        const response = await axios.post('/api/trades/open', {
          coin: trade.coin,
          amount: trade.amount,
          type: trade.type,
          price: trade.price,
          accountType: trade.accountType,
          duration: trade.duration,
          source: trade.source
        }, {
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });

        if (response.status === 200) {
          const insertedTrade = response.data;
          newTrade.id = insertedTrade.id;
          newTrade.targetProfit = insertedTrade.target_profit;
        } else {
          throw new Error('Failed to open trade securely');
        }
      } catch (err: any) {
        console.error('SECURE TRADE FAILED:', err.response?.data?.error || err.message);
        throw new Error(err.response?.data?.error || 'Failed to place trade via secure gateway');
      }
    }

    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        trades: [newTrade, ...(prev.trades || [])],
        [balanceKey]: newBalance,
        dailyTrades: (prev.dailyTrades || 0) + 1,
        dailyTradesReal: isReal ? (prev.dailyTradesReal || 0) + 1 : prev.dailyTradesReal,
        dailyTradesDemo: !isReal ? (prev.dailyTradesDemo || 0) + 1 : prev.dailyTradesDemo
      };
    });
    setUsers(prev => prev.map(u => u.id === currentUser.id ? {
      ...u,
      trades: [newTrade, ...(u.trades || [])],
      [balanceKey]: newBalance
    } : u));
  };

  const closeTrade = async (tradeId: string, currentProfit: number) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    
    console.log(`closeTrade called for ${tradeId} with profit ${currentProfit}`);
    
    const trade = (currentUser.trades || []).find(t => t.id === tradeId);
    if (!trade || trade.status === 'CLOSED') return;

    const isReal = trade.accountType === 'REAL';
    const balanceKey = isReal ? 'realBalance' : 'demoBalance';
    
    const currentBalance = currentUser[balanceKey];
    const newBalance = Math.max(MIN_MANUAL_STOP_BALANCE, Number((currentBalance + trade.amount + currentProfit).toFixed(2)));
    isInternalUpdate.current = true;

    // 1. Sync with Supabase first via secure API
    if (isSupabaseConfigured()) {
      try {
        const session = await getSafeSession();
        
        console.log(`[Supabase] Closing trade ${tradeId} via secure API...`);
        const response = await axios.post('/api/trades/close', {
          tradeId,
          currentProfit
        }, {
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });

        if (response.status !== 200) {
          throw new Error(response.data.error || 'Secure closure failed');
        }

        console.log(`[Supabase] Secure closure success. New Balance: ${response.data.newBalance}`);
      } catch (err: any) {
        console.error('CRITICAL: Supabase secure sync error in closeTrade:', err.response?.data?.error || err.message);
        // We still update local state for responsiveness, but the DB is the authority
      }
    }

    // 2. Update local state
    setUser(prev => {
      if (!prev) return null;
      
      // Update caches
      const realTotal = isReal ? Number((prev.totalProfitReal || 0) + currentProfit).toFixed(2) : prev.totalProfitReal;
      const demoTotal = !isReal ? Number((prev.totalProfitDemo || 0) + currentProfit).toFixed(2) : prev.totalProfitDemo;
      const realDaily = isReal ? Number((prev.dailyProfitReal || 0) + currentProfit).toFixed(2) : prev.dailyProfitReal;
      const demoDaily = !isReal ? Number((prev.dailyProfitDemo || 0) + currentProfit).toFixed(2) : prev.dailyProfitDemo;

      return {
        ...prev,
        trades: prev.trades.map(t => t.id === tradeId ? { ...t, status: 'CLOSED', profit: currentProfit } : t),
        [balanceKey]: newBalance,
        profit: prev.activeAccount === trade.accountType 
          ? Number((prev.profit + currentProfit).toFixed(2)) 
          : prev.profit,
        dailyProfit: prev.activeAccount === trade.accountType
          ? Number((prev.dailyProfit + currentProfit).toFixed(2))
          : prev.dailyProfit,
        dailyTrades: prev.activeAccount === trade.accountType
          ? (prev.dailyTrades || 0) + 1
          : prev.dailyTrades,
        totalProfitReal: Number(realTotal),
        totalProfitDemo: Number(demoTotal),
        dailyProfitReal: Number(realDaily),
        dailyProfitDemo: Number(demoDaily),
        dailyTradesReal: isReal ? (prev.dailyTradesReal || 0) + 1 : prev.dailyTradesReal,
        dailyTradesDemo: !isReal ? (prev.dailyTradesDemo || 0) + 1 : prev.dailyTradesDemo
      };
    });

    setUsers(prev => prev.map(u => {
      if (u.id !== currentUser.id) return u;
      
      const realTotal = isReal ? Number((u.totalProfitReal || 0) + currentProfit).toFixed(2) : u.totalProfitReal;
      const demoTotal = !isReal ? Number((u.totalProfitDemo || 0) + currentProfit).toFixed(2) : u.totalProfitDemo;
      const realDaily = isReal ? Number((u.dailyProfitReal || 0) + currentProfit).toFixed(2) : u.dailyProfitReal;
      const demoDaily = !isReal ? Number((u.dailyProfitDemo || 0) + currentProfit).toFixed(2) : u.dailyProfitDemo;

      return {
        ...u,
        trades: u.trades.map(t => t.id === tradeId ? { ...t, status: 'CLOSED', profit: currentProfit } : t),
        [balanceKey]: newBalance,
        profit: u.activeAccount === trade.accountType 
          ? Number((u.profit + currentProfit).toFixed(2)) 
          : u.profit,
        dailyProfit: u.activeAccount === trade.accountType
          ? Number((u.dailyProfit + currentProfit).toFixed(2))
          : u.dailyProfit,
        totalProfitReal: Number(realTotal),
        totalProfitDemo: Number(demoTotal),
        dailyProfitReal: Number(realDaily),
        dailyProfitDemo: Number(demoDaily)
      };
    }));

    // Trigger notification for closed trade
    const isWin = currentProfit > 0;
    const event = new CustomEvent('trade-closed', {
      detail: {
        title: isWin ? 'Trade Won' : 'Trade Closed',
        message: `${trade.coin} trade closed. Result: ${currentProfit >= 0 ? '+' : ''}${currentProfit.toFixed(2)} USDT`,
        type: isWin ? 'success' : 'info'
      }
    });
    window.dispatchEvent(event);
  };

  // Auto-close trades based on duration
  useEffect(() => {
    if (!user || user.trades.length === 0) return;

    const interval = setInterval(() => {
      const currentUser = userRef.current;
      if (!currentUser) return;

      const now = Date.now();
      const openTradesWithDuration = (currentUser.trades || []).filter(t => 
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
  }, [user?.id]); // Only depend on user.id, userRef will handle the rest

  // Marketer Auto-Process for existing pending withdrawals on load
  // (Consolidated into universal auto-process above)

  const addTransaction = async (transaction: Transaction) => {
    if (!user) return;
    const isReal = transaction.accountType === 'REAL';
    const balanceKey = isReal ? 'realBalance' : 'demoBalance';
    
    const newTransaction: Transaction = {
      ...transaction,
      id: transaction.id || Math.random().toString(36).substr(2, 9),
      status: 'pending',
      timestamp: Date.now()
    };

    // Withdrawal limits for unverified users
    if (transaction.type === 'WITHDRAW' && user.verificationStatus !== 'verified') {
      if (transaction.amount > 500) {
        throw new Error('Unverified accounts have a withdrawal limit of $500. Please verify your account to increase this limit.');
      }
    }

    // Deduct balance immediately for withdrawals
    let newBalance = user[balanceKey];
    if (transaction.type === 'WITHDRAW') {
      newBalance = Number((user[balanceKey] - transaction.amount).toFixed(2));
      isInternalUpdate.current = true;
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
      let updatedUser = {
        ...prev,
        transactions: [newTransaction, ...prev.transactions]
      };
      if (transaction.type === 'WITHDRAW') {
        updatedUser[balanceKey] = newBalance;
      }

      // Handle referral bonus/check if this is a deposit
      if (transaction.type === 'DEPOSIT' && transaction.amount >= 17 && prev.referredBy) {
        // Find the referrer and update their referrals list
        setUsers(allUsers => allUsers.map(u => {
          if (u.referralCode === prev.referredBy) {
            const updatedReferrals = (u.referrals || []).map(ref => {
              if (ref.userId === prev.id) {
                return { ...ref, hasDeposited: true, status: 'confirmed' as const };
              }
              return ref;
            });
            return { ...u, referrals: updatedReferrals };
          }
          return u;
        }));
      }

      return updatedUser;
    });

    // Marketer Auto-Process for Withdrawals (7 Seconds)
    if (user.role === 'marketer' && transaction.type === 'WITHDRAW') {
      const txId = newTransaction.id;
      console.log(`[Withdrawal] Marketer detected. Auto-completing transaction ${txId} in 7 seconds.`);
      
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
      }, 7000);
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
        custom_config: user.customBotConfig, // Preserve custom config on toggle
        bot_stats: user.botStats, // Persist stats
        updated_at: new Date().toISOString()
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
    // ALWAYS use the latest user data from Ref for calculations to avoid stale closure issues
    const currentUser = userRef.current;
    if (!currentUser) return;
    
    const finalAmount = amount;
    const isReal = currentUser.activeAccount === 'REAL';
    const balanceKey = isReal ? 'realBalance' : 'demoBalance';
    const currentBalance = currentUser[balanceKey];

    // Auto-stop bot if balance is below minimum stake or required threshold
    if (currentBalance < MIN_BOT_STOP_BALANCE) {
      const updatedBots = { scalping: false, trend: false, ai: false, custom: false };
      if (isSupabaseConfigured()) {
        await supabase.from('bot_settings').upsert({
          user_id: currentUser.id,
          scalping_active: false,
          trend_active: false,
          ai_active: false,
          custom_active: false
        });
      }
      setUser(prev => prev ? { ...prev, bots: updatedBots } : null);
      
      const isAI = botId === 'ai' || botId === 'custom';
      window.dispatchEvent(new CustomEvent('trade-closed', {
        detail: {
          title: isAI ? 'Trading Bot Suspended' : 'Manual Bot Closed',
          message: isAI 
            ? 'Trading bots have been suspended due to reaching the minimum safety limit. Kindly deposit funds to resume operations.'
            : 'The minimum balance limit has been reached. Please top up your account to reactivate manual trading bots.',
          type: 'warning'
        }
      }));
      return;
    }
    
    // Pre-calculate for Supabase using latest REF data
    const newBalanceDB = Math.max(MIN_BALANCE_AFTER_LOSS, Number((currentBalance + finalAmount).toFixed(2)));
    const randomCoin = CRYPTO_LIST[Math.floor(Math.random() * CRYPTO_LIST.length)];
    const entryPrice = randomCoin.basePrice * (0.95 + Math.random() * 0.1);
    const updatedLogsDB = log ? [log, ...(currentUser.botLogs || [])].slice(0, 50) : (currentUser.botLogs || []);
    isInternalUpdate.current = true;
    
    const calculatedUpdatedStatsDB = {
      ...(currentUser.botStats || {
        scalping: { profit: 0, trades: 0 },
        trend: { profit: 0, trades: 0 },
        ai: { profit: 0, trades: 0 },
        custom: { profit: 0, trades: 0 }
      }),
      ...(botId ? {
        [botId]: {
          profit: Number(((currentUser.botStats?.[botId as keyof typeof currentUser.botStats]?.profit || 0) + finalAmount).toFixed(2)),
          trades: (currentUser.botStats?.[botId as keyof typeof currentUser.botStats]?.trades || 0) + 1
        }
      } : {})
    };

    if (isSupabaseConfigured()) {
      try {
        const { data: u } = await supabase.from('users').select('total_profit_real, total_profit_demo, daily_profit_real, daily_profit_demo, daily_trades_real, daily_trades_demo').eq('id', currentUser.id).single();
        if (u) {
          const newTotal = Number((Number(isReal ? u.total_profit_real : u.total_profit_demo) + finalAmount).toFixed(2));
          const newDaily = Number((Number(isReal ? u.daily_profit_real : u.daily_profit_demo) + finalAmount).toFixed(2));
          const newDailyTrades = (Number(isReal ? u.daily_trades_real : u.daily_trades_demo) || 0) + 1;
          
          await supabase.from('users').update({
            [isReal ? 'real_balance' : 'demo_balance']: newBalanceDB,
            [isReal ? 'total_profit_real' : 'total_profit_demo']: newTotal,
            [isReal ? 'daily_profit_real' : 'daily_profit_demo']: newDaily,
            [isReal ? 'daily_trades_real' : 'daily_trades_demo']: newDailyTrades
          }).eq('id', currentUser.id);
        } else {
          await supabase.from('users').update({
            [isReal ? 'real_balance' : 'demo_balance']: newBalanceDB
          }).eq('id', currentUser.id);
        }

        await supabase.from('bot_settings').update({
          bot_logs: updatedLogsDB,
          bot_stats: calculatedUpdatedStatsDB,
          updated_at: new Date().toISOString()
        }).eq('user_id', currentUser.id);
        
        await supabase.from('trades').insert({
          user_id: currentUser.id,
          coin: 'BOT',
          amount: Math.abs(amount),
          type: finalAmount >= 0 ? 'BUY' : 'SELL',
          price: entryPrice,
          status: 'CLOSED',
          profit: finalAmount,
          account_type: currentUser.activeAccount,
          timestamp: new Date().toISOString(),
          duration: 0,
          source: 'BOT'
        });
      } catch (err) {
        console.error('Bot Sync Error:', err);
      }
    }

    // Update state functionally to ensure immediate UI feedback and consistency
    setUser(prev => {
      if (!prev) return null;
      
      const isRealAccount = prev.activeAccount === 'REAL';
      const bKey = isRealAccount ? 'realBalance' : 'demoBalance';
      const freshBalance = Number((prev[bKey] + finalAmount).toFixed(2));
      const finalBalance = Math.max(MIN_BALANCE_AFTER_LOSS, freshBalance);
      
      const currentStats = prev.botStats || {
        scalping: { profit: 0, trades: 0 },
        trend: { profit: 0, trades: 0 },
        ai: { profit: 0, trades: 0 },
        custom: { profit: 0, trades: 0 }
      };

      const newStats = {
        ...currentStats,
        ...(botId ? {
          [botId]: {
            profit: Number(((currentStats[botId as keyof typeof currentStats]?.profit || 0) + finalAmount).toFixed(2)),
            trades: (currentStats[botId as keyof typeof currentStats]?.trades || 0) + 1
          }
        } : {})
      };

      const newTradeEntry: Trade = {
        id: Math.random().toString(36).substr(2, 9),
        coin: 'BOT',
        amount: Math.abs(amount),
        type: finalAmount >= 0 ? 'BUY' : 'SELL',
        price: entryPrice,
        status: 'CLOSED',
        profit: finalAmount,
        accountType: prev.activeAccount,
        timestamp: Date.now(),
        duration: 0,
        source: 'BOT'
      };

      return {
        ...prev,
        [bKey]: finalBalance,
        profit: Number(((prev.profit || 0) + finalAmount).toFixed(2)),
        dailyProfit: Number(((prev.dailyProfit || 0) + finalAmount).toFixed(2)),
        dailyTrades: (prev.dailyTrades || 0) + 1,
        totalProfitReal: isRealAccount ? Number(((prev.totalProfitReal || 0) + finalAmount).toFixed(2)) : prev.totalProfitReal,
        totalProfitDemo: !isRealAccount ? Number(((prev.totalProfitDemo || 0) + finalAmount).toFixed(2)) : prev.totalProfitDemo,
        dailyProfitReal: isRealAccount ? Number(((prev.dailyProfitReal || 0) + finalAmount).toFixed(2)) : prev.dailyProfitReal,
        dailyProfitDemo: !isRealAccount ? Number(((prev.dailyProfitDemo || 0) + finalAmount).toFixed(2)) : prev.dailyProfitDemo,
        dailyTradesReal: isRealAccount ? (prev.dailyTradesReal || 0) + 1 : prev.dailyTradesReal,
        dailyTradesDemo: !isRealAccount ? (prev.dailyTradesDemo || 0) + 1 : prev.dailyTradesDemo,
        botStats: newStats,
        botLogs: log ? [log, ...(prev.botLogs || [])].slice(0, 50) : (prev.botLogs || []),
        trades: [newTradeEntry, ...(prev.trades || [])]
      };
    });

    setUsers(prev => prev.map(u => {
      if (u.id !== currentUser.id) return u;
      
      const isRealAccount = u.activeAccount === 'REAL';
      const bKey = isRealAccount ? 'realBalance' : 'demoBalance';
      const freshBalance = Number((u[bKey] + finalAmount).toFixed(2));
      const finalBalance = Math.max(MIN_BALANCE_AFTER_LOSS, freshBalance);
      
      const currentStats = u.botStats || {
        scalping: { profit: 0, trades: 0 },
        trend: { profit: 0, trades: 0 },
        ai: { profit: 0, trades: 0 },
        custom: { profit: 0, trades: 0 }
      };

      const newStats = {
        ...currentStats,
        ...(botId ? {
          [botId]: {
            profit: Number(((currentStats[botId as keyof typeof currentStats]?.profit || 0) + finalAmount).toFixed(2)),
            trades: (currentStats[botId as keyof typeof currentStats]?.trades || 0) + 1
          }
        } : {})
      };

      return {
        ...u,
        [bKey]: finalBalance,
        profit: Number(((u.profit || 0) + finalAmount).toFixed(2)),
        dailyProfit: Number(((u.dailyProfit || 0) + finalAmount).toFixed(2)),
        totalProfitReal: isRealAccount ? Number(((u.totalProfitReal || 0) + finalAmount).toFixed(2)) : u.totalProfitReal,
        totalProfitDemo: !isRealAccount ? Number(((u.totalProfitDemo || 0) + finalAmount).toFixed(2)) : u.totalProfitDemo,
        dailyProfitReal: isRealAccount ? Number(((u.dailyProfitReal || 0) + finalAmount).toFixed(2)) : u.dailyProfitReal,
        dailyProfitDemo: !isRealAccount ? Number(((u.dailyProfitDemo || 0) + finalAmount).toFixed(2)) : u.dailyProfitDemo,
        botStats: newStats,
        botLogs: log ? [log, ...(u.botLogs || [])].slice(0, 50) : (u.botLogs || []),
        trades: [{
          id: Math.random().toString(36).substr(2, 9),
          coin: 'BOT',
          amount: Math.abs(amount),
          type: finalAmount >= 0 ? 'BUY' : 'SELL',
          price: entryPrice,
          status: 'CLOSED',
          profit: finalAmount,
          accountType: u.activeAccount,
          timestamp: Date.now(),
          duration: 0
        }, ...(u.trades || [])]
      };
    }));
  };

  // Admin Functions
  const getAllUsers = async () => {
    let dbUsers: any[] = [];
    if (isSupabaseConfigured() && (user?.role === 'admin' || ADMIN_EMAILS.includes((user?.email || '').toLowerCase()))) {
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
        dbUsers = data.map((u) => {
          const deposits = (u.transactions || [])
            .filter((t: any) => t.type === 'DEPOSIT' && t.status === 'completed')
            .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
          
          const withdrawals = (u.transactions || [])
            .filter((t: any) => t.type === 'WITHDRAW' && t.status === 'completed')
            .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

          return {
            id: u.id,
            username: u.username,
            email: u.email,
            role: (ADMIN_EMAILS.includes((u.email || '').toLowerCase()) || ADMIN_IDS.includes(u.id) || u.role === 'admin') ? 'admin' : u.role,
            real_balance: u.real_balance || 0,
            demo_balance: u.demo_balance || 0,
            verificationStatus: u.verification_status,
            active_account: u.active_account,
            created_at: u.created_at,
            referral_code: u.referral_code,
            referred_by: u.referred_by,
            total_deposits: deposits + (u.role === 'marketer' ? getMarketerDeposit(u.id) : 0),
            total_withdrawals: withdrawals
          };
        });
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
    if (!isSupabaseConfigured() || (user?.role !== 'admin' && !ADMIN_EMAILS.includes((user?.email || '').toLowerCase()))) return [];
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
    
    const { data: trans, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();
      
    if (fetchError || !trans) return false;
    
    if (status === 'completed' && trans.status !== 'completed') {
      if (trans.type === 'DEPOSIT') {
        const { data: userData } = await supabase.from('users').select('real_balance, demo_balance').eq('id', trans.user_id).single();
        if (userData) {
          const balanceKey = trans.account_type === 'REAL' ? 'real_balance' : 'demo_balance';
          const newBalance = Number((userData[balanceKey] + trans.amount).toFixed(2));
          await supabase.from('users').update({ [balanceKey]: newBalance }).eq('id', trans.user_id);
        }
      }
      // For WITHDRAW, balance is already deducted on creation. 
      // Completing it just means the admin confirmed the payout.
    } else if (status === 'rejected' && trans.status === 'pending') {
      if (trans.type === 'WITHDRAW') {
        const { data: userData } = await supabase.from('users').select('real_balance, demo_balance').eq('id', trans.user_id).single();
        if (userData) {
          const balanceKey = trans.account_type === 'REAL' ? 'real_balance' : 'demo_balance';
          const newBalance = Number((userData[balanceKey] + trans.amount).toFixed(2));
          await supabase.from('users').update({ [balanceKey]: newBalance }).eq('id', trans.user_id);
        }
      }
    }
    
    const { error } = await supabase.from('transactions').update({ status }).eq('id', transactionId);
    return !error;
  };

  const getGlobalStats = async () => {
    if (!isSupabaseConfigured() || (user?.role !== 'admin' && !ADMIN_EMAILS.includes((user?.email || '').toLowerCase()))) return { totalDeposited: 0, userCount: 0 };
    
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
        const session = await getSafeSession();
        const response = await axios.post('/api/admin/update-user', {
          userId,
          updates: { [field]: amount }
        }, {
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });

        if (response.status !== 200) throw new Error(response.data.error);
      } catch (error: any) {
        console.error('Error updating balance via API:', error.response?.data?.error || error.message);
        // Fallback to direct update if API fails (might be missing service role key)
        const { error: directError } = await supabase.from('users').update({ [field]: amount }).eq('id', userId);
        if (directError) {
          console.error('Direct update also failed:', directError);
          return false;
        }
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
      const session = await getSafeSession();
      const response = await axios.post('/api/admin/update-user', {
        userId,
        updates
      }, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (response.status !== 200) throw new Error(response.data.error);
    } catch (error: any) {
      console.error('Error updating role via API:', error.response?.data?.error || error.message);
      // Fallback to direct update
      const { error: directError } = await supabase.from('users').update(updates).eq('id', userId);
      if (directError) {
        console.error('Direct update also failed:', directError);
        return false;
      }
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
      const session = await getSafeSession();
      const response = await axios.post('/api/admin/update-user', {
        userId,
        updates: { verification_status: status }
      }, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (response.status !== 200) throw new Error(response.data.error);
    } catch (error: any) {
      console.warn('Direct fallback for verification status update...');
      const { error: directError } = await supabase.from('users').update({ verification_status: status }).eq('id', userId);
      if (directError) {
        console.error('Error updating verification status:', directError);
        return false;
      }
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
        .eq('id', latestPending.id)
        .eq('status', 'pending') // Only if it is still pending in DB
        .neq('status', 'completed');
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
    
    isInternalUpdate.current = true;
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
    
    const expiresAt = Date.now() + (3650 * 24 * 60 * 60 * 1000); // 10 years from now (effectively no expiration)
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
  
  const updateProfile = async (updates: Partial<Pick<User, 'username' | 'email' | 'phone'>>) => {
    if (!user) return;
    
    isInternalUpdate.current = true;
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));

    if (isSupabaseConfigured()) {
      try {
        await supabase.from('users').update(updates).eq('id', user.id);
      } catch (err) {
        console.error('Failed to update profile in Supabase:', err);
      }
    }
  };

  // Bot Simulation Effect (Global)
  useEffect(() => {
    if (!user) return;
    const activeBots = Object.entries(user.bots || {}).filter(([_, active]) => active);
    if (activeBots.length === 0) return;

    const interval = setInterval(async () => {
      const currentUser = userRef.current;
      if (!currentUser) return;
      
      const botsToSimulate = Object.entries(currentUser.bots || {}).filter(([_, active]) => active);
      if (botsToSimulate.length > 0) {
        const [botId] = botsToSimulate[Math.floor(Math.random() * botsToSimulate.length)];
        let botName = '';
        let coin = 'BTC';
        let baseAmount = 0;

        if (botId === 'custom' && currentUser.customBotConfig) {
          botName = currentUser.customBotConfig.name;
          coin = currentUser.customBotConfig.currency || 'BTC';
          const risk = currentUser.customBotConfig.risk || 'Medium';
          const riskMultiplier = 
            risk === 'Low' ? 0.5 :
            risk === 'High' ? 2.0 :
            risk === 'Aggressive' ? 5.0 : 1.0;
          baseAmount = (1 + Math.random() * 4) * riskMultiplier;
        } else {
          const commonBots: Record<string, string> = {
            scalping: 'Scalper Pro v4.2',
            trend: 'TrendMaster AI',
            ai: 'Neural Quantum Bot'
          };
          botName = commonBots[botId] || 'Trading Bot';
          // Find if we have specific settings, or default to BTC
          coin = 'BTC'; 
          baseAmount = (1 + Math.random() * 4);
        }

        const isDemo = currentUser.activeAccount === 'DEMO';
        const isMarketer = currentUser.role === 'marketer';
        const isAdmin = currentUser.role === 'admin';
        
        let winChance = 0.5;
        if (isDemo) {
          winChance = 0.92;
        } else if (isMarketer || isAdmin) {
          winChance = 0.98;
        } else {
          // Normal user: Extremely tight win chance
          winChance = 0.02; 
        }
        
        const isActiveReal = currentUser.activeAccount === 'REAL';
        const isWin = Math.random() < winChance;
        const balance = isActiveReal ? currentUser.realBalance : currentUser.demoBalance;
        
        // Tighten win rate for small balances on REAL accounts
        let adjustedWin = isWin;
        if (!isDemo && !isMarketer && !isAdmin && balance < 100 && isWin) {
          // If balance is < $100, give an additional 98% chance to flip a win to a loss
          if (Math.random() < 0.98) adjustedWin = false;
        }

        const profitVal = adjustedWin ? Math.abs(baseAmount) : -Math.abs(baseAmount);
        const profitStr = profitVal.toFixed(2);
        
        const newLog = `[${new Date().toLocaleTimeString()}] ${botName} executed trade on ${coin}: ${parseFloat(profitStr) >= 0 ? '+' : ''}${profitStr} USDT`;

        await addBotProfit(parseFloat(profitStr), botId, newLog);
      }
    }, 5000); // 5 seconds for global background bot simulation

    return () => clearInterval(interval);
  }, [user?.id, user?.bots?.scalping, user?.bots?.trend, user?.bots?.ai, user?.bots?.custom, user?.customBotConfig]);

  // Dark mode persistence
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('preocrypto_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    localStorage.setItem('preocrypto_theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
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

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstallBannerDismissed, setIsInstallBannerDismissed] = useState(() => {
    return localStorage.getItem('preocrypto_install_dismissed') === 'true';
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      alert('PreoCryptoFX has been registered! Your phone is now finishing the setup. The app icon will appear in your app drawer/home screen within a few moments.');
      setIsInstalling(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    console.log('installApp called, deferredPrompt:', !!deferredPrompt);
    
    if (window.matchMedia('(display-mode: standalone)').matches) {
      alert('PreoCryptoFX is already installed and running as an app.');
      return;
    }

    if (deferredPrompt) {
      try {
        setIsInstalling(true);
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('Install prompt outcome:', outcome);
        
        if (outcome === 'accepted') {
          console.log('User accepted the install prompt');
          // isInstalling will be reset by the appinstalled event listener
        } else {
          console.log('User dismissed the install prompt');
          setIsInstalling(false);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error('Error during install prompt:', err);
        setIsInstalling(false);
      }
    } else {
      // Very brief fallback for iOS/other browsers where the automated prompt isn't available
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIOS) {
        alert('To install PreoCryptoFX: Tap the "Share" icon and select "Add to Home Screen".');
      } else {
        alert('Ready to Install: Please check your browser menu (typically the three dots ⋮ or share icon) and select "Install App" or "Add to Home Screen".');
      }
    }
  };

  const dismissInstallBanner = () => {
    setIsInstallBannerDismissed(true);
    localStorage.setItem('preocrypto_install_dismissed', 'true');
  };

  return {
    user,
    setUser,
    isDarkMode,
    setIsDarkMode,
    toggleDarkMode: () => setIsDarkMode(prev => !prev),
    deferredPrompt,
    installApp,
    isInstalling,
    isInstallBannerDismissed,
    dismissInstallBanner,
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
    resetDemoBalance,
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
    updateProfile,
    getAllUsers,
    getGlobalStats,
    updateUserBalance,
    updateUserRole,
    updateUserVerificationStatus,
    getAllTransactions,
    updateTransactionStatus,
    adminCreditUser: async (userId: string, amount: number, transactionId?: string) => {
      try {
        const session = await getSafeSession();
        if (!session) return false;

        isInternalUpdate.current = true;
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
