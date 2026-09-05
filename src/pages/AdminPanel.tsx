import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  TrendingUp,
  Lock,
  DollarSign, 
  Shield, 
  Edit2, 
  Check, 
  X, 
  Search, 
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatCurrency, cn } from '../lib/utils';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const ADMIN_EMAILS = ['wren20688@gmail.com', 'josphatndungu1022@gmail.com'];
const ADMIN_IDS = ['304020c9-3695-4f8f-85fe-9ee12eda8152'];

type AdminTab = 'users' | 'deposits' | 'copy-traders';

export default function AdminPanel() {
  const { user, getAllUsers, getGlobalStats, updateUserBalance, updateUserRole, updateUserVerificationStatus, getAllTransactions, updateTransactionStatus, checkPaymentStatus, copyTraders, updateCopyTrader, deleteCopyTrader, globalWizardPassword, globalWizard2Password, updateGlobalWizardPasswords } = useStore();
  const [users, setUsers] = useState<any[]>([]);
  const [referralCounts, setReferralCounts] = useState<Record<string, number>>({});
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalDeposited: 0, userCount: 0 });
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editValue2, setEditValue2] = useState('');
  const [editType, setEditType] = useState<'REAL' | 'DEMO'>('REAL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const isAdmin = ADMIN_EMAILS.includes((user?.email || '').toLowerCase());
    if (!isAdmin) return;

    // Initial load or search clear
    if (search.trim() === '') {
      loadData();
    }

    // Debounced search
    const timer = setTimeout(() => {
      if (search.trim() !== '') {
        loadData(search);
      }
    }, 500);

    // Auto-refresh every 60 seconds if no active search
    const refreshInterval = setInterval(() => {
      if (search.trim() === '' && !loading) {
        console.log('[Admin] Auto-refreshing data...');
        loadData();
      }
    }, 60000);

    return () => {
      clearTimeout(timer);
      clearInterval(refreshInterval);
    };
  }, [user?.id, search]);

  const loadData = async (searchQuery?: string) => {
    setLoading(true);
    try {
      console.log(`[Admin] Fetching platform data (search: ${searchQuery || 'none'})...`);
      const [allUsers, globalStats, allTrans, allReferralMappings] = await Promise.all([
        getAllUsers(searchQuery),
        getGlobalStats(),
        getAllTransactions(searchQuery),
        isSupabaseConfigured() 
          ? supabase.from('users').select('id, referral_code, referred_by')
          : Promise.resolve({ data: [] })
      ]);

      // Calculate true referral counts across the entire database
      const counts: Record<string, number> = {};
      if (allReferralMappings.data) {
        // Build maps for code, ID, and email to ID resolution
        const codeToId: Record<string, string> = {};
        const emailToId: Record<string, string> = {};
        
        allReferralMappings.data.forEach((u: any) => {
          if (u.referral_code) codeToId[u.referral_code.toUpperCase()] = u.id;
          if (u.email) emailToId[u.email.toLowerCase()] = u.id;
          codeToId[u.id] = u.id; // Map ID to itself for easy resolution
        });

        allReferralMappings.data.forEach((u: any) => {
          if (u.referred_by) {
            const ref = u.referred_by.trim();
            // Try to resolve referred_by to a user ID
            const referrerId = codeToId[ref.toUpperCase()] || 
                             emailToId[ref.toLowerCase()] || 
                             codeToId[ref] || 
                             ref;
            
            counts[referrerId] = (counts[referrerId] || 0) + 1;
          }
        });
      }
      setReferralCounts(counts);

      // Optimize: Map transactions to users for faster lookup
      const userTotals: Record<string, { deposits: number, withdrawals: number }> = {};
      (allTrans || []).forEach((t: any) => {
        if (!userTotals[t.user_id]) userTotals[t.user_id] = { deposits: 0, withdrawals: 0 };
        if (t.status === 'completed') {
          if (t.type === 'DEPOSIT') userTotals[t.user_id].deposits += Number(t.amount || 0);
          if (t.type === 'WITHDRAW') userTotals[t.user_id].withdrawals += Number(t.amount || 0);
        }
      });

      const enrichedUsers = (allUsers || []).map((u: any) => ({
        ...u,
        total_deposits: (u.total_deposits || 0) + (userTotals[u.id]?.deposits || 0),
        total_withdrawals: userTotals[u.id]?.withdrawals || 0
      }));

      setUsers(enrichedUsers);
      setStats(globalStats);
      setTransactions(allTrans || []);
      console.log(`[Admin] Loaded ${enrichedUsers.length} users and ${allTrans?.length || 0} transactions`);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBalance = async (userId: string) => {
    const success = await updateUserBalance(userId, Number(editValue), editType);
    if (success) {
      setEditingId(null);
      loadData();
    }
  };

  const handleUpdateGlobalPasswords = async () => {
    const success = await updateGlobalWizardPasswords(editValue, editValue2);
    if (success) {
      setEditingId(null);
    }
  };

  const handleUpdateTransaction = async (id: string, status: 'completed' | 'rejected') => {
    if (status === 'rejected') {
      const confirm = window.confirm("Are you sure you want to reject this transaction?");
      if (!confirm) return;
    }
    const success = await updateTransactionStatus(id, status);
    if (success) {
      loadData();
    }
  };

  const handleUpdateRole = async (userId: string, role: 'user' | 'marketer' | 'admin') => {
    const success = await updateUserRole(userId, role);
    if (success) {
      loadData();
    }
  };

  const handleUpdateVerification = async (userId: string, status: 'verified' | 'rejected') => {
    const success = await updateUserVerificationStatus(userId, status);
    if (success) {
      loadData();
    }
  };

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTransactions = transactions
    .filter(t => {
      const matchesSearch = t.users?.email?.toLowerCase().includes(search.toLowerCase()) || 
                           t.users?.username?.toLowerCase().includes(search.toLowerCase());
      
      return matchesSearch;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (!ADMIN_EMAILS.includes((user?.email || '').toLowerCase())) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Shield size={64} className="mx-auto text-red-500 opacity-50" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Access Denied</h2>
          <p className="text-slate-500">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  if (loading && users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <Shield className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary/50" size={24} />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Loading Admin Dashboard</h3>
          <p className="text-sm text-slate-500">Fetching the latest platform data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">Admin Dashboard</h1>
          <p className="text-[10px] text-slate-500 font-medium">Manage users and platform deposits</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2"
          >
            <ArrowLeft size={16} /> Exit to Dashboard
          </button>
          <button 
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
          >
            <RefreshCw size={18} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-4">
            <Users size={20} />
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Users</p>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{stats.userCount}</h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center mb-4">
            <DollarSign size={20} />
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Money In (Completed)</p>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(stats.totalDeposited)}</h3>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center mb-4">
            <Clock size={20} />
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Pending Deposits</p>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(transactions.filter(t => t.status === 'pending' && t.type === 'DEPOSIT').reduce((sum, t) => sum + Number(t.amount), 0))}
          </h3>
        </motion.div>
      </div>

      {/* Global Bot Settings */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Lock size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Vertex Bot Global Passwords</h3>
              <p className="text-[10px] text-slate-500">Shared passwords required for all users to unlock Vertex bots</p>
            </div>
          </div>
          {editingId !== 'GLOBAL_PASS' ? (
            <button 
              onClick={() => {
                setEditingId('GLOBAL_PASS');
                setEditValue(globalWizardPassword);
                setEditValue2(globalWizard2Password);
              }}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-primary text-xs font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              Update Passwords
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleUpdateGlobalPasswords} className="p-2 bg-green-500 text-white rounded-lg"><Check size={16} /></button>
              <button onClick={() => setEditingId(null)} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg"><X size={16} /></button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Vertex Bot 1 Password</p>
            {editingId === 'GLOBAL_PASS' ? (
              <input 
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold"
                placeholder="Password for Vertex 1"
              />
            ) : (
              <p className="text-sm font-black text-slate-900 dark:text-white font-mono tracking-wider">{globalWizardPassword}</p>
            )}
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Vertex Bot 2 Password</p>
            {editingId === 'GLOBAL_PASS' ? (
              <input 
                type="text"
                value={editValue2}
                onChange={(e) => setEditValue2(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold"
                placeholder="Password for Vertex 2"
              />
            ) : (
              <p className="text-sm font-black text-slate-900 dark:text-white font-mono tracking-wider">{globalWizard2Password}</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Content Area */}
      <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        {/* Tabs & Search */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
            {[
              { id: 'users', label: 'Users', icon: Users },
              { id: 'deposits', label: 'Transactions', icon: RefreshCw },
              { id: 'copy-traders', label: 'Copy Traders', icon: TrendingUp }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  activeTab === tab.id 
                    ? "bg-white dark:bg-slate-700 text-primary shadow-sm" 
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={`Search by email or username...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-12 pr-4 text-xs font-bold focus:outline-none focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'users' ? (
              <motion.table 
                key="users-table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full text-left border-collapse"
              >
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">User Details</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Role & Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Referrals</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Account Balances</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Cash Flow</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black text-sm border border-primary/20">
                            {u.username?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white text-sm">{u.username}</p>
                            <p className="text-[10px] text-slate-500 font-medium">{u.email}</p>
                            <p className="text-[9px] text-slate-400 font-mono mt-1">ID: {u.id.substring(0, 8)}...</p>
                            <p className="text-[8px] text-slate-400 mt-0.5">Joined: {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <select 
                            value={u.role}
                            onChange={(e) => handleUpdateRole(u.id, e.target.value as any)}
                            className="bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary transition-all"
                          >
                            <option value="user">User</option>
                            <option value="marketer">Marketer</option>
                          </select>
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-widest",
                            u.verificationStatus === 'verified' ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"
                          )}>
                            {u.verificationStatus}
                          </span>
                          {u.verificationStatus === 'pending' && (
                            <div className="flex gap-1">
                              <button 
                                onClick={() => handleUpdateVerification(u.id, 'verified')}
                                className="text-[8px] font-bold text-green-500 hover:underline"
                              >
                                Approve
                              </button>
                              <span className="text-[8px] text-slate-300">|</span>
                              <button 
                                onClick={() => {
                                  if (window.confirm("Reject this verification?")) {
                                    handleUpdateVerification(u.id, 'rejected');
                                  }
                                }}
                                className="text-[8px] font-bold text-red-500 hover:underline"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-[10px] font-bold text-slate-900 dark:text-white font-mono">{u.referral_code || '---'}</p>
                          {u.referred_by && (
                            <p className="text-[8px] text-slate-400 italic">By: {u.referred_by}</p>
                          )}
                          <div className="mt-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[9px] font-bold">
                            {referralCounts[u.id] || 0} Refs
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-center gap-8">
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Real Balance</p>
                            {editingId === u.id + '-REAL' ? (
                              <div className="flex items-center gap-1">
                                <input 
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="w-24 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-xs font-bold"
                                  autoFocus
                                />
                                <button onClick={() => handleUpdateBalance(u.id)} className="text-green-500 p-1 hover:bg-green-500/10 rounded"><Check size={14} /></button>
                                <button onClick={() => setEditingId(null)} className="text-red-500 p-1 hover:bg-red-500/10 rounded"><X size={14} /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <span className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(u.real_balance || 0)}</span>
                                <button onClick={() => { setEditingId(u.id + '-REAL'); setEditValue((u.real_balance || 0).toString()); setEditType('REAL'); }} className="text-slate-300 hover:text-primary opacity-0 group-hover:opacity-100 transition-all"><Edit2 size={12} /></button>
                              </div>
                            )}
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Demo Balance</p>
                            {editingId === u.id + '-DEMO' ? (
                              <div className="flex items-center gap-1">
                                <input 
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="w-24 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-xs font-bold"
                                  autoFocus
                                />
                                <button onClick={() => handleUpdateBalance(u.id)} className="text-green-500 p-1 hover:bg-green-500/10 rounded"><Check size={14} /></button>
                                <button onClick={() => setEditingId(null)} className="text-red-500 p-1 hover:bg-red-500/10 rounded"><X size={14} /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <span className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(u.demo_balance || 0)}</span>
                                <button onClick={() => { setEditingId(u.id + '-DEMO'); setEditValue((u.demo_balance || 0).toString()); setEditType('DEMO'); }} className="text-slate-300 hover:text-primary opacity-0 group-hover:opacity-100 transition-all"><Edit2 size={12} /></button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col items-center gap-1">
                          <div className="text-center">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Deposits</p>
                            <p className="text-xs font-bold text-green-500">{formatCurrency(u.total_deposits || 0)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Withdrawals</p>
                            <p className="text-xs font-bold text-red-500">{formatCurrency(u.total_withdrawals || 0)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400">
                          <MoreVertical size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2 opacity-50">
                          <Users size={40} />
                          <p className="text-sm font-medium">No users found in the system</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </motion.table>
            ) : activeTab === 'deposits' ? (
              <motion.table 
                key="trans-table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full text-left border-collapse"
              >
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transaction</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">User</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center",
                            t.type === 'DEPOSIT' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {t.type === 'DEPOSIT' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">{t.type}</p>
                            <p className="text-[9px] text-slate-500 font-medium">{new Date(t.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">{t.users?.username || 'Unknown'}</p>
                          <p className="text-[10px] text-slate-500">{t.users?.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div>
                          <p className={cn(
                            "font-bold text-sm",
                            t.type === 'DEPOSIT' || t.method?.toLowerCase().includes('hashback') || t.method?.toLowerCase().includes('finapi') ? "text-green-500" : "text-red-500"
                          )}>
                            {t.type === 'DEPOSIT' ? '+' : '-'}{formatCurrency(t.amount)}
                          </p>
                          <div className="mt-1">
                            {(() => {
                              const method = t.method || 'Direct';
                              if (method.toLowerCase().includes('hashback') || method.toLowerCase().includes('finapi')) {
                              const isHashback = method.toLowerCase().includes('hashback');
                              const label = isHashback ? 'HASHBACK' : 'FINAPI';
                              const idMatch = method.match(/\(([^)]+)\)/);
                              const id = idMatch ? idMatch[1] : null;
                              
                              if (t.status === 'completed' || t.status === 'success' || t.status === 'successful') {
                                return (
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                                    {method.toLowerCase().includes('callback') || method.toLowerCase().includes('status') || method.toLowerCase().includes('webhook')
                                      ? `${label} CALLBACK ${id ? `(${id})` : ''}`
                                      : `${label} ${id ? `(${id})` : ''}`}
                                  </p>
                                );
                              } else {
                                return (
                                  <>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">{label}</p>
                                    {id && <p className="text-[9px] text-slate-400 font-medium italic">({id})</p>}
                                  </>
                                );
                              }
                            }
                              return <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{method}</p>;
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-2 w-fit shadow-sm",
                          (t.status === 'completed' || t.status === 'success' || t.status === 'successful') 
                            ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" 
                            : t.status === 'pending' 
                              ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" 
                              : "bg-rose-500/10 text-rose-600 border border-rose-500/20 shadow-rose-500/5"
                        )}>
                          {(t.status === 'completed' || t.status === 'success' || t.status === 'successful') ? (
                            <><CheckCircle2 size={12} className="text-emerald-500" /> CONFIRMED</>
                          ) : t.status === 'pending' ? (
                            <><Clock size={12} className="text-amber-500" /> PENDING</>
                          ) : (
                            <div className="flex flex-col items-start gap-0.5">
                              <div className="flex items-center gap-2">
                                <XCircle size={12} className="text-rose-500" /> REJECTED
                              </div>
                              {(t.metadata?.client_reason || t.metadata?.message) && (
                                <p className="text-[8px] text-rose-400 font-medium italic lowercase max-w-[100px] truncate" title={t.metadata.client_reason || t.metadata.message}>
                                  {t.metadata.client_reason || t.metadata.message}
                                </p>
                              )}
                            </div>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {t.status === 'pending' && (t.method?.toLowerCase().includes('finapi') || t.method?.toLowerCase().includes('hashback')) && (
                            <button 
                              onClick={async () => {
                                const id = t.external_id || t.id;
                                try {
                                  const result = await checkPaymentStatus(id);
                                  if (result) {
                                    loadData();
                                    const statusStr = result.status || result.message || 'Updated';
                                    const label = t.method?.toLowerCase().includes('hashback') ? 'Hashback' : 'FinAPI';
                                    alert(`${label} Status: ${statusStr}`);
                                  } else {
                                    alert("No update from the payment gateway yet. User might still be entering PIN.");
                                  }
                                } catch (err) {
                                  alert("Error communicating with the verification service.");
                                }
                              }}
                              className="p-1.5 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all group relative"
                              title="Sync with Payment Gateway"
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}
                          {t.status === 'pending' && (
                            <>
                              <button 
                                onClick={() => handleUpdateTransaction(t.id, 'completed')}
                                className="p-1.5 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500 hover:text-white transition-all"
                                title="Approve"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleUpdateTransaction(t.id, 'rejected')}
                                className="p-1.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                                title="Reject"
                              >
                                <XCircle size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </motion.table>
            ) : (
              <motion.table 
                key="copy-traders-table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full text-left border-collapse"
              >
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trader Details</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Performance</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Security (Pass)</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Investment</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {copyTraders.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 font-black text-xs border border-blue-500/20">
                            {t.name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white text-[13px]">{t.name}</p>
                            <p className="text-[9px] text-slate-500 font-medium">By: {t.createdBy}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-center">
                          <p className="text-[11px] font-bold text-green-500">{t.winRate}% Win</p>
                          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">{t.followers} Fol.</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                          <Lock size={10} className="text-amber-500" />
                          <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">{t.password}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div>
                          <p className="text-xs font-black text-slate-900 dark:text-white">{formatCurrency(t.minInvestment)}</p>
                          <p className="text-[8px] text-slate-400 uppercase font-bold tracking-widest">Min.</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={async () => {
                              const newName = window.prompt("Enter new name:", t.name);
                              if (newName === null) return;
                              
                              const newWinRateStr = window.prompt("Enter new win rate:", t.winRate.toString());
                              if (newWinRateStr === null) return;
                              const newWinRate = parseFloat(newWinRateStr);
                              
                              const newProfitStr = window.prompt("Enter new total profit:", t.totalProfit.toString());
                              if (newProfitStr === null) return;
                              const newProfit = parseFloat(newProfitStr);
                              
                              const newFollowersStr = window.prompt("Enter new followers:", t.followers.toString());
                              if (newFollowersStr === null) return;
                              const newFollowers = parseInt(newFollowersStr);
                              
                              const newMinInvStr = window.prompt("Enter new min investment:", t.minInvestment.toString());
                              if (newMinInvStr === null) return;
                              const newMinInv = parseFloat(newMinInvStr);
                              
                              const newPass = window.prompt("Enter new access password (leave empty for none):", t.password || "");
                              if (newPass === null) return;

                              await updateCopyTrader(t.id, {
                                name: newName || t.name,
                                winRate: isNaN(newWinRate) ? t.winRate : newWinRate,
                                totalProfit: isNaN(newProfit) ? t.totalProfit : newProfit,
                                followers: isNaN(newFollowers) ? t.followers : newFollowers,
                                minInvestment: isNaN(newMinInv) ? t.minInvestment : newMinInv,
                                password: newPass
                              });
                              
                              alert("Profile updated successfully");
                            }}
                            className="p-1.5 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-white transition-all"
                            title="Edit Stats & Password"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={async () => {
                              if (window.confirm(`Are you sure you want to PERMANENTLY delete ${t.name}? This cannot be undone.`)) {
                                try {
                                  await deleteCopyTrader(t.id);
                                  alert("Trader deleted successfully");
                                } catch (err) {
                                  console.error("Delete failed:", err);
                                  alert("Failed to delete trader profile.");
                                }
                              }
                            }}
                            className="p-1.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                            title="Delete Permanently"
                          >
                            <XCircle size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </motion.table>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
