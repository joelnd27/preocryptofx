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
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">Trading Dashboard</h1>
          <p className="text-[10px] text-slate-500 font-medium">Welcome, {user?.username}. Here's your performance summary.</p>
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
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-2.5 sm:p-4 rounded-xl shadow-sm relative overflow-hidden group hover:border-primary/50 transition-colors"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-1.5">
                <div className={cn(stat.bg, "p-1.5 rounded-lg", stat.color)}>
                  <stat.icon size={14} />
                </div>
                <div className={cn(
                  "flex items-center gap-0.5 font-bold text-[7px] sm:text-[9px] px-1.5 py-0.5 rounded-full",
                  stat.trend.startsWith('+') || stat.trend === 'Live' || stat.trend === 'Auto' || stat.trend === 'Today'
                    ? "text-green-500 bg-green-500/10" 
                    : "text-red-500 bg-red-500/10"
                )}>
                  {stat.trend.startsWith('+') ? <ArrowUpRight size={10} /> : (stat.trend.startsWith('-') ? <ArrowDownRight size={10} /> : null)}
                  {stat.trend}
                </div>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-[8px] sm:text-[9px] font-bold uppercase tracking-tight mb-0.5">{stat.label}</p>
              <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white tabular-nums leading-tight">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Market Analysis (Pie & Bar) */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-3.5 sm:p-6 rounded-2xl shadow-sm">
              <h3 className="text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 uppercase tracking-wide">
                <PieIcon size={14} className="text-primary" /> Market Dist.
              </h3>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={marketShareData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {marketShareData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#161a1e', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '9px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                {marketShareData.map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tight">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-3.5 sm:p-6 rounded-2xl shadow-sm">
              <h3 className="text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 uppercase tracking-wide">
                <BarChart3 size={14} className="text-primary" /> Trading Vol.
              </h3>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#33415510" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 8, fontWeight: 600 }} />
                    <YAxis hide />
                    <Tooltip 
                      cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                      contentStyle={{ backgroundColor: '#161a1e', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '9px' }}
                    />
                    <Bar dataKey="volume" fill="var(--color-primary)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Trades Table */}
          <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Activity</h3>
              <button 
                onClick={() => navigate('/trades')}
                className="text-[10px] font-bold text-primary hover:underline"
              >
                View All
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="px-3 py-2 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Asset</th>
                    <th className="px-3 py-2 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
                    <th className="px-3 py-2 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="px-3 py-2 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Result</th>
                    <th className="px-3 py-2 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
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
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center font-bold text-[9px]">
                            {trade.coin[0]}
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white text-[10px]">{trade.coin}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "px-1 py-0.5 rounded-[4px] text-[7px] font-bold",
                          trade.type === 'BUY' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-bold text-[10px] text-slate-900 dark:text-white tabular-nums">${trade.amount.toLocaleString()}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "font-bold text-[10px] tabular-nums",
                          trade.profit >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {trade.profit >= 0 ? '+' : ''}{formatCurrency(trade.profit)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[7px] font-bold">
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
        <div className="space-y-4 sm:space-y-6">
          {/* Live AI Feed */}
          <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-3.5 sm:p-5 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Market Pulse</h3>
              <div className="flex items-center gap-1.5">
                <span className="text-[7px] font-bold text-green-500 uppercase tracking-widest">Live</span>
                <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
              </div>
            </div>
            <div className="p-2 bg-blue-500/5 border border-blue-500/10 rounded-lg mb-3">
              <p className="text-[8px] text-blue-600 dark:text-blue-400 font-medium leading-normal">
                Real-time global trading feed.
              </p>
            </div>
            <div className="space-y-2">
              {marketActivity.map((activity, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-2 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-100 dark:border-slate-800/50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">{activity.accountId}</span>
                    <span className={cn(
                      "text-[7px] font-bold",
                      activity.status === 'WON' ? "text-green-500" : "text-red-500"
                    )}>
                      {activity.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                        "w-5 h-5 rounded-md flex items-center justify-center font-bold text-[8px]",
                        activity.type === 'BUY' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {activity.coin[0]}
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-900 dark:text-white leading-none">{activity.coin}</p>
                        <p className="text-[7px] text-slate-500 mt-0.5">{activity.type}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[9px] font-bold",
                      activity.status === 'WON' ? "text-green-500" : "text-red-500"
                    )}>
                      {activity.status === 'WON' ? '+' : '-'}{(Math.random() * 50).toFixed(2)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* AI Bot Promo */}
          <div className="bg-primary p-6 rounded-2xl text-white shadow-xl shadow-primary/20 relative overflow-hidden group">
            <div className="relative z-10">
              <h3 className="text-lg font-bold mb-1 tracking-tight">AI Trading Bots</h3>
              <p className="text-white/80 text-[10px] font-medium mb-4">Automate your portfolio strategies.</p>
              <button 
                onClick={() => navigate('/bots')}
                className="w-full py-2 bg-white text-primary text-[10px] font-bold rounded-lg hover:bg-slate-100 transition-all shadow-lg"
              >
                Explore Bots
              </button>
            </div>
            <Zap className="absolute -right-4 -top-4 w-20 h-20 text-white/10 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
          </div>

          {/* Notifications */}
          <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-sm">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-4">Recent Alerts</h3>
            <div className="space-y-3">
              {(user?.transactions || [])
                .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
                .slice(0, 3)
                .map((notif, i) => (
                <div key={i} className="flex gap-2">
                  <div className={cn(
                    "w-1 h-1 mt-1.5 rounded-full shrink-0",
                    notif.status === 'completed' ? "bg-green-500" : 
                    notif.status === 'pending' ? "bg-yellow-500 animate-pulse" : 
                    "bg-red-500"
                  )}></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      {notif.type} {notif.status.toUpperCase()}
                    </p>
                    <p className="text-[9px] text-slate-500 mt-0.5 leading-normal">
                      {notif.status === 'completed' 
                        ? `Your ${notif.type.toLowerCase()} of ${formatCurrency(notif.amount)} completed.`
                        : notif.status === 'pending'
                        ? `Your ${notif.type.toLowerCase()} of ${formatCurrency(notif.amount)} is pending.`
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
