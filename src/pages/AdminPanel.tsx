import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext.tsx';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';
import { User, Transaction } from '../types.ts';
import { 
  Users, 
  Wallet, 
  CheckCircle2, 
  XCircle, 
  Search,
  ShieldCheck,
  Loader2
} from 'lucide-react';

export default function AdminPanel() {
  const { user } = useStore();
  const [users, setUsers] = useState<User[]>([]);
  const [transactions, setTransactions] = useState<(Transaction & { username: string, email: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'transactions'>('users');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    try {
      const { data: usersData, error: usersError } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (usersError) throw usersError;

      const { data: transData, error: transError } = await supabase.from('transactions').select('*, users:user_id (username, email)').eq('status', 'pending').order('timestamp', { ascending: false });
      if (transError) throw transError;

      setUsers(usersData.map((u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        phone: u.phone,
        role: u.role,
        realBalance: Number(u.real_balance || 0),
        demoBalance: Number(u.demo_balance || 0),
        verificationStatus: u.verification_status || 'not_verified',
        createdAt: new Date(u.created_at).getTime(),
        trades: [],
        transactions: [],
        activeAccount: u.active_account,
        profit: 0, dailyProfit: 0,
        bots: { scalping: false, trend: false, ai: false, custom: false },
      })));

      setTransactions(transData.map((t: any) => ({
        id: t.id,
        userId: t.user_id,
        username: t.users?.username || 'Unknown',
        email: t.users?.email || 'Unknown',
        type: t.type,
        amount: Number(t.amount),
        status: t.status,
        accountType: t.account_type,
        method: t.method,
        externalId: t.external_id,
        timestamp: new Date(t.timestamp).getTime()
      })));
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, role: string) => {
    setProcessingId(userId);
    try {
      await supabase.from('users').update({ role }).eq('id', userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: role as any } : u));
    } catch (err) { console.error(err); } finally { setProcessingId(null); }
  };

  const handleVerification = async (userId: string, status: 'verified' | 'not_verified') => {
    setProcessingId(userId);
    try {
      await supabase.from('users').update({ verification_status: status }).eq('id', userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, verificationStatus: status as any } : u));
    } catch (err) { console.error(err); } finally { setProcessingId(null); }
  };

  const processTransaction = async (txId: string, status: 'completed' | 'rejected', userId: string, amount: number, type: string) => {
    setProcessingId(txId);
    try {
      if (type === 'DEPOSIT' && status === 'completed') {
        const { data: userData } = await supabase.from('users').select('real_balance').eq('id', userId).single();
        const newBalance = Number((Number(userData?.real_balance || 0) + amount).toFixed(2));
        await supabase.from('users').update({ real_balance: newBalance }).eq('id', userId);
      }
      await supabase.from('transactions').update({ status }).eq('id', txId);
      setTransactions(prev => prev.filter(t => t.id !== txId));
      fetchData();
    } catch (err) { console.error(err); } finally { setProcessingId(null); }
  };

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading && users.length === 0) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><ShieldCheck className="w-8 h-8 text-blue-500" />Admin Panel</h1>
          <p className="text-gray-400">Manage platform users and pending transactions.</p>
        </div>
        <div className="flex bg-[#121212] rounded-lg p-1">
          <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Users</button>
          <button onClick={() => setActiveTab('transactions')} className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'transactions' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Transactions</button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-[#121212] border border-gray-800 rounded-xl text-white focus:outline-none focus:border-blue-500" />
      </div>

      {activeTab === 'users' ? (
        <div className="bg-[#121212] border border-gray-800 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] border-b border-gray-800">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">User</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Verification</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Balance</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[#1a1a1a]">
                  <td className="px-6 py-4"><div className="flex flex-col"><span className="text-white font-medium">{u.username}</span><span className="text-gray-500 text-xs">{u.email}</span><span className="text-[10px] text-blue-400 uppercase font-bold mt-1">{u.role}</span></div></td>
                  <td className="px-6 py-4"><span className={`text-xs px-2 py-1 rounded-full ${u.verificationStatus === 'verified' ? 'text-green-500' : u.verificationStatus === 'pending' ? 'text-yellow-500' : 'text-red-500'}`}>{u.verificationStatus.toUpperCase()}</span></td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col"><span className="text-green-500 font-bold">${u.realBalance.toLocaleString()}</span><span className="text-gray-500 text-xs">${u.demoBalance.toLocaleString()} Demo</span></div>
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    {u.verificationStatus !== 'verified' && <button onClick={() => handleVerification(u.id, 'verified')} className="text-xs bg-green-600 px-2 py-1 rounded text-white">Verify</button>}
                    {u.role === 'user' && <button onClick={() => updateUserRole(u.id, 'marketer')} className="text-xs bg-blue-600 px-2 py-1 rounded text-white">Make Marketer</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-[#121212] border border-gray-800 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] border-b border-gray-800">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Details</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Amount</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-[#1a1a1a]">
                  <td className="px-6 py-4"><div className="flex flex-col"><span className="text-white">{t.username}</span><span className="text-xs text-gray-500">{t.type} via {t.method}</span></div></td>
                  <td className="px-6 py-4 font-bold text-blue-500">${t.amount.toLocaleString()}</td>
                  <td className="px-6 py-4 flex gap-2">
                    <button onClick={() => processTransaction(t.id, 'completed', t.userId, t.amount, t.type)} className="p-1 bg-green-600 rounded text-white"><CheckCircle2 className="w-4 h-4" /></button>
                    <button onClick={() => processTransaction(t.id, 'rejected', t.userId, t.amount, t.type)} className="p-1 bg-red-600 rounded text-white"><XCircle className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
