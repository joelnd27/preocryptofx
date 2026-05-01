import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Search, 
  Filter, 
  ArrowLeft,
  Calendar,
  TrendingUp,
  TrendingDown,
  Activity,
  History
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { formatCurrency, cn } from '../lib/utils';

export default function AllTrades() {
  const { user } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    // Handle both number timestamps and ISO strings
    const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
    if (isNaN(date.getTime())) {
      // Try parsing as number if it's a string number
      const num = Number(timestamp);
      if (!isNaN(num)) return new Date(num).toLocaleString();
      return 'Invalid Date';
    }
    return date.toLocaleString();
  };

  const filteredTrades = (user?.trades || [])
    .filter(t => {
      const matchesSearch = t.coin.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === 'ALL' || t.status === filter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const timeA = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
      const timeB = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    })
    .slice(0, 50);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-3xl font-bold">Trade History</h2>
            <p className="text-slate-500 dark:text-slate-400">View and manage all your trading activity</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search coin..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
            {(['ALL', 'OPEN', 'CLOSED'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "flex-1 px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  filter === f 
                    ? "bg-white dark:bg-slate-700 shadow-sm text-blue-500" 
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-[32px] overflow-hidden shadow-sm dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/30">
              <tr>
                <th className="px-6 py-4">Date & Time</th>
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Entry Price</th>
                <th className="px-6 py-4">Profit/Loss</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredTrades.map((trade, i) => (
                <motion.tr 
                  key={trade.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Calendar size={12} />
                      {formatDate(trade.timestamp)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center font-bold text-blue-500 text-xs">
                        {trade.coin[0]}
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white">{trade.coin}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-lg text-[10px] font-bold uppercase",
                      trade.type === 'BUY' ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                    )}>
                      {trade.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm">${trade.amount.toLocaleString()}</td>
                  <td className="px-6 py-4 font-mono text-sm text-slate-500">${trade.price.toLocaleString()}</td>
                  <td className="px-6 py-4 font-mono">
                    <div className={cn(
                      "flex items-center gap-1 font-bold",
                      trade.profit >= 0 ? "text-green-500" : "text-red-500"
                    )}>
                      {trade.profit >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {trade.profit >= 0 ? '+' : ''}{formatCurrency(trade.profit)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {trade.status === 'OPEN' ? (
                        <Activity size={14} className="text-blue-500 animate-pulse" />
                      ) : (
                        <History size={14} className="text-slate-400" />
                      )}
                      <span className={cn(
                        "text-[10px] font-bold uppercase",
                        trade.status === 'OPEN' ? "text-blue-500" : "text-slate-400"
                      )}>
                        {trade.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                      {trade.accountType}
                    </span>
                  </td>
                </motion.tr>
              ))}
              {filteredTrades.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <Activity size={48} className="mb-4 opacity-20" />
                      <p className="text-lg font-bold">No trades found</p>
                      <p className="text-sm">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
