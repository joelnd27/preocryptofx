import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
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
  Clock
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatCurrency, cn } from '../lib/utils';

type AdminTab = 'users' | 'deposits';

export default function AdminPanel() {
  const { user, getAllUsers, getGlobalStats, updateUserBalance, updateUserRole, updateUserVerificationStatus, getAllTransactions, updateTransactionStatus } = useStore();
  const [users, setUsers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalDeposited: 0, userCount: 0 });
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editType, setEditType] = useState<'REAL' | 'DEMO'>('REAL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allUsers, globalStats, allTrans] = await Promise.all([
        getAllUsers(),
        getGlobalStats(),
        getAllTransactions()
      ]);
      setUsers(allUsers || []);
      setStats(globalStats);
      setTransactions(allTrans || []);
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

  const handleUpdateTransaction = async (id: string, status: 'completed' | 'rejected') => {
    const success = await updateTransactionStatus(id, status);
    if (success) {
      loadData();
    }
  };

  const handleUpdateRole = async (userId: string, role: 'user' | 'marketer' | 'admin') => {
    const success = await updateUserRole(userId, role);
    if (success) {
      // Update local state immediately so the UI reflects the change without waiting for loadData
      setUsers(prev => prev.map(u => u.id === userId ? { 
        ...u, 
        role,
        verificationStatus: role === 'marketer' ? 'verified' : u.verificationStatus 
      } : u));
      // Re-fetch to ensure everything is in sync with DB
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
      
      // Hide auto-rejected fraudulent transactions from main view unless explicitly searched
      const isAutoRejected = t.method?.includes('Auto-Rejected');
      if (isAutoRejected && search === '') return false;

      return matchesSearch;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (user?.role !== 'admin') {
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

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-slate-500 font-medium">Manage users and platform deposits</p>
        </div>
        <button 
          onClick={loadData}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
        >
          <RefreshCw size={18} className={cn(loading && "animate-spin")} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-4">
            <Users size={20} />
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Users</p>
          <h3 className="text-xl font-black text-slate-900 dark:text-white">{stats.userCount}</h3>
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
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Money In</p>
          <h3 className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(stats.totalDeposited)}</h3>
        </motion.div>
      </div>

      {/* Content Area */}
      <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        {/* Tabs & Search */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
            {[
              { id: 'users', label: 'Users', icon: Users },
              { id: 'deposits', label: 'Transactions', icon: RefreshCw }
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
                            {u.role === 'admin' && <option value="admin">Admin</option>}
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
                                onClick={() => handleUpdateVerification(u.id, 'rejected')}
                                className="text-[8px] font-bold text-red-500 hover:underline"
                              >
                                Reject
                              </button>
                            </div>
                          )}
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
            ) : (
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
                            t.type === 'DEPOSIT' ? "text-green-500" : "text-red-500"
                          )}>
                            {t.type === 'DEPOSIT' ? '+' : '-'}{formatCurrency(t.amount)}
                          </p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{t.method || 'Direct'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 w-fit",
                          t.status === 'completed' ? "bg-green-500/10 text-green-500" :
                          t.status === 'pending' ? "bg-yellow-500/10 text-yellow-500" :
                          "bg-red-500/10 text-red-500"
                        )}>
                          {t.status === 'completed' ? <CheckCircle2 size={10} /> : 
                           t.status === 'pending' ? <Clock size={10} /> : <XCircle size={10} />}
                          {t.status === 'pending' ? 'is pending' : t.status}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        {t.status === 'pending' && t.type === 'WITHDRAW' && (
                          <div className="flex items-center justify-end gap-2">
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
                          </div>
                        )}
                        {t.status === 'pending' && t.type === 'DEPOSIT' && (
                          <span className="text-[10px] text-slate-400 font-medium italic">Processing via API...</span>
                        )}
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
