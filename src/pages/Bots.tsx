import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  Users,
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
  Info,
  Save,
  Lock,
  Eye,
  EyeOff
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
  },
  {
    id: 'vortex',
    name: 'Vortex Momentum',
    description: 'Advanced momentum-based bot that executes trades at high speed during peak volatility.',
    type: 'scalping',
    winRate: '85.1%',
    risk: 'High',
    minDeposit: 10
  },
  {
    id: 'orbit',
    name: 'Orbit Swing Bot',
    description: 'Swing trading specialist that identifies key support and resistance levels for optimal entries.',
    type: 'trend',
    winRate: '82.5%',
    risk: 'Medium',
    minDeposit: 10
  },
  {
    id: 'starlight',
    name: 'Starlight AI',
    description: 'Sophisticated AI agent that combines multiple strategies for consistent daily returns.',
    type: 'ai',
    winRate: '94.3%',
    risk: 'Low',
    minDeposit: 10
  },
  {
    id: 'galaxy',
    name: 'Galaxy Arbi-Bot',
    description: 'Exploits price differences across multiple trading pairs with lightning-fast execution.',
    type: 'scalping',
    winRate: '89.8%',
    risk: 'Medium',
    minDeposit: 10
  },
  {
    id: 'nova',
    name: 'Nova Alpha v2',
    description: 'Aggressive trend-following bot designed for maximum yield in trending markets.',
    type: 'trend',
    winRate: '79.4%',
    risk: 'High',
    minDeposit: 10
  },
  {
    id: 'wizard1',
    name: 'Wizard bot 1',
    description: 'Elite algorithmic trader using complex mathematical patterns for consistent gains.',
    type: 'ai',
    winRate: '95.8%',
    risk: 'Medium',
    minDeposit: 10
  },
  {
    id: 'wizard2',
    name: 'Wizard bot 2',
    description: 'Advanced liquidity harvester that executes high-frequency trades with minimal slippage.',
    type: 'ai',
    winRate: '96.2%',
    risk: 'High',
    minDeposit: 10
  }
];

export default function Bots() {
  const { user, toggleBot, unlockBot, updateBotConfig, addBotProfit, addTrade, importBot } = useStore();
  const [selectedBot, setSelectedBot] = useState<BotConfig>(BOTS[0]);
  
  const [botSettings, setBotSettings] = useState<Record<string, { coin: string, timeframe: string, stake: number, targetProfit: number }>>(() => {
    const initial: Record<string, { coin: string, timeframe: string, stake: number, targetProfit: number }> = {};
    
    // Built-in bots
    BOTS.forEach(bot => {
      // Use persisted config if available
      const persisted = user?.botConfigs?.[bot.id];
      
      initial[bot.id] = { 
        coin: persisted?.coin || (bot.type === 'trend' ? 'ETH' : bot.type === 'ai' ? 'SOL' : 'BTC'), 
        timeframe: persisted?.timeframe || (bot.type === 'scalping' ? '1M' : '1H'),
        stake: persisted?.stake || 10,
        targetProfit: persisted?.targetProfit || user?.targetProfitPercentage || 0
      };
    });

    // Custom bots
    (user?.customBots || []).forEach(bot => {
      const persisted = user?.botConfigs?.[bot.id];

      initial[bot.id] = {
        coin: persisted?.coin || 'BTC',
        timeframe: persisted?.timeframe || '1H',
        stake: persisted?.stake || 10,
        targetProfit: persisted?.targetProfit || user?.targetProfitPercentage || 0
      };
    });

    return initial;
  });

  // Sync botSettings with user.botConfigs and customBots when user changes
  useEffect(() => {
    setBotSettings(prev => {
      const next = { ...prev };
      
      // Sync from botConfigs
      if (user?.botConfigs) {
        Object.entries(user.botConfigs || {}).forEach(([id, config]: [string, any]) => {
          if (config) {
            next[id] = {
              coin: config.coin || next[id]?.coin || 'BTC',
              timeframe: config.timeframe || next[id]?.timeframe || '1M',
              stake: config.stake || next[id]?.stake || 10,
              targetProfit: config.targetProfit || next[id]?.targetProfit || 0
            };
          }
        });
      }

      // Ensure all custom bots have settings
      if (user?.customBots) {
        user.customBots.forEach(bot => {
          if (!next[bot.id]) {
            next[bot.id] = {
              coin: 'BTC',
              timeframe: '1M',
              stake: 10,
              targetProfit: user.targetProfitPercentage || 0
            };
          }
        });
      }
      
      return next;
    });
  }, [user?.botConfigs, user?.customBots]);

  const allBots = [
    ...BOTS,
    ...(user?.customBots || []).map(cb => ({
      id: cb.id,
      name: cb.name,
      description: cb.description || `Custom neural bot using ${cb.strategy} strategy.`,
      type: 'ai' as const,
      winRate: 'Adaptive',
      risk: cb.risk as any,
      minDeposit: 10
    }))
  ];

  const isSelectedBotActive = selectedBot.id in (user?.bots || {}) 
    ? user?.bots[selectedBot.id as keyof typeof user.bots] 
    : (user?.activeCustomBotIds || []).includes(selectedBot.id);

  const logs = (user?.botLogs || []).filter(log => {
    if (typeof log === 'string') {
      return log.includes(selectedBot.name);
    }
    return log.botId === selectedBot.id;
  }).slice(0, 20);

  const stats = (() => {
    const s: Record<string, { profit: number, trades: number }> = {};
    allBots.forEach(bot => {
      s[bot.id] = { profit: 0, trades: 0, ...(user?.botStats?.[bot.id] || {}) };
    });
    return s;
  })();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [botPassword, setBotPassword] = useState('');
  const [pendingBotId, setPendingBotId] = useState<string | null>(null);
  const [importJson, setImportJson] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
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

  const handleClosePasswordModal = () => {
    setIsPasswordModalOpen(false);
    setBotPassword('');
    setShowPassword(false);
    setPendingBotId(null);
  };

  const handleUnlock = async (botId: string, password?: string) => {
    const bot = BOTS.find(b => b.id === botId) || (user?.customBots || []).find(b => b.id === botId);
    if (!bot) return;

    try {
      await unlockBot(botId, password);
      setAlertConfig({
        isOpen: true,
        title: 'Bot Unlocked',
        message: `${bot.name} is now available for configuration. Click "Run" to start trading.`,
        type: 'success'
      });
      handleClosePasswordModal();
    } catch (err: any) {
      if (err.message === 'PASSWORD_REQUIRED') {
        setPendingBotId(botId);
        setIsPasswordModalOpen(true);
      } else {
        setAlertConfig({
          isOpen: true,
          title: 'Unlock Failed',
          message: err.message,
          type: 'error'
        });
      }
    }
  };

  const handleToggle = async (botId: string) => {
    const bot = BOTS.find(b => b.id === botId) || (user?.customBots || []).find(b => b.id === botId);
      
    if (!bot) return;
    
    const balance = user?.activeAccount === 'REAL' ? user?.realBalance : user?.demoBalance;
    const isBotActive = botId in (user?.bots || {}) 
      ? user?.bots[botId as keyof typeof user.bots] 
      : (user?.activeCustomBotIds || []).includes(botId);

    const isWizard = botId === 'wizard1' || botId === 'wizard2';
    
    // Block Demo for Wizard Bots
    if (!isBotActive && isWizard && user?.activeAccount === 'DEMO') {
      setAlertConfig({
        isOpen: true,
        title: 'Real Account Required',
        message: 'Wizard bots are premium high-yield algorithms and can only be operated on REAL accounts.',
        type: 'error'
      });
      return;
    }

    const currentStake = botSettings[botId]?.stake || 10;

    if (!isBotActive && currentStake > 50000) {
      setAlertConfig({
        isOpen: true,
        title: 'Stake Limit Exceeded',
        message: `The maximum allowed stake for any bot is $50,000. Please reduce your stake and try again.`,
        type: 'error'
      });
      return;
    }

    if (!isBotActive && balance < currentStake) {
      setAlertConfig({
        isOpen: true,
        title: 'Insufficient Balance',
        message: `Your account balance ($${balance.toFixed(2)}) is less than the requested stake ($${currentStake.toFixed(2)}). Please increase your balance or reduce the stake amount to start the bot.`,
        type: 'error'
      });
      return;
    }
    
    try {
      await toggleBot(botId as any);
      
      const isActivating = !isBotActive;
      setAlertConfig({
        isOpen: true,
        title: isActivating ? 'Bot Activated' : 'Bot Stopped',
        message: isActivating 
          ? `${bot.name} is now online and processing market data.` 
          : `${bot.name} has been safely shut down.`,
        type: isActivating ? 'success' : 'info'
      });
      handleClosePasswordModal();
    } catch (err: any) {
      setAlertConfig({
        isOpen: true,
        title: 'Activation Failed',
        message: err.message,
        type: 'error'
      });
    }
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

        const newBot = await importBot({
          name: importConfig.name || config.name,
          strategy: config.strategy,
          risk: config.risk || importConfig.risk,
          currency: config.currency || importConfig.currency
        });

        if (newBot) {
          // Automatically select the newly imported bot
          setSelectedBot({
            id: newBot.id,
            name: newBot.name,
            description: `Custom neural bot using ${newBot.strategy} strategy.`,
            type: 'ai',
            winRate: 'Adaptive',
            risk: newBot.risk as any,
            minDeposit: 10
          });
        }

        setAlertConfig({
          isOpen: true,
          title: 'Bot Imported',
          message: 'The bot configuration has been successfully imported and integrated into your library.',
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

  const currentSettings = botSettings[selectedBot.id] || {
    coin: 'BTC',
    timeframe: '1H',
    stake: 10,
    targetProfit: 0
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">Trading Bots</h2>
          <p className="text-[9px] text-slate-500 dark:text-slate-400">Automated Execution & Algorithmic Trading</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 rounded-lg font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-800 text-[10px] sm:text-xs shadow-sm"
          >
            <Upload size={14} /> <span className="hidden sm:inline">Import Bot</span><span className="sm:hidden">Import</span>
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-600/10 text-[10px] sm:text-xs"
          >
            <Plus size={14} /> <span className="hidden sm:inline">Create</span><span className="sm:hidden">Create</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Bot Selection & Config */}
      <div className="lg:col-span-8 space-y-5">
        <div className={cn(
          "grid gap-2.5 sm:gap-3",
          allBots.length > 3 ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-3"
        )}>
          {allBots.map((bot) => {
            const isActive = user?.bots[bot.id as keyof typeof user.bots];
            const isCustom = bot.id.startsWith('custom-');
            const isWizard = bot.id === 'wizard1' || bot.id === 'wizard2';
            const isUnlocked = (user?.unlockedBotIds || []).includes(bot.id) || user?.role === 'marketer' || user?.role === 'admin';
            const isLocked = isWizard && !isUnlocked;

            return (
              <div
                key={bot.id}
                onClick={() => setSelectedBot(bot)}
                className={cn(
                  "relative p-3.5 sm:p-4 rounded-xl border transition-all text-left group overflow-hidden cursor-pointer",
                  selectedBot.id === bot.id 
                    ? "bg-slate-900 border-blue-500 shadow-xl shadow-blue-500/10" 
                    : "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                )}
              >
                {isCustom && (
                  <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-blue-600 text-white text-[6px] font-bold uppercase tracking-wider rounded-bl-lg">
                    Custom
                  </div>
                )}
                <div className="flex items-center justify-between mb-2">
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shadow-sm",
                    isActive ? "bg-green-500 text-white shadow-green-500/20 shadow-lg" : "bg-slate-800 text-slate-400"
                  )}>
                    {isLocked ? <Lock size={14} className="text-yellow-500" /> : (isCustom ? <Zap size={14} /> : <Cpu size={14} />)}
                  </div>
                  <div className={cn(
                    "px-1.5 py-0.5 rounded-full text-[6px] sm:text-[7px] font-bold uppercase tracking-widest border",
                    isActive ? "bg-green-500/10 border-green-500/20 text-green-500" : (isLocked ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-500" : "bg-slate-500/5 border-slate-500/20 text-slate-500")
                  )}>
                    {isActive ? 'Online' : (isLocked ? 'Locked' : 'Standby')}
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 mb-0.5">
                  <h3 className={cn(
                    "text-[11px] sm:text-xs font-bold",
                    selectedBot.id === bot.id ? "text-white" : "text-slate-900 dark:text-white"
                  )}>{bot.name}</h3>
                  {isLocked && <Lock size={10} className="text-yellow-500" />}
                </div>
                <p className="text-[8px] sm:text-[9px] text-slate-500 dark:text-slate-400 mb-2 line-clamp-1 font-mono tracking-tight">{bot.description}</p>
                
                <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 mb-3">
                  <div>
                    <p className="text-[7px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">{isCustom ? 'Currency' : 'Win Rate'}</p>
                    <p className={cn(
                      "text-xs font-black font-mono leading-none",
                      isCustom ? "text-blue-500" : "text-green-500"
                    )}>
                      {isCustom ? ((user?.customBots || []).find(b => b.id === bot.id)?.currency || 'BTC') : bot.winRate}
                    </p>
                  </div>
                  <div>
                    <p className="text-[6px] text-slate-500 uppercase font-bold tracking-tighter">Risk</p>
                    <p className={cn(
                      "text-[9px] font-bold font-mono leading-none",
                      bot.risk === 'Low' ? "text-blue-500" : bot.risk === 'Medium' ? "text-yellow-500" : "text-red-500"
                    )}>{bot.risk}</p>
                  </div>
                </div>

                {isLocked ? (
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnlock(bot.id);
                      }}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/20 transition-all"
                    >
                      <Lock size={10} /> Unlock
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBot(bot);
                        setIsHistoryModalOpen(true);
                      }}
                      className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                    >
                      View
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBot(bot);
                        const detailSection = document.getElementById('bot-detail-view');
                        if (detailSection) {
                          detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all",
                        isActive ? "bg-red-500 text-white" : "bg-green-500 text-white"
                      )}
                    >
                      {isActive ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                      {isActive ? 'Stop' : 'Run'}
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBot(bot);
                        setIsHistoryModalOpen(true);
                      }}
                      className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                    >
                      Details
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div id="bot-detail-view" className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-none">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-600/10",
                selectedBot.id === 'custom' ? "bg-blue-600" : "bg-blue-600"
              )}>
                {selectedBot.id === 'custom' ? <Zap size={18} /> : <Bot size={18} />}
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">{selectedBot.name}</h2>
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 uppercase tracking-widest font-black">
                  {selectedBot.id === 'custom' ? 'User Custom' : 'Institutional'} <ChevronRight size={8} /> 
                  <span className="text-blue-500">{selectedBot.id === 'custom' ? 'NEURAL ENGINE' : 'v4.2 PRO'}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(() => {
                const isWizard = selectedBot.id === 'wizard1' || selectedBot.id === 'wizard2';
                const isUnlocked = (user?.unlockedBotIds || []).includes(selectedBot.id) || user?.role === 'marketer' || user?.role === 'admin';
                const isLocked = isWizard && !isUnlocked;
                const isActive = selectedBot.id in (user?.bots || {}) 
                  ? user?.bots[selectedBot.id as keyof typeof user.bots] 
                  : (user?.activeCustomBotIds || []).includes(selectedBot.id);

                if (isLocked) {
                  return (
                    <button
                      onClick={() => handleUnlock(selectedBot.id)}
                      className="w-full sm:w-auto px-5 py-2 rounded-xl font-bold text-white transition-all shadow-sm flex items-center justify-center gap-2 text-[10px] uppercase tracking-wider bg-blue-600 hover:bg-blue-700 shadow-blue-600/20"
                    >
                      <Lock size={12} /> Unlock {selectedBot.id.startsWith('custom-') ? 'Bot' : 'Pro'}
                    </button>
                  );
                }

                return (
                  <button
                    onClick={() => handleToggle(selectedBot.id)}
                    className={cn(
                      "w-full sm:w-auto px-5 py-2 rounded-xl font-bold text-white transition-all shadow-sm flex items-center justify-center gap-2 text-[10px] uppercase tracking-wider",
                      isActive
                        ? "bg-red-500/90 hover:bg-red-600"
                        : "bg-green-500 hover:bg-green-600"
                    )}
                  >
                    {isActive ? (
                      <><Square size={12} fill="currentColor" /> Deactivate</>
                    ) : (
                      <><Play size={12} fill="currentColor" /> Run {selectedBot.id.startsWith('custom-') ? 'Bot' : 'Pro'}</>
                    )}
                  </button>
                );
              })()}
              
              <button
                onClick={() => {
                  const botList = document.querySelector('.grid.gap-2\\.5');
                  if (botList) {
                    botList.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                  // Optionally clear selectedBot if we want to "close" it completely
                  // setSelectedBot(null); // but Bots requires it to be non-null in some places
                }}
                className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1.5"
                title="Exit to bot list"
              >
                <X size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest pr-1">Exit</span>
              </button>
            </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <h4 className="text-[9px] font-black flex items-center gap-2 uppercase tracking-widest text-slate-500">
                <Settings2 size={12} /> Configuration Unit
              </h4>
              
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-500 flex items-center gap-1.5 uppercase tracking-widest">
                    <Coins size={10} className="text-blue-500" /> Asset Selection
                  </label>
                    <select 
                      value={currentSettings.coin}
                      onChange={(e) => {
                        const newCoin = e.target.value;
                        setBotSettings(prev => ({
                          ...prev,
                          [selectedBot.id]: { ...prev[selectedBot.id], coin: newCoin }
                        }));
                        updateBotConfig(selectedBot.id, newCoin, currentSettings.timeframe, currentSettings.stake, currentSettings.targetProfit);
                      }}
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-2 text-[9px] focus:outline-none focus:border-blue-500 transition-colors text-slate-900 dark:text-white font-bold"
                    >
                      {CRYPTO_LIST.map(c => (
                        <option key={c.symbol} value={c.symbol} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                          {c.symbol}/USDT
                        </option>
                      ))}
                    </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-500 flex items-center gap-1.5 uppercase tracking-widest">
                    <Clock size={10} className="text-blue-500" /> Runtime Frame
                  </label>
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                    {['1M', '15M', '1H', '1D'].map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          const newTf = t;
                          setBotSettings(prev => ({
                            ...prev,
                            [selectedBot.id]: { ...prev[selectedBot.id], timeframe: newTf }
                          }));
                          updateBotConfig(selectedBot.id, currentSettings.coin, newTf, currentSettings.stake, currentSettings.targetProfit);
                        }}
                        className={cn(
                          "flex-1 py-0.5 rounded-md text-[8px] font-bold transition-all",
                          currentSettings.timeframe === t 
                            ? "bg-white dark:bg-slate-700 shadow-sm text-blue-500" 
                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-500 flex items-center gap-1.5 uppercase tracking-widest">
                      <Shield size={10} className="text-blue-500" /> Bot Stake
                    </label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">$</span>
                      <input 
                        type="number"
                        min="10"
                        max="50000"
                        value={currentSettings.stake}
                        onChange={(e) => {
                          let val = Number(e.target.value);
                          if (val > 50000) val = 50000;
                          
                          setBotSettings(prev => ({
                            ...prev,
                            [selectedBot.id]: { ...prev[selectedBot.id], stake: val }
                          }));
                          updateBotConfig(selectedBot.id, currentSettings.coin, currentSettings.timeframe, val, currentSettings.targetProfit);
                        }}
                        className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 pl-4 pr-2 text-[9px] focus:outline-none focus:border-blue-500 transition-colors text-slate-900 dark:text-white font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-500 flex items-center gap-1.5 uppercase tracking-widest">
                      <Target size={10} className="text-blue-500" /> Profit Goal
                    </label>
                    <div className="relative">
                      <input 
                        type="number"
                        min="0"
                        value={currentSettings.targetProfit}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBotSettings(prev => ({
                            ...prev,
                            [selectedBot.id]: { ...prev[selectedBot.id], targetProfit: val }
                          }));
                          updateBotConfig(selectedBot.id, currentSettings.coin, currentSettings.timeframe, currentSettings.stake, val);
                        }}
                        className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-2 text-[9px] focus:outline-none focus:border-blue-500 transition-colors text-slate-900 dark:text-white font-bold"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>
                    </div>
                    {currentSettings.targetProfit > 0 && (
                      <p className="text-[8px] text-blue-500 font-bold mt-1">
                        Goal: ${((currentSettings.stake * currentSettings.targetProfit) / 100).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-2 bg-blue-500/5 border border-blue-500/10 rounded-lg flex gap-2 items-center">
                <AlertCircle size={10} className="text-blue-500 shrink-0" />
                <p className="text-[9px] text-slate-500 leading-tight font-black">
                  Threshold: <span className="text-slate-900 dark:text-white">${selectedBot.minDeposit}</span>. Priority signals.
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                <h4 className="text-[9px] font-black flex items-center gap-2 uppercase tracking-widest text-slate-500 mb-2">
                  <Zap size={12} className="text-blue-500" /> Strategy & Logic
                </h4>
                <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed italic">
                  {selectedBot.id === 'wizard1' ? 'Wizard 1 utilizes a multi-layered neural network to detect institutional buy-side liquidity. It executes trades during high-volatility sessions with advanced trailing-stop protection.' : 
                   selectedBot.id === 'wizard2' ? 'Wizard 2 is an aggressive scalper optimized for low-timeframe market cycles. It uses proprietary momentum oscillators to capture rapid price expansions with 92% historical accuracy.' :
                   selectedBot.description}
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <h4 className="text-[9px] font-black flex items-center gap-2 uppercase tracking-widest text-slate-500">
                <BarChart3 size={12} /> Live Metrics
              </h4>
              
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Daily Profit', value: `${stats[selectedBot.id].profit >= 0 ? '+' : ''}$${stats[selectedBot.id].profit.toFixed(2)}`, color: stats[selectedBot.id].profit >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400' },
                  { label: 'Daily Trades', value: stats[selectedBot.id].trades.toString(), color: 'text-blue-500 dark:text-blue-400' },
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 text-center shadow-sm">
                    <p className="text-[8px] text-slate-500 uppercase font-black mb-1 tracking-widest">{stat.label}</p>
                    <p className={cn("text-sm font-black font-mono tracking-tighter", stat.color)}>{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-1 mt-1 px-1">
                <Clock size={8} className="text-slate-400" />
                <p className="text-[7px] text-slate-400 font-medium italic">Statistics reset daily at 00:00 UTC</p>
              </div>

              <div className="h-16 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800 p-2 flex items-end gap-0.5">
                {[...Array(20)].map((_, i) => (
                  <div 
                    key={i} 
                    className="flex-1 bg-blue-500/20 rounded-t-[1px]"
                    style={{ height: `${20 + Math.random() * 80}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Activity Log */}
      <div className="lg:col-span-4 h-full">
        <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm h-full flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-black flex items-center gap-2 uppercase tracking-widest text-slate-900 dark:text-white">
              <History size={16} className="text-blue-500" /> {isSelectedBotActive ? 'Activity Log' : 'Bot Logs'}
            </h3>
            <div className={cn(
              "flex items-center gap-2 px-2 py-1 rounded-full border",
              isSelectedBotActive 
                ? "bg-green-500/10 border-green-500/20" 
                : "bg-blue-500/10 border-blue-500/20"
            )}>
              {isSelectedBotActive && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>}
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest",
                isSelectedBotActive ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"
              )}>
                {isSelectedBotActive ? 'Live' : `${logs.length} entries`}
              </span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-1 max-h-[400px] lg:max-h-[600px]">
            <AnimatePresence initial={false}>
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-8 opacity-40">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <Activity size={32} className="text-slate-400" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest">Awaiting execution signals...</p>
                </div>
              ) : (
                logs.map((log, i) => {
                  const logMessage = typeof log === 'string' ? log : log.message;
                  const logKey = typeof log === 'string' ? log + i : (log.timestamp || Date.now()) + i;
                  
                  return (
                    <motion.div
                      key={logKey}
                      initial={{ opacity: 0, scale: 0.95, x: -10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      className={cn(
                        "p-3 rounded-xl border font-mono leading-relaxed transition-all shadow-sm",
                        logMessage.includes("+") 
                          ? "bg-green-500/5 border-green-500/20 text-green-600 dark:text-green-400" 
                          : logMessage.includes("-") 
                            ? "bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400" 
                            : "bg-blue-500/5 border-blue-500/20 text-blue-600 dark:text-blue-400"
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={cn(
                          "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
                          logMessage.includes("+") ? "bg-green-500" : logMessage.includes("-") ? "bg-red-500" : "bg-blue-500"
                        )} />
                        <p className="text-[11px] font-bold tracking-tight">
                          {logMessage}
                        </p>
                      </div>
                    </motion.div>
                  );
                })
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
                      Trading bots use advanced algorithmic logic to execute trades. 
                      Ensure your strategy is backtested before running on a REAL account.
                    </p>
                  </div>

                  <button
                    onClick={async () => {
                      if (!newBotConfig.name.trim()) {
                        setAlertConfig({
                          isOpen: true,
                          title: 'Name Required',
                          message: 'Please provide a name for your custom bot.',
                          type: 'warning'
                        });
                        return;
                      }

                      const newBot = await importBot({
                        name: newBotConfig.name,
                        strategy: newBotConfig.strategy,
                        risk: newBotConfig.risk,
                        currency: 'BTC'
                      });

                      if (newBot) {
                        setSelectedBot({
                          id: newBot.id,
                          name: newBot.name,
                          description: `Custom neural bot using ${newBot.strategy} strategy.`,
                          type: 'ai',
                          winRate: 'Adaptive',
                          risk: newBot.risk as any,
                          minDeposit: 10
                        });
                      }

                      setAlertConfig({
                        isOpen: true,
                        title: 'Bot Created',
                        message: 'Your custom bot has been successfully created and added to your processing units.',
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
                      Select your preferred settings above, then upload your bot's JSON configuration file to create.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Alert Modal */}
      <AnimatePresence>
        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClosePasswordModal}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mx-auto mb-6">
                  <Lock size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2">Bot Unlock Required</h3>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  Wizard bots are institutional-grade assets. Please enter your unique bot password to authorize trading.
                </p>

                <div className="space-y-4">
                  <div className="relative">
                    <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter bot password"
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-11 pr-12 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={botPassword}
                      onChange={(e) => setBotPassword(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && pendingBotId) {
                          handleUnlock(pendingBotId, botPassword);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <button
                    onClick={() => pendingBotId && handleUnlock(pendingBotId, botPassword)}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    Unlock Bot
                  </button>
                  <button
                    onClick={handleClosePasswordModal}
                    className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xs"
                  >
                    Cancel
                  </button>
                </div>
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
      {/* Bot History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[24px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh]"
            >
              {/* Header - Fixed at top */}
              <div className="p-5 pb-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                      <History size={20} />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-1">{selectedBot.name}</h3>
                      <p className="text-[8px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest">Performance & Logs</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsHistoryModalOpen(false)}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors shrink-0"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-5 pt-0 custom-scrollbar">
                <div className="space-y-5">
                  {/* Strategy Info */}
                  <div className="p-3.5 bg-blue-500/5 dark:bg-blue-500/10 rounded-xl border border-blue-500/10">
                    <h4 className="text-[8px] font-black flex items-center gap-2 uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1.5">
                      <Zap size={10} className="text-blue-500" /> Strategy & Logic
                    </h4>
                    <p className="text-[10.5px] text-slate-600 dark:text-slate-400 leading-relaxed italic">
                      {selectedBot.id === 'wizard1' ? 'Wizard 1 utilizes a multi-layered neural network to detect institutional buy-side liquidity. It executes trades during high-volatility sessions with advanced trailing-stop protection.' : 
                       selectedBot.id === 'wizard2' ? 'Wizard 2 is an aggressive scalper optimized for low-timeframe market cycles. It uses proprietary momentum oscillators to capture rapid price expansions with 92% historical accuracy.' :
                       selectedBot.description}
                    </p>
                  </div>

                  {/* Logs */}
                  <div>
                    <h4 className="text-[8px] font-black flex items-center gap-2 uppercase tracking-widest text-slate-500 mb-2.5">
                      <History size={10} className="text-blue-500" /> Bot History ({logs.length} entries)
                    </h4>
                    <div className="space-y-2">
                      {logs.length === 0 ? (
                        <div className="py-8 flex flex-col items-center justify-center text-slate-500 opacity-40">
                          <Activity size={32} className="mb-2.5" />
                          <p className="text-[9px] font-black uppercase tracking-widest">No previous runs recorded</p>
                        </div>
                      ) : (
                        logs.map((log, i) => {
                          const logMessage = typeof log === 'string' ? log : log.message;
                          return (
                            <div key={i} className={cn(
                              "p-2.5 rounded-lg border font-mono text-[9px] leading-relaxed transition-all shadow-sm",
                              logMessage.includes("+") 
                                ? "bg-green-500/5 border-green-500/10 text-green-600 dark:text-green-400" 
                                : logMessage.includes("-") 
                                  ? "bg-red-500/5 border-red-500/10 text-red-600 dark:text-red-400" 
                                  : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                            )}>
                              {logMessage}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer - Fixed at bottom */}
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex gap-2.5">
                  <button
                    onClick={() => {
                      setIsHistoryModalOpen(false);
                      const detailSection = document.getElementById('bot-detail-view');
                      if (detailSection) {
                        detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                  >
                    Configure & Run
                  </button>
                  <button
                    onClick={() => setIsHistoryModalOpen(false)}
                    className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
