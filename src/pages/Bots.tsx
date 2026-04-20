import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bot, 
  Zap, 
  TrendingUp, 
  Activity, 
  Settings2, 
  Play, 
  Square, 
  ChevronRight,
  Cpu,
  BarChart3,
  History,
  AlertCircle,
  Coins,
  Clock,
  Upload,
  Plus,
  Shield,
  Target,
  X,
  Info
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { cn } from '../lib/utils';
import { CRYPTO_LIST } from '../types';
import AlertModal from '../components/AlertModal';

interface BotConfig {
  id: string;
  name: string;
  description: string;
  type: 'scalping' | 'trend' | 'ai';
  winRate: string;
  risk: 'Low' | 'Medium' | 'High';
  minDeposit: number;
}

const BOTS: BotConfig[] = [
  {
    id: 'scalping',
    name: 'Scalper Pro v4.2',
    description: 'High-frequency trading bot that captures small price movements with extreme precision.',
    type: 'scalping',
    winRate: '88.4%',
    risk: 'Medium',
    minDeposit: 10
  },
  {
    id: 'trend',
    name: 'TrendMaster AI',
    description: 'Follows long-term market trends using advanced momentum indicators and volume analysis.',
    type: 'trend',
    winRate: '76.2%',
    risk: 'Low',
    minDeposit: 10
  },
  {
    id: 'ai',
    name: 'Neural Quantum Bot',
    description: 'Deep learning model that predicts market reversals using sentiment analysis and order book flow.',
    type: 'ai',
    winRate: '92.1%',
    risk: 'High',
    minDeposit: 10
  }
];

export default function Bots() {
  const { user, toggleBot, addBotProfit, addTrade, importBot } = useStore();
  const [selectedBot, setSelectedBot] = useState<BotConfig>(BOTS[0]);
  const [botSettings, setBotSettings] = useState<Record<string, { coin: string, timeframe: string }>>({
    scalping: { coin: 'BTC', timeframe: '1M' },
    trend: { coin: 'ETH', timeframe: '1H' },
    ai: { coin: 'SOL', timeframe: '15M' },
    custom: { coin: 'BTC', timeframe: '1M' }
  });
  
  const logs = user?.botLogs || [];
  const stats = user?.botStats || {
    scalping: { profit: 0, trades: 0 },
    trend: { profit: 0, trades: 0 },
    ai: { profit: 0, trades: 0 },
    custom: { profit: 0, trades: 0 }
  };
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'error' | 'success' | 'info' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });
  const [newBotConfig, setNewBotConfig] = useState({
    name: '',
    strategy: 'Scalping',
    risk: 'Medium',
    runtime: '24h'
  });

  useEffect(() => {
    const handleTradeClosed = (e: any) => {
      const { title, message, type } = e.detail;
      setAlertConfig({
        isOpen: true,
        title,
        message,
        type
      });
    };

    window.addEventListener('trade-closed', handleTradeClosed);
    return () => window.removeEventListener('trade-closed', handleTradeClosed);
  }, []);

  const activeBotsKey = JSON.stringify(Object.entries(user?.bots || {}).filter(([_, active]) => active).map(([id]) => id).sort());

  useEffect(() => {
    const activeBots = Object.entries(user?.bots || {}).filter(([_, active]) => active);
    if (activeBots.length === 0) return;

    const interval = setInterval(async () => {
      const botsToSimulate = Object.entries(user?.bots || {}).filter(([_, active]) => active);
      if (botsToSimulate.length > 0) {
        const [botId] = botsToSimulate[Math.floor(Math.random() * botsToSimulate.length)];
        let botName = '';
        let coin = 'BTC';
        let baseAmount = 0;

        if (botId === 'custom' && user?.customBotConfig) {
          botName = user.customBotConfig.name;
          coin = user.customBotConfig.currency || 'BTC';
          
          // Scale profit based on risk level
          const risk = user.customBotConfig.risk || 'Medium';
          const riskMultiplier = 
            risk === 'Low' ? 0.5 :
            risk === 'High' ? 2.0 :
            risk === 'Aggressive' ? 5.0 : 1.0;
          
          baseAmount = (1 + Math.random() * 4) * riskMultiplier;
        } else {
          const bot = BOTS.find(b => b.id === botId);
          if (!bot) return;
          botName = bot.name;
          coin = botSettings[botId].coin;
          baseAmount = (1 + Math.random() * 4);
        }

        // Apply win rate logic here so logs match balance
        const isDemo = user?.activeAccount === 'DEMO';
        const isMarketer = user?.role === 'marketer';
        const isAdmin = user?.role === 'admin';
        
        let winChance = 0.5;
        if (isDemo) {
          winChance = 0.95; // Guaranteed high win rate for demo
        } else if (isMarketer || isAdmin) {
          winChance = 0.95; // High win rate for markers/admins
        } else {
          winChance = 0.035; // 3.5% for normal users
        }
        
        const isWin = Math.random() < winChance;
        const profitVal = isWin ? Math.abs(baseAmount) : -Math.abs(baseAmount);
        const profitStr = profitVal.toFixed(2);
        
        const newLog = `[${new Date().toLocaleTimeString()}] ${botName} executed ${Math.random() > 0.5 ? 'BUY' : 'SELL'} on ${coin}: ${parseFloat(profitStr) >= 0 ? '+' : ''}${profitStr} USDT`;

        // Update user balance and global stats/logs
        await addBotProfit(parseFloat(profitStr), botId, newLog);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [user?.id, user?.activeAccount, user?.role, activeBotsKey, botSettings, addBotProfit]);

  const handleToggle = (botId: string) => {
    const bot = botId === 'custom' && user?.customBotConfig 
      ? { id: 'custom', name: user.customBotConfig.name, minDeposit: 10, type: 'ai' as const }
      : BOTS.find(b => b.id === botId);
      
    if (!bot) return;
    
    const balance = user?.activeAccount === 'REAL' ? user?.realBalance : user?.demoBalance;
    if (!user?.bots[botId as keyof typeof user.bots] && balance < bot.minDeposit) {
      const isAI = bot.type === 'ai' || botId === 'custom';
      setAlertConfig({
        isOpen: true,
        title: isAI ? 'AI Bot Limit' : 'Manual Bot Limit',
        message: isAI 
          ? `Neural processing requires a minimum of $${bot.minDeposit}. Your current balance is below this limit.`
          : `This manual bot requires at least $${bot.minDeposit} to operate. Please increase your balance.`,
        type: 'warning'
      });
      return;
    }
    
    const isActivating = !user?.bots[botId as keyof typeof user.bots];
    toggleBot(botId as any);

    setAlertConfig({
      isOpen: true,
      title: isActivating ? 'Bot Activated' : 'Bot Stopped',
      message: isActivating 
        ? `${bot.name} is now online and processing market data.` 
        : `${bot.name} has been safely shut down.`,
      type: isActivating ? 'success' : 'info'
    });
  };

  const [importConfig, setImportConfig] = useState({
    name: '',
    currency: 'BTC',
    risk: 'Medium'
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        setImportJson(content);
        const config = JSON.parse(content);
        
        if (!config.name || !config.strategy) {
          throw new Error('Invalid bot configuration format. Missing name or strategy.');
        }

        await importBot({
          name: importConfig.name || config.name,
          strategy: config.strategy,
          risk: config.risk || importConfig.risk,
          currency: config.currency || importConfig.currency
        });

        setAlertConfig({
          isOpen: true,
          title: 'Bot Imported',
          message: 'The bot configuration has been successfully imported and integrated into your library for the next 24 hours.',
          type: 'success'
        });
        setIsImportModalOpen(false);
      } catch (err: any) {
        setAlertConfig({
          isOpen: true,
          title: 'Import Failed',
          message: err.message || 'Failed to parse bot configuration file.',
          type: 'error'
        });
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const getTimeRemaining = (expiresAt: number) => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return 'Expired';
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m remaining`;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Neural Processing Units</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-mono uppercase tracking-widest">Automated Execution & Algorithmic Trading</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 rounded-lg font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-800 text-xs sm:text-sm shadow-sm"
          >
            <Upload size={16} /> <span className="hidden sm:inline">Import Bot</span><span className="sm:hidden">Import</span>
          </button>
          {!user?.customBotConfig && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-600/10 text-xs sm:text-sm"
            >
              <Plus size={16} /> <span className="hidden sm:inline">Initialize Bot</span><span className="sm:hidden">Create</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
      {/* Bot Selection & Config */}
      <div className="lg:col-span-8 space-y-6 lg:space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {BOTS.map((bot) => {
            const isActive = user?.bots[bot.id as keyof typeof user.bots];
            return (
              <button
                key={bot.id}
                onClick={() => setSelectedBot(bot)}
                className={cn(
                  "relative p-5 rounded-xl border transition-all text-left group overflow-hidden",
                  selectedBot.id === bot.id 
                    ? "bg-slate-900 border-blue-500 shadow-xl shadow-blue-500/10" 
                    : "bg-white dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shadow-sm",
                    isActive ? "bg-green-500 text-white shadow-green-500/20 shadow-lg" : "bg-slate-800 text-slate-400"
                  )}>
                    <Cpu size={20} />
                  </div>
                  <div className={cn(
                    "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border",
                    isActive ? "bg-green-500/10 border-green-500/20 text-green-500" : "bg-slate-500/5 border-slate-500/20 text-slate-500"
                  )}>
                    {isActive ? 'Online' : 'Standby'}
                  </div>
                </div>
                
                <h3 className={cn(
                  "text-sm font-bold mb-1",
                  selectedBot.id === bot.id ? "text-white" : "text-slate-900 dark:text-slate-200"
                )}>{bot.name}</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 leading-relaxed font-mono">{bot.description}</p>
                
                <div className="flex items-center gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">Win Rate</p>
                    <p className="text-xs font-bold text-green-500 font-mono">{bot.winRate}</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">Risk Profile</p>
                    <p className={cn(
                      "text-xs font-bold font-mono",
                      bot.risk === 'Low' ? "text-blue-500" : bot.risk === 'Medium' ? "text-yellow-500" : "text-red-500"
                    )}>{bot.risk}</p>
                  </div>
                </div>
              </button>
            );
          })}
          {user?.customBotConfig && (
            <button
              onClick={() => setSelectedBot({
                id: 'custom',
                name: user.customBotConfig!.name,
                description: `Custom imported bot using ${user.customBotConfig!.strategy} strategy.`,
                type: 'ai',
                winRate: 'Custom',
                risk: user.customBotConfig!.risk as any,
                minDeposit: 10
              })}
              className={cn(
                "relative p-5 rounded-xl border transition-all text-left group overflow-hidden",
                selectedBot.id === 'custom' 
                  ? "bg-slate-900 border-blue-500 shadow-xl shadow-blue-500/10" 
                  : "bg-white dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shadow-sm",
                  user.bots.custom ? "bg-blue-500 text-white shadow-blue-500/20 shadow-lg" : "bg-slate-800 text-slate-400"
                )}>
                  <Zap size={20} />
                </div>
                <div className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border bg-blue-500/10 border-blue-500/20 text-blue-500">
                  Custom
                </div>
              </div>
              
              <h3 className={cn(
                "text-sm font-bold mb-1",
                selectedBot.id === 'custom' ? "text-white" : "text-slate-900 dark:text-slate-200"
              )}>{user.customBotConfig.name}</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 leading-relaxed font-mono">
                Custom Neural Strategy Active
              </p>
              
              <div className="flex items-center gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">Currency</p>
                  <p className="text-xs font-bold text-blue-500 font-mono">{user.customBotConfig.currency}</p>
                </div>
                <div>
                  <p className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">Risk</p>
                  <p className="text-xs font-bold text-yellow-500 font-mono">{user.customBotConfig.risk}</p>
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Selected Bot Detailed Config */}
        <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm dark:shadow-none">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/10">
                <Bot size={28} />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{selectedBot.name}</h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  Quantum Neural Processing <ChevronRight size={12} /> 
                  <span className="text-blue-500 font-bold">v4.2.0-stable</span>
                </p>
              </div>
            </div>
            
            <button
              onClick={() => handleToggle(selectedBot.id)}
              className={cn(
                "w-full sm:w-auto px-6 py-3 sm:px-8 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-white transition-all shadow-sm flex items-center justify-center gap-3",
                user?.bots[selectedBot.id as keyof typeof user.bots]
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-500 hover:bg-green-600"
              )}
            >
              {user?.bots[selectedBot.id as keyof typeof user.bots] ? (
                <><Square size={18} fill="currentColor" /> Stop Bot</>
              ) : (
                <><Play size={18} fill="currentColor" /> Start Bot</>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <h4 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-slate-500">
                <Settings2 size={16} /> Configuration
              </h4>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 flex items-center gap-2">
                    <Coins size={14} /> Trading Pair
                  </label>
                    <select 
                      value={botSettings[selectedBot.id].coin}
                      onChange={(e) => setBotSettings(prev => ({
                        ...prev,
                        [selectedBot.id]: { ...prev[selectedBot.id], coin: e.target.value }
                      }))}
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:outline-none focus:border-blue-500 transition-colors text-slate-900 dark:text-white"
                    >
                      {CRYPTO_LIST.map(c => (
                        <option key={c.symbol} value={c.symbol} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                          {c.name} ({c.symbol}/USDT)
                        </option>
                      ))}
                    </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 flex items-center gap-2">
                    <Clock size={14} /> Analysis Timeframe
                  </label>
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    {['1S', '1M', '15M', '1H', '4H', '1D'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setBotSettings(prev => ({
                          ...prev,
                          [selectedBot.id]: { ...prev[selectedBot.id], timeframe: t }
                        }))}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-[10px] font-bold transition-all",
                          botSettings[selectedBot.id].timeframe === t 
                            ? "bg-white dark:bg-slate-700 shadow-sm text-blue-500" 
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex gap-4">
                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Bot will operate using your <span className="text-blue-500 font-bold">{user?.activeAccount}</span> account balance. 
                  Ensure you have at least <span className="font-bold">${selectedBot.minDeposit}</span> available.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <h4 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-slate-500">
                <BarChart3 size={16} /> Performance Metrics
              </h4>
              
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Total Profit', value: `${stats[selectedBot.id].profit >= 0 ? '+' : ''}$${stats[selectedBot.id].profit.toFixed(2)}`, color: stats[selectedBot.id].profit >= 0 ? 'text-green-500' : 'text-red-500' },
                  { label: 'Total Trades', value: stats[selectedBot.id].trades.toString(), color: 'text-blue-500' },
                  { label: 'Avg. Profit', value: stats[selectedBot.id].trades > 0 ? `${(stats[selectedBot.id].profit / stats[selectedBot.id].trades).toFixed(2)}%` : '0.00%', color: 'text-slate-900 dark:text-white' },
                  { label: 'Max Drawdown', value: '1.2%', color: 'text-red-500' }
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">{stat.label}</p>
                    <p className={cn("text-lg font-bold", stat.color)}>{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="h-32 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-end gap-1">
                {[...Array(20)].map((_, i) => (
                  <div 
                    key={i} 
                    className="flex-1 bg-blue-500/20 rounded-t-sm"
                    style={{ height: `${20 + Math.random() * 80}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Activity Log */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm h-full flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold flex items-center gap-2">
              <History size={18} className="text-blue-500" /> Live Activity
            </h3>
            <p className="text-[9px] text-slate-400 font-medium italic">Live Bot Activity</p>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Live</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1 max-h-[400px] lg:max-h-none">
            <AnimatePresence initial={false}>
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-8">
                  <Activity size={32} className="mb-4 opacity-20" />
                  <p className="text-xs">Waiting for bot activity...</p>
                </div>
              ) : (
                logs.map((log, i) => (
                  <motion.div
                    key={log + i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-2.5 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800 text-[9px] font-mono leading-relaxed"
                  >
                    <span className={cn(
                      log.includes('+') ? "text-green-500" : log.includes('-') ? "text-red-500" : "text-blue-500"
                    )}>
                      {log}
                    </span>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      </div>

      {/* Create Bot Modal */}
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
                  <h3 className="text-2xl font-bold">Create Custom Bot</h3>
                  <button onClick={() => setIsCreateModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bot Name</label>
                    <input
                      type="text"
                      placeholder="e.g. My Alpha Bot"
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={newBotConfig.name}
                      onChange={(e) => setNewBotConfig({ ...newBotConfig, name: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Strategy</label>
                      <select 
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        value={newBotConfig.strategy}
                        onChange={(e) => setNewBotConfig({ ...newBotConfig, strategy: e.target.value })}
                      >
                        <option>Scalping</option>
                        <option>Trend Following</option>
                        <option>Mean Reversion</option>
                        <option>Grid Trading</option>
                        <option>Arbitrage</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Risk Level</label>
                      <select 
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        value={newBotConfig.risk}
                        onChange={(e) => setNewBotConfig({ ...newBotConfig, risk: e.target.value })}
                      >
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                        <option>Aggressive</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Run Time</label>
                    <div className="grid grid-cols-4 gap-2">
                      {['1h', '4h', '24h', 'Unlimited'].map(t => (
                        <button
                          key={t}
                          onClick={() => setNewBotConfig({ ...newBotConfig, runtime: t })}
                          className={cn(
                            "py-2 rounded-lg text-[10px] font-bold transition-all border",
                            newBotConfig.runtime === t 
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20" 
                              : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex gap-4">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                      <Shield size={20} />
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Custom bots use advanced Neural Processing to execute trades. 
                      Ensure your strategy is backtested before running on a REAL account.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setAlertConfig({
                        isOpen: true,
                        title: 'Bot Initialized',
                        message: 'Your custom bot has been successfully initialized and added to your processing units.',
                        type: 'success'
                      });
                      setIsCreateModalOpen(false);
                    }}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    <Target size={18} /> Deploy Bot
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Bot Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold">Import Bot Configuration</h3>
                  <button onClick={() => setIsImportModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bot Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. ALPHABOT"
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={importConfig.name}
                      onChange={(e) => setImportConfig({ ...importConfig, name: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trading Currency</label>
                      <select 
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        value={importConfig.currency}
                        onChange={(e) => setImportConfig({ ...importConfig, currency: e.target.value })}
                      >
                        {CRYPTO_LIST.map(c => (
                          <option key={c.symbol} value={c.symbol}>{c.symbol} ({c.name})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Risk Level</label>
                      <select 
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        value={importConfig.risk}
                        onChange={(e) => setImportConfig({ ...importConfig, risk: e.target.value })}
                      >
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                        <option>Aggressive</option>
                      </select>
                    </div>
                  </div>

                  <div 
                    className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-12 flex flex-col items-center justify-center text-center group hover:border-blue-500 transition-colors cursor-pointer relative"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept=".json"
                      onChange={handleFileUpload}
                    />
                    <div className={cn(
                      "w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mb-4 group-hover:scale-110 transition-transform",
                      isUploading && "animate-bounce"
                    )}>
                      <Upload size={32} />
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                      {isUploading ? 'Processing...' : 'Upload JSON File'}
                    </p>
                    <p className="text-xs text-slate-500">Drag and drop or click to browse</p>
                  </div>

                  <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex gap-4">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                      <Info size={20} />
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Select your preferred settings above, then upload your bot's JSON configuration file to initialize.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Alert Modal */}
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
