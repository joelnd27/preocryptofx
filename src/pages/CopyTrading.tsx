import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  TrendingUp, 
  Shield, 
  Lock, 
  ChevronRight, 
  Search, 
  Filter,
  BarChart3,
  History,
  Info,
  X,
  Target,
  ArrowUpRight,
  UserPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { cn, formatCurrency } from '../lib/utils';
import AlertModal from '../components/AlertModal';

export default function CopyTrading() {
  const { user, copyTraders, addCopyTrader, updateCopyTrader, startCopying, stopCopying, traderActivity, getTraderFollowers } = useStore();
  const [search, setSearch] = useState('');
  const [selectedTrader, setSelectedTrader] = useState<any>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showVerifyPassword, setShowVerifyPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [traderToCopy, setTraderToCopy] = useState<any>(null);

  const [alertConfig, setAlertConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info' as 'error' | 'success' | 'info' | 'warning'
  });

  const [newTrader, setNewTrader] = useState({
    name: '',
    avatar: '',
    winRate: 85,
    totalProfit: 1000,
    followers: 0,
    password: '',
    minInvestment: 50,
    description: '',
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [traderToEdit, setTraderToEdit] = useState<any>(null);
  const [manageTab, setManageTab] = useState<'stats' | 'followers' | 'activity'>('stats');

  const handleUpdateTrader = async () => {
    if (!traderToEdit) return;
    await updateCopyTrader(traderToEdit.id, traderToEdit);
    setAlertConfig({
      isOpen: true,
      title: 'Success',
      message: 'Your profile stats have been updated.',
      type: 'success'
    });
    setIsEditModalOpen(false);
    setTraderToEdit(null);
  };

  const isMarketerOrAdmin = user?.role === 'marketer' || user?.role === 'admin';

  const filteredTraders = copyTraders.filter(t => {
    // Search match & active status match
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) && t.status === 'active';
    if (!matchesSearch) return false;

    // Simulated, preloaded, and admin-system profiles are always visible to everyone
    if (t.isSimulated || t.createdBy === 'admin' || t.createdBy === 'system') return true;

    // If the profile was created by the logged-in user themselves, it is visible to them
    if (user && t.createdBy === user.id) return true;

    // Otherwise, it's only visible to others if the creator's role is 'marketer' or 'admin'
    const isCreatorMarketerOrAdmin = t.creatorRole === 'marketer' || t.creatorRole === 'admin';
    return isCreatorMarketerOrAdmin;
  });

  const handleCopyClick = (trader: any) => {
    if (user?.activeAccount !== 'REAL') {
      setAlertConfig({
        isOpen: true,
        title: 'Real Account Required',
        message: 'Copy trading is only available for Real accounts. Please switch your active account to "Real" using the account selector in the top bar to follow master traders and copy their trades.',
        type: 'warning'
      });
      return;
    }

    if (user?.copyingTraderId === trader.id) {
      setAlertConfig({
        isOpen: true,
        title: 'Already Copying',
        message: `You are already copying ${trader.name}. Do you want to stop?`,
        type: 'info'
      });
      return;
    }

    const balance = user?.realBalance || 0;
    if (balance < trader.minInvestment) {
      setAlertConfig({
        isOpen: true,
        title: 'Insufficient Balance',
        message: `You need at least ${formatCurrency(trader.minInvestment)} in your Real Account to copy this trader.`,
        type: 'warning'
      });
      return;
    }
    setTraderToCopy(trader);
    setIsPasswordModalOpen(true);
  };

  const handleVerifyPassword = async () => {
    if (passwordInput === traderToCopy.password) {
      await startCopying(traderToCopy.id);
      setAlertConfig({
        isOpen: true,
        title: 'Success!',
        message: `You are now copy-trading ${traderToCopy.name}. All their trades will be reflected in your account.`,
        type: 'success'
      });
      setIsPasswordModalOpen(false);
      setPasswordInput('');
      setTraderToCopy(null);
    } else {
      setAlertConfig({
        isOpen: true,
        title: 'Incorrect Password',
        message: 'The password provided is incorrect. Please contact the trader for access.',
        type: 'error'
      });
    }
  };

  const handleCreateTrader = async () => {
    if (!newTrader.name || !newTrader.password) {
      setAlertConfig({
        isOpen: true,
        title: 'Missing Information',
        message: 'Please provide a name and password for the trader profile.',
        type: 'warning'
      });
      return;
    }

    await addCopyTrader({
      ...newTrader,
      status: 'active',
      isSimulated: false,
      createdBy: user?.id || 'unknown',
    });

    setAlertConfig({
      isOpen: true,
      title: 'Profile Created',
      message: 'Your copy trading profile has been successfully created and is now visible to users.',
      type: 'success'
    });
    setIsCreateModalOpen(false);
    setNewTrader({
      name: '',
      avatar: '',
      winRate: 85,
      totalProfit: 1000,
      followers: 0,
      password: '',
      minInvestment: 50,
      description: '',
    });
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users size={20} className="text-blue-500" /> Copy Trading
          </h2>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Automate your portfolio by following world-class traders</p>
        </div>
        {isMarketerOrAdmin && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-600/10 text-[10px] sm:text-xs"
          >
            <UserPlus size={14} /> Create Profile
          </button>
        )}
      </div>

      {user?.activeAccount !== 'REAL' && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-3">
          <Info className="text-amber-500 shrink-0 mt-0.5" size={16} />
          <div>
            <h4 className="text-[11px] font-black text-amber-500 uppercase tracking-wider">Demo Account Active</h4>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed mt-0.5">
              Copy trading is strictly restricted to Real Accounts. Please switch your active account type to <span className="font-bold text-slate-900 dark:text-white">Real</span> using the account selector in the top bar to follow master traders and copy their trades.
            </p>
          </div>
        </div>
      )}

      {/* Hero Stats - Compact */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Masters', value: filteredTraders.length, color: 'text-slate-900 dark:text-white' },
          { label: 'Avg Win Rate', value: `${(filteredTraders.reduce((acc, t) => acc + t.winRate, 0) / filteredTraders.length || 0).toFixed(1)}%`, color: 'text-green-500' },
          { label: 'Total Profit', value: formatCurrency(filteredTraders.reduce((acc, t) => acc + t.totalProfit, 0)), color: 'text-blue-500' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl text-center">
            <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{stat.label}</p>
            <p className={cn("text-xs sm:text-sm font-black", stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search - Compact */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
        <input
          type="text"
          placeholder="Search master traders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-9 pr-4 text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all shadow-sm"
        />
      </div>

      {/* Traders Grid - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <AnimatePresence>
          {filteredTraders.map((trader, index) => (
            <motion.div
              key={trader.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03 }}
              className={cn(
                "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all group",
                user?.copyingTraderId === trader.id && "ring-1 ring-blue-500/50 border-blue-500/30"
              )}
            >
              <div className="p-3.5 space-y-3">
                {/* Profile Info */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    {trader.avatar ? (
                      (trader.avatar.startsWith('http://') || trader.avatar.startsWith('https://') || trader.avatar.startsWith('/')) ? (
                        <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white flex items-center justify-center">
                          <img src={trader.avatar} alt={trader.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500 font-black text-sm border border-blue-500/20">
                          {trader.avatar}
                        </div>
                      )
                    ) : (
                      <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500 font-black text-xs border border-blue-500/20">
                        {trader.name[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-[11px] leading-tight line-clamp-1">{trader.name}</h3>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[7px] text-slate-400 font-bold flex items-center gap-0.5">
                          <Users size={8} /> {trader.followers + (getTraderFollowers(trader.id)?.length || 0)}
                        </span>
                        {user?.copyingTraderId === trader.id ? (
                          <span className="text-[7px] text-blue-500 font-black flex items-center gap-0.5 animate-pulse">
                            <CheckCircle2 size={8} /> ACTIVE
                          </span>
                        ) : (
                          <span className="text-[7px] text-green-500 font-bold">Top Tier</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[6px] font-bold text-slate-400 uppercase tracking-tighter leading-none mb-0.5">Win Rate</p>
                    <p className="text-[11px] font-black text-green-500 leading-none">{trader.winRate}%</p>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:divide-slate-800">
                  <div>
                    <p className="text-[6px] font-bold text-slate-500 uppercase tracking-tighter mb-0.5">Profit</p>
                    <p className="text-[9px] font-black text-slate-900 dark:text-white font-mono">{formatCurrency(trader.totalProfit)}</p>
                  </div>
                  <div>
                    <p className="text-[6px] font-bold text-slate-500 uppercase tracking-tighter mb-0.5">Min. Copy</p>
                    <p className="text-[9px] font-black text-slate-900 dark:text-white font-mono">{formatCurrency(trader.minInvestment)}</p>
                  </div>
                </div>

                {/* Description - Optional/Smaller */}
                <p className="text-[8px] text-slate-500 dark:text-slate-400 leading-tight line-clamp-1 italic">
                  {trader.description || "Consistent trading strategy."}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-1">
                  {trader.createdBy === user?.id ? (
                    <button 
                      onClick={() => {
                        setTraderToEdit(trader);
                        setManageTab('stats');
                        setIsEditModalOpen(true);
                      }}
                      className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg font-bold flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Users size={10} /> Manage
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        if (user?.copyingTraderId === trader.id) {
                          stopCopying();
                          setAlertConfig({
                            isOpen: true,
                            title: 'Stopped Copying',
                            message: `You have successfully unfollowed and stopped copying ${trader.name}.`,
                            type: 'info'
                          });
                        } else {
                          handleCopyClick(trader);
                        }
                      }}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider shadow-sm text-white",
                        user?.copyingTraderId === trader.id 
                          ? "bg-red-650 hover:bg-red-700 bg-red-600"
                          : "bg-blue-600 hover:bg-blue-700"
                      )}
                    >
                      {user?.copyingTraderId === trader.id ? <X size={10} /> : <Lock size={10} />}
                      {user?.copyingTraderId === trader.id ? 'Unfollow' : 'Copy'}
                    </button>
                  )}
                  <button 
                    onClick={() => setSelectedTrader(trader)}
                    className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Password Modal */}
      <AnimatePresence>
        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPasswordModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500">
                    <Shield size={24} />
                  </div>
                  <button onClick={() => setIsPasswordModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6 text-center">
                  <div>
                    <h3 className="text-xl font-bold mb-2">Password Required</h3>
                    <p className="text-xs text-slate-500">Copying {traderToCopy?.name} requires a secure access key provided by the master trader.</p>
                  </div>

                  <div className="relative">
                    <input
                      type={showVerifyPassword ? "text" : "password"}
                      placeholder="Enter Access Password"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-12 pr-12 text-center font-bold focus:outline-none focus:border-blue-500 transition-all"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      title={showVerifyPassword ? "Hide password" : "Show password"}
                    >
                      {showVerifyPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <button
                    onClick={handleVerifyPassword}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20"
                  >
                    Verify & Copy
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Trader Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold">New Trader Profile</h3>
                  <button onClick={() => setIsCreateModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trader Display Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Master Trader"
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={newTrader.name}
                      onChange={(e) => setNewTrader({ ...newTrader, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Profile Picture or Emoji</label>
                    <input
                      type="text"
                      placeholder="Paste Image URL or Enter Emoji"
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={newTrader.avatar}
                      onChange={(e) => setNewTrader({ ...newTrader, avatar: e.target.value })}
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['🐳', '🐂', '🥷', '⚔️', '🤖', '🧑‍🚀', '🦈', '✂️', '🦁', '📈', '💎', '👑', '💰', '🔥'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setNewTrader({ ...newTrader, avatar: emoji })}
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-base bg-slate-50 dark:bg-slate-800 border hover:bg-slate-100 dark:hover:bg-slate-700 transition-all",
                            newTrader.avatar === emoji ? "border-blue-500 ring-1 ring-blue-500/30 bg-blue-500/5" : "border-slate-200 dark:border-slate-700"
                          )}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Win Rate (%)</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        value={newTrader.winRate}
                        onChange={(e) => setNewTrader({ ...newTrader, winRate: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Followers</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        value={newTrader.followers}
                        onChange={(e) => setNewTrader({ ...newTrader, followers: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Min. Investment ($)</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        value={newTrader.minInvestment}
                        onChange={(e) => setNewTrader({ ...newTrader, minInvestment: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Access Password</label>
                      <div className="relative">
                        <input
                          type={showCreatePassword ? "text" : "password"}
                          placeholder="Required for users to copy"
                          className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-4 pr-10 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                          value={newTrader.password}
                          onChange={(e) => setNewTrader({ ...newTrader, password: e.target.value })}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCreatePassword(!showCreatePassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                          title={showCreatePassword ? "Hide password" : "Show password"}
                        >
                          {showCreatePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Strategy Description</label>
                    <textarea
                      placeholder="Briefly describe the trading style..."
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors h-24 resize-none"
                      value={newTrader.description}
                      onChange={(e) => setNewTrader({ ...newTrader, description: e.target.value })}
                    />
                  </div>

                  <button
                    onClick={handleCreateTrader}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20"
                  >
                    Launch Profile
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Trader Modal / Manage View */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                  {traderToEdit?.avatar ? (
                    (traderToEdit.avatar.startsWith('http://') || traderToEdit.avatar.startsWith('https://') || traderToEdit.avatar.startsWith('/')) ? (
                      <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white flex items-center justify-center">
                        <img src={traderToEdit.avatar} alt={traderToEdit.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 font-black text-lg border border-blue-500/20">
                        {traderToEdit.avatar}
                      </div>
                    )
                  ) : (
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 font-black border border-blue-500/20">
                      {traderToEdit?.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Manage Master Profile</h3>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{traderToEdit?.name}</p>
                  </div>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex p-2 bg-slate-50 dark:bg-slate-800/50 gap-2 border-b border-slate-100 dark:border-slate-800">
                {[
                  { id: 'stats', label: 'Stats & Info', icon: BarChart3 },
                  { id: 'followers', label: 'Followers', icon: Users },
                  { id: 'activity', label: 'Recent Trades', icon: TrendingUp },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setManageTab(tab.id as any)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-bold transition-all",
                      manageTab === tab.id 
                        ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm border border-slate-200 dark:border-slate-600"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <tab.icon size={14} /> {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {manageTab === 'stats' && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Profile Picture or Emoji</label>
                      <input
                        type="text"
                        placeholder="Paste Image URL or Enter Emoji"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors"
                        value={traderToEdit?.avatar || ''}
                        onChange={(e) => setTraderToEdit({ ...traderToEdit, avatar: e.target.value })}
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {['🐳', '🐂', '🥷', '⚔️', '🤖', '🧑‍🚀', '🦈', '✂️', '🦁', '📈', '💎', '👑', '💰', '🔥'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setTraderToEdit({ ...traderToEdit, avatar: emoji })}
                            className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center text-sm bg-slate-50 dark:bg-slate-800 border hover:bg-slate-100 dark:hover:bg-slate-700 transition-all",
                              traderToEdit?.avatar === emoji ? "border-blue-500 ring-1 ring-blue-500/30 bg-blue-500/5" : "border-slate-200 dark:border-slate-700"
                            )}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Win Rate (%)</label>
                        <input
                          type="number"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors"
                          value={traderToEdit?.winRate}
                          onChange={(e) => setTraderToEdit({ ...traderToEdit, winRate: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Followers (Simulated)</label>
                        <input
                          type="number"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors"
                          value={traderToEdit?.followers}
                          onChange={(e) => setTraderToEdit({ ...traderToEdit, followers: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Profit ($)</label>
                        <input
                          type="number"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors"
                          value={traderToEdit?.totalProfit}
                          onChange={(e) => setTraderToEdit({ ...traderToEdit, totalProfit: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Min. Investment ($)</label>
                        <input
                          type="number"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors"
                          value={traderToEdit?.minInvestment}
                          onChange={(e) => setTraderToEdit({ ...traderToEdit, minInvestment: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Strategy Description</label>
                      <textarea
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-xs focus:outline-none focus:border-blue-500 transition-colors h-24 resize-none font-medium leading-relaxed"
                        value={traderToEdit?.description}
                        onChange={(e) => setTraderToEdit({ ...traderToEdit, description: e.target.value })}
                        placeholder="Share your trading methodology..."
                      />
                    </div>
                  </div>
                )}

                {manageTab === 'followers' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Active Followers ({getTraderFollowers(traderToEdit?.id)?.length || 0})</h4>
                    </div>
                    {getTraderFollowers(traderToEdit?.id)?.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border-2 border-dashed border-slate-100 dark:border-slate-800">
                        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400">
                          <Users size={24} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 max-w-[200px]">No real users are currently copying this profile. Once they enter the password, they will appear here.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {getTraderFollowers(traderToEdit?.id).map((f: any) => (
                          <div key={f.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-blue-500 text-white rounded-lg flex items-center justify-center text-xs font-black">
                                {f.name?.[0] || 'U'}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-900 dark:text-white">{f.name || f.email}</p>
                                <p className="text-[8px] text-slate-500 uppercase font-black tracking-tighter">Account: {f.activeAccount}</p>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[8px] font-black uppercase tracking-widest">Following</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {manageTab === 'activity' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Recent Trading Activity</h4>
                      <p className="text-[8px] text-slate-500 uppercase font-bold tracking-widest">Real-time signals</p>
                    </div>
                    <div className="space-y-3">
                      {(traderActivity[traderToEdit?.id] || []).map((act: any) => (
                        <div key={act.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black",
                              act.type === 'BUY' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                            )}>
                              {act.type}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">{act.pair}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] text-slate-500 font-bold flex items-center gap-1"><Clock size={8} /> {act.time}</span>
                                <span className="text-[8px] text-green-500 font-black uppercase tracking-tighter">{act.status}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-green-500">+{formatCurrency(act.profit)}</p>
                            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Profit</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <button
                  onClick={handleUpdateTrader}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20 text-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} /> Update Profile Statistics
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Selected Trader Details & Recent Trades Modal */}
      <AnimatePresence>
        {selectedTrader && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTrader(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                  {selectedTrader.avatar ? (
                    (selectedTrader.avatar.startsWith('http://') || selectedTrader.avatar.startsWith('https://') || selectedTrader.avatar.startsWith('/')) ? (
                      <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white flex items-center justify-center">
                        <img src={selectedTrader.avatar} alt={selectedTrader.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 font-black text-lg border border-blue-500/20">
                        {selectedTrader.avatar}
                      </div>
                    )
                  ) : (
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 font-black border border-blue-500/20">
                      {selectedTrader.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{selectedTrader.name}</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                      <Users size={10} /> {selectedTrader.followers + (getTraderFollowers(selectedTrader.id)?.length || 0)} Followers
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedTrader(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-1">Win Rate</p>
                    <p className="text-sm font-black text-green-500">{selectedTrader.winRate}%</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-1">Total Profit</p>
                    <p className="text-sm font-black text-blue-500 font-mono">{formatCurrency(selectedTrader.totalProfit)}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-wider mb-1">Min investment</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white font-mono">{formatCurrency(selectedTrader.minInvestment)}</p>
                  </div>
                </div>

                {/* Strategy details */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trading Methodology</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic bg-slate-50 dark:bg-slate-800/20 p-3 rounded-2xl border border-slate-100 dark:border-slate-850">
                    {selectedTrader.description || "Consistent high-probability trading setups tailored to volatile macro conditions."}
                  </p>
                </div>

                {/* Recent Trading History */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Executed Trades</h4>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {!(traderActivity[selectedTrader.id] || []).length ? (
                      <p className="text-[10px] text-slate-400 italic py-4 text-center">No trades found for this master trader.</p>
                    ) : (
                      (traderActivity[selectedTrader.id] || []).map((act: any) => (
                        <div key={act.id} className="flex items-center justify-between p-2.5 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800/50">
                          <div className="flex items-center gap-2.5">
                            <span className={cn(
                              "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider",
                              act.type === 'BUY' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                            )}>
                              {act.type}
                            </span>
                            <div>
                              <p className="text-[11px] font-bold text-slate-900 dark:text-white">{act.pair}</p>
                              <p className="text-[7px] text-slate-400 font-bold">{act.time}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-black text-green-500">+{formatCurrency(parseFloat(act.profit))}</p>
                            <span className="text-[7px] text-slate-450 uppercase font-black">WIN</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-3">
                {selectedTrader.createdBy === user?.id ? (
                  <button
                    onClick={() => {
                      setSelectedTrader(null);
                      setTraderToEdit(selectedTrader);
                      setManageTab('stats');
                      setIsEditModalOpen(true);
                    }}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all text-xs flex items-center justify-center gap-2"
                  >
                    <Users size={16} /> Manage Master Profile
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (user?.copyingTraderId === selectedTrader.id) {
                        stopCopying();
                        setAlertConfig({
                          isOpen: true,
                          title: 'Stopped Copying',
                          message: `You have successfully unfollowed and stopped copying ${selectedTrader.name}.`,
                          type: 'info'
                        });
                        setSelectedTrader(null);
                      } else {
                        setSelectedTrader(null);
                        handleCopyClick(selectedTrader);
                      }
                    }}
                    className={cn(
                      "w-full py-3.5 rounded-2xl font-bold transition-all text-xs flex items-center justify-center gap-2 text-white shadow-lg",
                      user?.copyingTraderId === selectedTrader.id
                        ? "bg-red-650 hover:bg-red-700 shadow-red-600/10 bg-red-600"
                        : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10"
                    )}
                  >
                    {user?.copyingTraderId === selectedTrader.id ? <X size={16} /> : <Lock size={16} />}
                    {user?.copyingTraderId === selectedTrader.id ? 'Unfollow & Stop Copying' : 'Copy Master Strategy'}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />
    </div>
  );
}
