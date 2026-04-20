import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext.tsx';
import { 
  Users, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search, 
  Filter, 
  MoreVertical,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Shield,
  Loader2,
  RefreshCcw,
  Check,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

export default function AdminPanel() {
  const { user: currentUser } = useStore();
  const [users, setUsers] = useState<any[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'transactions'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    if (currentUser?.role !== 'admin') return;
    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      
      const [usersRes, txRes] = await Promise.all([
        fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/transactions', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!usersRes.ok || !txRes.ok) throw new Error('Failed to fetch admin data');
      
      const usersData = await usersRes.json();
      const txData = await txRes.json();
      
      setUsers(usersData || []);
      setPendingTransactions(txData || []);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const processTransaction = async (txId: string, status: 'completed' | 'rejected', userId: string, amount: number) => {
    setProcessingId(txId);
    try {
      const response = await fetch('/api/admin/credit-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          userId,
          amount: status === 'completed' ? amount : 0,
          transactionId: txId
        })
      });

      if (!response.ok) throw new Error('Failed to process transaction');
      
      await fetchAdminData();
    } catch (err) {
      console.error('Error processing transaction:', err);
      alert('Failed to process transaction');
    } finally {
      setProcessingId(null);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const response = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          userId,
          updates: { role: newRole }
        })
      });

      if (!response.ok) throw new Error('Failed to update role');
      await fetchAdminData();
    } catch (err) {
      console.error('Error updating role:', err);
      alert('Failed to update role');
    }
  };

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-500" />
            Admin Command Center
          </h1>
          <p className="text-gray-400">Manage platform users, verify identity documents, and process financial requests.</p>
        </div>
        <button 
          onClick={fetchAdminData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 text-blue-500 rounded-lg hover:bg-blue-600/20 transition-all border border-blue-500/20"
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-[#121212] rounded-xl border border-gray-800 w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'users' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'transactions' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Pending Deposits ({pendingTransactions.length})
        </button>
      </div>

      <div className="bg-[#121212] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by username or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl py-2.5 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2.5 bg-[#1a1a1a] border border-gray-800 rounded-xl text-gray-400 hover:text-white transition-all">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'users' ? (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 bg-[#161616]">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Balance (REAL)</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Verification</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Joined</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600/20 to-blue-900/20 border border-blue-500/30 flex items-center justify-center text-blue-500 font-bold">
                          {u.username?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-medium">{u.username}</p>
                          <p className="text-gray-500 text-xs">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select 
                        value={u.role}
                        onChange={(e) => updateUserRole(u.id, e.target.value)}
                        className="bg-[#1a1a1a] border border-gray-800 rounded-lg px-2 py-1 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="user">User</option>
                        <option value="marketer">Marketer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white font-mono">${Number(u.real_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        u.verification_status === 'verified' ? 'bg-green-500/10 text-green-500' :
                        u.verification_status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                        'bg-gray-500/10 text-gray-500'
                      }`}>
                        {u.verification_status === 'verified' ? <CheckCircle2 className="w-3 h-3" /> :
                         u.verification_status === 'pending' ? <Clock className="w-3 h-3" /> :
                         <XCircle className="w-3 h-3" />}
                        {u.verification_status?.replace('_', ' ').toUpperCase()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <button className="p-2 text-gray-500 hover:text-white transition-colors">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 bg-[#161616]">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Method/ID</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Reference</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {pendingTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-white font-medium">{tx.user?.username}</p>
                      <p className="text-gray-500 text-xs">{tx.user?.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-gray-300 text-sm font-medium">{tx.method}</p>
                      <p className="text-gray-500 text-[10px] font-mono">{tx.external_id}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-green-500 font-bold">+${tx.amount}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-yellow-500/10 text-yellow-500 text-xs rounded-full font-medium flex items-center w-fit gap-1.5">
                        <Clock className="w-3 h-3" /> PENDING
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          disabled={processingId !== null}
                          onClick={() => processTransaction(tx.id, 'completed', tx.user_id, tx.amount)}
                          className="p-2 bg-green-600/10 text-green-500 hover:bg-green-600 hover:text-white rounded-lg transition-all disabled:opacity-50"
                        >
                          {processingId === tx.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          disabled={processingId !== null}
                          onClick={() => processTransaction(tx.id, 'rejected', tx.user_id, 0)}
                          className="p-2 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white rounded-lg transition-all disabled:opacity-50"
                        >
                          {processingId === tx.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pendingTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No pending deposits to review.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      )}
    </div>
  );
}
