import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  User, 
  Trade, 
  Transaction, 
  INITIAL_DEMO_BALANCE, 
  INITIAL_REAL_BALANCE, 
  AccountType, 
  CRYPTO_LIST, 
  MIN_DEPOSIT_USD,
  MIN_STAKE_USD,
  MIN_BALANCE_AFTER_LOSS
} from '../types.ts';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

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

  // Automatic Verification Logic
  useEffect(() => {
    if (!user || user.verificationStatus !== 'pending' || !user.verificationSubmittedAt) return;

    const checkVerification = () => {
      const now = Date.now();
      const ageInMs = now - user.verificationSubmittedAt!;
      const fiveMinutesInMs = 5 * 60 * 1000;
      const tenMinutesInMs = 10 * 60 * 1000;

      // Randomly verify between 5 and 10 minutes
      // We use a deterministic threshold based on user ID so it doesn't jump around
      const seed = parseInt(user.id.slice(0, 8), 36) || 0;
      const randomThreshold = fiveMinutesInMs + ((seed % 1000) / 1000 * (tenMinutesInMs - fiveMinutesInMs));

      if (ageInMs >= randomThreshold) {
        const updatedUser = { ...user, verificationStatus: 'verified' as const };
        setUser(updatedUser);
        if (isSupabaseConfigured()) {
          supabase.from('users').update({ verification_status: 'verified' }).eq('id', user.id);
        }
      }
    };

    const interval = setInterval(checkVerification, 30000); // Check every 30 seconds
    checkVerification(); // Check immediately
    return () => clearInterval(interval);
  }, [user]);

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

  // Sync with Supabase if configured
  useEffect(() => {
    const syncWithSupabase = async () => {
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

          const formattedUser: User = {
            id: userData.id,
            username: userData.username,
            email: userData.email,
            phone: userData.phone,
            role: userData.role,
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
              type: t.type,
              amount: Number(t.amount),
              status: t.status,
              timestamp: t.timestamp ? new Date(t.timestamp).getTime() : new Date(t.created_at).getTime(),
              accountType: t.account_type,
              method: t.method,
              externalId: t.external_id
            })),
            bots: {
              scalping: userData.bot_settings?.scalping_active || false,
              trend: userData.bot_settings?.trend_active || false,
              ai: userData.bot_settings?.ai_active || false,
            },
            createdAt: new Date(userData.created_at).getTime()
          };
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
              role: session.user.user_metadata.role || 'user',
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
    };

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
  }, []);

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
    if (currentBalance - trade.amount < MIN_BALANCE_AFTER_LOSS) {
      throw new Error(`Account balance must remain at least $${MIN_BALANCE_AFTER_LOSS} after placing a trade`);
    }
    
    // Apply fair win rate logic for all users
    const isDemo = trade.accountType === 'DEMO';
    const winChance = 0.65; // 65% win rate for everyone
    const isWin = Math.random() < winChance;
    
    let targetProfit = 0;
    if (isWin) {
      // 70% to 90% profit on win
      const profitMultiplier = 0.7 + Math.random() * 0.2;
      targetProfit = Number((trade.amount * profitMultiplier).toFixed(2));
    } else {
      // Loss is always the full stake
      targetProfit = -trade.amount;
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
    const newBalance = Number((user[balanceKey] - trade.amount).toFixed(2));
    
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
        .order('created_at', { ascending: false })
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
    
    let tradeToNotify: Trade | null = null;

    setUser(prev => {
      if (!prev) return null;
      const trade = prev.trades.find(t => t.id === tradeId);
      if (!trade || trade.status === 'CLOSED') return prev;

      tradeToNotify = trade;
      const isReal = trade.accountType === 'REAL';
      const balanceKey = isReal ? 'realBalance' : 'demoBalance';
      const newBalance = Math.max(MIN_BALANCE_AFTER_LOSS, Number((prev[balanceKey] + trade.amount + currentProfit).toFixed(2)));

      const updatedUser = {
        ...prev,
        trades: prev.trades.map(t => t.id === tradeId ? { ...t, status: 'CLOSED', profit: currentProfit } : t),
        [balanceKey]: newBalance,
        profit: prev.activeAccount === trade.accountType 
          ? Number((prev.profit + currentProfit).toFixed(2)) 
          : prev.profit,
        dailyProfit: prev.activeAccount === trade.accountType
          ? Number((prev.dailyProfit + currentProfit).toFixed(2))
          : prev.dailyProfit
      };

      // Sync with Supabase (fire and forget)
      if (isSupabaseConfigured()) {
        (async () => {
          try {
            await supabase.from('trades').update({
              status: 'CLOSED',
              profit: currentProfit
            }).eq('id', tradeId);

            const { data: u } = await supabase.from('users').select('total_profit_real, total_profit_demo, daily_profit_real, daily_profit_demo').eq('id', prev.id).single();
            if (u) {
              const newTotal = Number((Number(isReal ? u.total_profit_real : u.total_profit_demo) + currentProfit).toFixed(2));
              const newDaily = Number((Number(isReal ? u.daily_profit_real : u.daily_profit_demo) + currentProfit).toFixed(2));
              await supabase.from('users').update({
                [isReal ? 'total_profit_real' : 'total_profit_demo']: newTotal,
                [isReal ? 'daily_profit_real' : 'daily_profit_demo']: newDaily
              }).eq('id', prev.id);
            }

            await supabase.from('users').update({
              [isReal ? 'real_balance' : 'demo_balance']: newBalance
            }).eq('id', prev.id);
          } catch (err) {
            console.error('Supabase sync error in closeTrade:', err);
          }
        })();
      }

      return updatedUser;
    });

    setUsers(prev => prev.map(u => {
      if (u.id !== user?.id) return u;
      const trade = u.trades.find(t => t.id === tradeId);
      if (!trade || trade.status === 'CLOSED') return u;
      
      const isReal = trade.accountType === 'REAL';
      const balanceKey = isReal ? 'realBalance' : 'demoBalance';
      const newBalance = Math.max(MIN_BALANCE_AFTER_LOSS, Number((u[balanceKey] + trade.amount + currentProfit).toFixed(2)));
      
      return {
        ...u,
        trades: u.trades.map(t => t.id === tradeId ? { ...t, status: 'CLOSED', profit: currentProfit } : t),
        [balanceKey]: newBalance,
        profit: u.activeAccount === trade.accountType 
          ? Number((u.profit + currentProfit).toFixed(2)) 
          : u.profit,
        dailyProfit: u.activeAccount === trade.accountType
          ? Number((u.dailyProfit + currentProfit).toFixed(2))
          : u.dailyProfit
      };
    }));

    // Trigger notification for closed trade
    if (tradeToNotify) {
      const trade = tradeToNotify as Trade;
      const isWin = currentProfit > 0;
      const event = new CustomEvent('trade-closed', {
        detail: {
          title: isWin ? 'Trade Won' : 'Trade Closed',
          message: `${trade.coin} trade closed. Result: ${currentProfit >= 0 ? '+' : ''}${currentProfit.toFixed(2)} USDT`,
          type: isWin ? 'success' : 'info'
        }
      });
      window.dispatchEvent(event);
    }
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
  useEffect(() => {
    if (!user || user.role !== 'marketer') return;

    const pendingMarketerWithdrawals = user.transactions.filter(t => 
      t.type === 'WITHDRAW' && t.status === 'pending'
    );

    pendingMarketerWithdrawals.forEach(trans => {
      const age = Date.now() - trans.timestamp;
      const delay = Math.max(0, 10000 - age);
      
      console.log(`[Withdrawal] Found pending marketer withdrawal ${trans.id}. Completing in ${delay}ms`);
      
      setTimeout(async () => {
        if (isSupabaseConfigured()) {
          await supabase.from('transactions')
            .update({ status: 'completed' })
            .eq('id', trans.id);
        }

        setUser(prev => {
          if (!prev) return null;
          return {
            ...prev,
            transactions: prev.transactions.map(t => 
              t.id === trans.id ? { ...t, status: 'completed' } : t
            )
          };
        });
      }, delay);
    });
  }, [user?.id, user?.role]); // Only run when user changes or on load

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

    // Marketer Auto-Process for Withdrawals
    if (user.role === 'marketer' && transaction.type === 'WITHDRAW') {
      const delay = 10000; // 10 seconds
      console.log(`[Withdrawal] Marketer detected. Auto-completing in ${delay}ms`);
      
      setTimeout(async () => {
        if (isSupabaseConfigured()) {
          await supabase.from('transactions')
            .update({ status: 'completed' })
            .eq('id', newTransaction.id);
        }

        setUser(prev => {
          if (!prev) return null;
          return {
            ...prev,
            transactions: prev.transactions.map(t => 
              t.id === newTransaction.id ? { ...t, status: 'completed' } : t
            )
          };
        });
        console.log(`[Withdrawal] Marketer withdrawal ${newTransaction.id} completed.`);
      }, delay);
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
        ai_active: updatedBots.ai
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
    
    const isDemo = user.activeAccount === 'DEMO';
    const winChance = 0.65; // Consistent win rate
    const isWin = Math.random() < winChance;
    
    let finalAmount = isWin ? Math.abs(amount) : -Math.abs(amount);
    
    const isReal = user.activeAccount === 'REAL';
    const balanceKey = isReal ? 'realBalance' : 'demoBalance';
    const newBalance = Math.max(MIN_BALANCE_AFTER_LOSS, Number((user[balanceKey] + finalAmount).toFixed(2)));
    
    // Get a realistic price for the bot trade
    const randomCoin = CRYPTO_LIST[Math.floor(Math.random() * CRYPTO_LIST.length)];
    const entryPrice = randomCoin.basePrice * (0.95 + Math.random() * 0.1);

    if (isSupabaseConfigured()) {
      await supabase.from('users').update({
        [isReal ? 'real_balance' : 'demo_balance']: newBalance
      }).eq('id', user.id);

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
          ai: { profit: 0, trades: 0 }
        }),
        ...(botId ? {
          [botId]: {
            profit: Number(((user.botStats?.[botId]?.profit || 0) + finalAmount).toFixed(2)),
            trades: (user.botStats?.[botId]?.trades || 0) + 1
          }
        } : {})
      },
      botLogs: log ? [log, ...(user.botLogs || [])].slice(0, 50) : (user.botLogs || []),
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
        dbUsers = data.map(u => {
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
            role: u.role,
            real_balance: u.real_balance || 0,
            demo_balance: u.demo_balance || 0,
            verificationStatus: u.verification_status,
            active_account: u.active_account,
            created_at: u.created_at,
            total_deposits: deposits,
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
    if (!isSupabaseConfigured() || user?.role !== 'admin') return { totalDeposited: 0, userCount: 0 };
    
    const { data: usersData, error: usersError } = await supabase.from('users').select('id');
    const { data: transData, error: transError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('type', 'DEPOSIT')
      .eq('status', 'completed');

    if (usersError || transError) return { totalDeposited: 0, userCount: 0 };

    const totalDeposited = transData.reduce((sum, t) => sum + Number(t.amount), 0);
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
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await axios.post('/api/admin/update-user', {
        userId,
        updates: { role }
      }, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (response.status !== 200) throw new Error(response.data.error);
    } catch (error: any) {
      console.error('Error updating role via API:', error.response?.data?.error || error.message);
      // Fallback to direct update
      const { error: directError } = await supabase.from('users').update({ role }).eq('id', userId);
      if (directError) {
        console.error('Direct update also failed:', directError);
        return false;
      }
    }

    // Local update for immediate reflection
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));

    // If updating the current logged-in user
    if (user?.id === userId) {
      setUser(prev => prev ? { ...prev, role } : null);
    }

    return true;
  };

  const updateUserVerificationStatus = async (userId: string, status: 'verified' | 'rejected' | 'not_verified') => {
    if (!isSupabaseConfigured() || user?.role !== 'admin') return false;
    
    const { error } = await supabase.from('users').update({ verification_status: status }).eq('id', userId);
    if (error) {
      console.error('Error updating verification status:', error);
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
        return true;
      }
      
      const errorMsg = response.data.message || response.data.error || 'Failed to initiate payment';
      throw new Error(errorMsg);
    } catch (error: any) {
      const details = error.response?.data?.details;
      const message = error.response?.data?.error || error.message;
      console.error('Payhero Initiation Error:', details || message);
      throw new Error(details ? (typeof details === 'object' ? JSON.stringify(details) : details) : message);
    }
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

  // Bot Simulation Effect
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('preocrypto_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    localStorage.setItem('preocrypto_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  return {
    user,
    setUser,
    isDarkMode,
    setIsDarkMode,
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
    submitVerification,
    getAllUsers,
    getGlobalStats,
    updateUserBalance,
    updateUserRole,
    updateUserVerificationStatus,
    getAllTransactions,
    updateTransactionStatus
  };
}
