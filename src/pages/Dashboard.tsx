import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight,
  Clock,
  Zap,
  PieChart as PieIcon,
  BarChart3,
  History as HistoryIcon,
  Wallet,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatCurrency, cn } from '../lib/utils';
import { CRYPTO_LIST } from '../types';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid 
} from 'recharts';

export default function Dashboard() {
  const { user, resetDemoBalance } = useStore();
  const navigate = useNavigate();
  const [marketActivity, setMarketActivity] = useState<{
    coin: string, 
    type: string, 
    amount: string, 
    time: string, 
    accountId: string, 
    status: 'WON' | 'LOST'
  }[]>([]);

  const [marketShareData] = useState([
    { name: 'BTC', value: 45, color: '#3b82f6' },
    { name: 'ETH', value: 25, color: '#6366f1' },
    { name: 'SOL', value: 15, color: '#14b8a6' },
    { name: 'Other', value: 15, color: '#94a3b8' },
  ]);

  const [volumeData] = useState([
    { name: 'BTC', volume: 12500 },
    { name: 'ETH', volume: 8400 },
    { name: 'SOL', volume: 5200 },
    { name: 'BNB', volume: 3100 },
    { name: 'XRP', volume: 2800 },
  ]);

  useEffect(() => {
    const generateActivity = () => {
      const coin = CRYPTO_LIST[Math.floor(Math.random() * CRYPTO_LIST.length)].symbol;
      const type = Math.random() > 0.5 ? 'BUY' : 'SELL';
      const amount = (Math.random() * 2).toFixed(4);
      const time = new Date().toLocaleTimeString();
      const accountId = `ACC-${Math.floor(1000 + Math.random() * 9000)}`;
      const status = Math.random() > 0.4 ? 'WON' : 'LOST';
      
      setMarketActivity(prev => [{ coin, type, amount, time, accountId, status }, ...prev.slice(0, 5)]);
    };

    const interval = setInterval(generateActivity, 3000);
    return () => clearInterval(interval);
  }, []);

  const calculateProfitPercentage = () => {
    if (!user) return 0;
    const balance = user.activeAccount === 'REAL' ? user.realBalance : user.demoBalance;
    if (balance === 0) return 0;
    return ((user.profit || 0) / balance) * 100;
  };

  const profitPercentage = calculateProfitPercentage();

  const stats = [
    { 
      label: 'Total Balance', 
      value: formatCurrency(user?.activeAccount === 'REAL' ? (user?.realBalance || 0) : (user?.demoBalance || 0)), 
      icon: Wallet, 
      color: 'text-blue-500', 
      bg: 'bg-blue-500/10',
      trend: '+0.0%' // Placeholder for balance trend if needed
    },
    { 
      label: 'Daily Profit', 
      value: formatCurrency(user?.dailyProfit || 0), 
      icon: TrendingUp, 
      color: (user?.dailyProfit || 0) >= 0 ? 'text-green-500' : 'text-red-500', 
      bg: (user?.dailyProfit || 0) >= 0 ? 'bg-green-500/10' : 'bg-red-500/10',
      trend: 'Today'
    },
    { 
      label: 'Total Profit', 
      value: formatCurrency(user?.profit || 0), 
      icon: BarChart3, 
      color: (user?.profit || 0) >= 0 ? 'text-green-500' : 'text-red-500', 
      bg: (user?.profit || 0) >= 0 ? 'bg-green-500/10' : 'bg-red-500/10',
      trend: `${(user?.profit || 0) >= 0 ? '+' : ''}${profitPercentage.toFixed(1)}%`
    },
    { 
      label: 'Active Trades', 
      value: user?.trades?.filter(t => t.status === 'OPEN').length || 0, 
      icon: Activity, 
      color: 'text-indigo-500', 
      bg: 'bg-indigo-500/10',
      trend: 'Live'
    },
    { 
      label: 'Bot Status', 
      value: Object.values(user?.bots || {}).some(b => b) ? 'Active' : 'Inactive', 
      icon: Zap, 
      color: 'text-purple-500', 
      bg: 'bg-purple-500/10',
      trend: 'Auto'
    },
  ];

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight">Trading Dashboard</h1>
          <p className="text-sm text-slate-500 font-medium">Welcome, {user?.username}. Here's your real-time performance summary.</p>
        </div>
        <div className="flex items-center gap-3">
          {user?.activeAccount === 'DEMO' && (
            <button 
              onClick={resetDemoBalance}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2 text-xs border border-slate-200 dark:border-slate-700"
              title="Reset balance to $10,000"
            >
              <RotateCcw size={14} /> Reset Demo
            </button>
          )}
          <button 
            onClick={() => navigate('/trade')}
            className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center gap-2 text-sm"
          >
            Start Trading <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm relative overflow-hidden group"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className={cn(stat.bg, "p-2.5 rounded-xl", stat.color)}>
                  <stat.icon size={20} />
                </div>
                <div className={cn(
                  "flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full",
                  stat.trend.startsWith('+') || stat.trend === 'Live' || stat.trend === 'Auto' 
                    ? "text-green-500 bg-green-500/10" 
                    : "text-red-500 bg-red-500/10"
                )}>
                  {stat.trend.startsWith('+') ? <ArrowUpRight size={12} /> : (stat.trend.startsWith('-') ? <ArrowDownRight size={12} /> : null)}
                  {stat.trend}
                </div>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</p>
              <h3 className="text-2xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Market Analysis (Pie & Bar) */}
        <div className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-8 rounded-3xl shadow-sm">
              <h3 className="text-sm font-display font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2 uppercase tracking-wide">
                <PieIcon size={16} className="text-primary" /> Market Distribution
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={marketShareData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {marketShareData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#161a1e', border: 'none', borderRadius: '12px', color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-6">
                {marketShareData.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-8 rounded-3xl shadow-sm">
              <h3 className="text-sm font-display font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2 uppercase tracking-wide">
                <BarChart3 size={16} className="text-primary" /> 24h Trading Volume
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#33415510" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
                    <YAxis hide />
                    <Tooltip 
                      cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                      contentStyle={{ backgroundColor: '#161a1e', border: 'none', borderRadius: '12px', color: '#fff' }}
                    />
                    <Bar dataKey="volume" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Trades Table */}
          <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900 dark:text-white uppercase tracking-wide">Recent Activity</h3>
              <button 
                onClick={() => navigate('/trades')}
                className="text-xs font-bold text-primary hover:underline"
              >
                View Analytics
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Asset</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">P/L (Profit/Loss)</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(user?.trades || [])
                    .sort((a, b) => {
                      const timeA = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
                      const timeB = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
                      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
                    })
                    .slice(0, 5)
                    .map((trade) => (
                    <tr key={trade.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center font-bold text-xs">
                            {trade.coin[0]}
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white text-sm">{trade.coin}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-bold",
                          trade.type === 'BUY' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-sm text-slate-900 dark:text-white tabular-nums">${trade.amount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "font-mono font-bold text-sm tabular-nums",
                          trade.profit >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {trade.profit >= 0 ? '+' : ''}{formatCurrency(trade.profit)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 text-[10px] font-bold">
                          {trade.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-8">
          {/* Live AI Feed */}
          <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-display font-bold text-slate-900 dark:text-white uppercase tracking-wide">Market Pulse</h3>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-green-500 uppercase tracking-widest">Live</span>
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
              </div>
            </div>
            <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl mb-6">
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium leading-relaxed">
                This feed displays real-time activity from all users across the platform. These are <span className="font-bold underline">not</span> your personal trades. Check your <span className="font-bold">Active Trades</span> in the Trading section.
              </p>
            </div>
            <div className="space-y-4">
              {marketActivity.map((activity, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activity.accountId}</span>
                    <span className={cn(
                      "text-[10px] font-bold",
                      activity.status === 'WON' ? "text-green-500" : "text-red-500"
                    )}>
                      {activity.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                        activity.type === 'BUY' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {activity.coin[0]}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{activity.coin}</p>
                        <p className="text-[10px] text-slate-500">{activity.type} • {activity.time}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-xs font-bold",
                        activity.status === 'WON' ? "text-green-500" : "text-red-500"
                      )}>
                        {activity.status === 'WON' ? '+' : '-'}{(Math.random() * 50).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* AI Bot Promo */}
          <div className="bg-primary p-8 rounded-3xl text-white shadow-xl shadow-primary/20 relative overflow-hidden group">
            <div className="relative z-10">
              <h3 className="text-xl font-display font-black mb-2 tracking-tight">AI Trading Bots</h3>
              <p className="text-white/80 text-xs font-medium mb-6">Automate your portfolio with institutional-grade neural strategies.</p>
              <button 
                onClick={() => navigate('/bots')}
                className="w-full py-3 bg-white text-primary font-bold rounded-xl hover:bg-slate-100 transition-all shadow-lg"
              >
                Explore Bots
              </button>
            </div>
            <Zap className="absolute -right-4 -top-4 w-24 h-24 text-white/10 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
          </div>

          {/* Notifications */}
          <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
            <h3 className="text-sm font-display font-bold text-slate-900 dark:text-white mb-6 uppercase tracking-wide">Recent Alerts</h3>
            <div className="space-y-4">
              {(user?.transactions || [])
                .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
                .slice(0, 3)
                .map((notif, i) => (
                <div key={i} className="flex gap-3">
                  <div className={cn(
                    "w-1 h-1 mt-2 rounded-full shrink-0",
                    notif.status === 'completed' ? "bg-green-500" : 
                    notif.status === 'pending' ? "bg-yellow-500 animate-pulse" : 
                    "bg-red-500"
                  )}></div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      {notif.type} {notif.status.toUpperCase()}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {notif.status === 'completed' 
                        ? `Your ${notif.type.toLowerCase()} of ${formatCurrency(notif.amount)} has been completed successfully.`
                        : notif.status === 'pending'
                        ? `Your ${notif.type.toLowerCase()} of ${formatCurrency(notif.amount)} is currently pending.`
                        : `Your ${notif.type.toLowerCase()} of ${formatCurrency(notif.amount)} was ${notif.status}.`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
