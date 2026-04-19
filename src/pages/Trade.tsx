import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  ArrowRight, 
  Zap,
  DollarSign,
  BarChart3,
  LineChart as LineChartIcon,
  CandlestickChart,
  LayoutGrid,
  ArrowUp,
  ArrowDown,
  Activity,
  ChevronDown,
  X,
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Layers,
  Settings,
  Check
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { 
  CRYPTO_LIST, 
  Trade as TradeType, 
  MIN_STAKE_USD, 
  MIN_BALANCE_AFTER_LOSS,
  MIN_MANUAL_STOP_BALANCE
} from '../types.ts';
import { formatCurrency, cn } from '../lib/utils';
import AdvancedChart, { ChartType, Timeframe } from '../components/AdvancedChart';

import AlertModal from '../components/AlertModal';

export default function Trade() {
  const { user, addTrade, closeTrade, isDarkMode, indicators, setIndicators } = useStore();
  const [selectedCoin, setSelectedCoin] = useState(CRYPTO_LIST[0]);
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('30');
  const [search, setSearch] = useState('');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [priceHistory, setPriceHistory] = useState<Record<string, any[]>>({});
  const [chartType, setChartType] = useState<ChartType>('AREA');
  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<'BUY' | 'SELL' | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
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
  const [aiSignal, setAiSignal] = useState<{
    coin: string;
    type: 'BUY' | 'SELL';
    confidence: number;
    reason: string;
    timestamp: number;
  } | null>(null);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // AI Signal Generation
  useEffect(() => {
    const generateSignal = () => {
      const randomCoin = CRYPTO_LIST[Math.floor(Math.random() * CRYPTO_LIST.length)];
      const type = Math.random() > 0.5 ? 'BUY' : 'SELL';
      const confidence = Math.floor(Math.random() * 25) + 70; // 70-95%
      
      const reasons = [
        "Strong bullish momentum detected",
        "RSI oversold on 15m timeframe",
        "Support level bounce confirmed",
        "Volume spike indicating trend reversal",
        "MACD crossover detected",
        "Resistance breakout imminent",
        "Fibonacci retracement level reached"
      ];
      
      const reason = reasons[Math.floor(Math.random() * reasons.length)];
      
      setAiSignal({
        coin: randomCoin.symbol,
        type,
        confidence,
        reason,
        timestamp: Date.now()
      });
    };

    generateSignal();
    const interval = setInterval(generateSignal, 20000); // New signal every 20 seconds
    return () => clearInterval(interval);
  }, []);

  // Listen for trade closed events from store
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

  // Helper to get interval in seconds
  const getIntervalSeconds = (tf: Timeframe) => {
    switch (tf) {
      case '1S': return 1;
      case '1M': return 60;
      case '15M': return 15 * 60;
      case '1H': return 3600;
      case '4H': return 4 * 3600;
      case '1D': return 86400;
      case '1W': return 7 * 86400;
      default: return 60;
    }
  };

  // Initialize prices and history
  useEffect(() => {
    const initialPrices: Record<string, number> = {};
    const initialHistory: Record<string, any[]> = {};
    const interval = getIntervalSeconds(timeframe);
    
    CRYPTO_LIST.forEach(c => {
      const basePrice = (c as any).basePrice || 50000;
      // Add some initial randomness to the base price
      const startPrice = basePrice * (1 + (Math.random() * 0.04 - 0.02));
      initialPrices[c.symbol] = startPrice;
      
      const history = [];
      let tempPrice = startPrice;
      const now = Math.floor(Date.now() / 1000);
      
      // Generate 100 points
      for (let i = 0; i < 100; i++) {
        const open = tempPrice;
        const volatility = timeframe === '1M' || timeframe === '1S' ? 0.001 : (timeframe === '1H' ? 0.005 : 0.02);
        const change = tempPrice * (Math.random() * volatility * 2 - volatility);
        const close = open + change;
        const high = Math.max(open, close) + Math.random() * (tempPrice * volatility * 0.5);
        const low = Math.min(open, close) - Math.random() * (tempPrice * volatility * 0.5);
        
        // Align timeValue to the interval to ensure consistent candles
        const pointTime = now - (100 - i) * interval;
        const alignedTime = pointTime - (pointTime % interval);

        history.push({
          timeValue: alignedTime,
          open,
          high,
          low,
          close,
          price: close
        });
        tempPrice = close;
      }
      initialHistory[c.symbol] = history;
      // Sync the initial real-time price with the final historical closing price
      initialPrices[c.symbol] = tempPrice;
    });
    
    setPrices(initialPrices);
    setPriceHistory(initialHistory);

    const liveInterval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const currentInterval = getIntervalSeconds(timeframe);
      
      setPrices(prevPrices => {
        const nextPrices = { ...prevPrices };
        Object.keys(nextPrices).forEach(key => {
          const currentPrice = nextPrices[key];
          
          // Higher volatility for more "active" looking charts (0.015% to 0.05% per update)
          // We also ensure even tiny priced assets like SHIB move visibly
          let volatility = 0.00015; 
          if (currentPrice < 1) volatility = 0.0005; // More push for penny coins
          if (currentPrice < 0.01) volatility = 0.001; // Even more for micro coins
          
          const change = currentPrice * (Math.random() * volatility * 2 - volatility);
          
          // Ensure price never hits zero or stays strictly flat
          nextPrices[key] = Math.max(0.00000001, currentPrice + change);
          
          // Add a tiny random "kick" if price is really small and hasn't moved
          if (nextPrices[key] === currentPrice) {
            nextPrices[key] += Math.random() * 0.0000001;
          }
        });

        // Update history in the same tick to avoid synchronization issues
        setPriceHistory(prevHistory => {
          const nextHistory = { ...prevHistory };
          Object.keys(nextHistory).forEach(symbol => {
            const currentPrice = nextPrices[symbol];
            const history = [...(nextHistory[symbol] || [])];
            if (history.length === 0) return;

            const lastPoint = { ...history[history.length - 1] };
            
            // Align current time to interval
            const alignedNow = now - (now % currentInterval);

            // If more than interval passed, start a new candle
            if (alignedNow > lastPoint.timeValue) {
              const newPoint = {
                timeValue: alignedNow,
                open: lastPoint.close,
                high: Math.max(lastPoint.close, currentPrice),
                low: Math.min(lastPoint.close, currentPrice),
                close: currentPrice,
                price: currentPrice
              };
              history.push(newPoint);
              if (history.length > 200) history.shift(); // Keep buffer manageable
            } else {
              // Update current candle
              lastPoint.close = currentPrice;
              lastPoint.price = currentPrice;
              lastPoint.high = Math.max(lastPoint.high, currentPrice);
              lastPoint.low = Math.min(lastPoint.low, currentPrice);
              history[history.length - 1] = lastPoint;
            }
            nextHistory[symbol] = history;
          });
          return nextHistory;
        });

        return nextPrices;
      });
    }, 500); // Update every 500ms for smoother movement

    return () => clearInterval(liveInterval);
  }, [timeframe]);

  const chartData = useMemo(() => {
    return priceHistory[selectedCoin.symbol] || [];
  }, [selectedCoin.symbol, priceHistory]);

  const handleTrade = async (type: 'BUY' | 'SELL') => {
    setSelectedType(type);
    console.log('handleTrade triggered with type:', type);
    const currentPrice = prices[selectedCoin.symbol] || 50000;
    const tradeAmount = parseFloat(amount);
    console.log('Trade details:', { coin: selectedCoin.symbol, amount: tradeAmount, duration, type });

    if (isNaN(tradeAmount) || tradeAmount <= 0) {
      setAlertConfig({
        isOpen: true,
        title: 'Invalid Amount',
        message: 'Please enter a valid trade amount to proceed.',
        type: 'warning'
      });
      return;
    }

    if (tradeAmount < MIN_STAKE_USD) {
      setAlertConfig({
        isOpen: true,
        title: 'Minimum Stake',
        message: `The minimum stake for any trade is $${MIN_STAKE_USD}.`,
        type: 'info'
      });
      return;
    }
    
    const currentBalance = user?.activeAccount === 'REAL' ? user?.realBalance : user?.demoBalance;
    console.log('Current balance:', currentBalance);

    if (tradeAmount > (currentBalance || 0)) {
      setAlertConfig({
        isOpen: true,
        title: 'Insufficient Funds',
        message: 'You do not have enough capital to place this trade. Please deposit more funds or reduce your stake.',
        type: 'error'
      });
      return;
    }

    if ((currentBalance || 0) - tradeAmount < MIN_MANUAL_STOP_BALANCE) {
      setAlertConfig({
        isOpen: true,
        title: 'Manual Trade Limit',
        message: `Your balance is too low to open new manual positions. A minimum of $${MIN_MANUAL_STOP_BALANCE} must remain in your account.`,
        type: 'warning'
      });
      return;
    }

    const newTrade: TradeType = {
      id: Math.random().toString(36).substr(2, 9),
      coin: selectedCoin.symbol,
      amount: tradeAmount,
      type: type,
      price: currentPrice,
      status: 'OPEN',
      profit: 0,
      timestamp: Date.now(),
      accountType: user?.activeAccount || 'DEMO',
      duration: parseInt(duration)
    };

    try {
      console.log('Calling addTrade from Trade.tsx');
      await addTrade(newTrade, true);
      setAmount('');
      
      // Show success toast
      setAlertConfig({
        isOpen: true,
        title: 'Trade Placed',
        message: `${type} ${tradeAmount} USDT on ${selectedCoin.symbol} successful.`,
        type: 'success'
      });

      // Scroll to active trades
      setTimeout(() => {
        const element = document.getElementById('active-trades');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } catch (error: any) {
      console.error('Error in handleTrade:', error);
      setAlertConfig({
        isOpen: true,
        title: 'Trade Error',
        message: error.message || 'An unexpected error occurred while placing your trade.',
        type: 'error'
      });
    }
  };

  const filteredCoins = CRYPTO_LIST.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const activeTrades = (user?.trades || []).filter(t => t.status === 'OPEN');

  const calculateLiveProfit = (trade: TradeType) => {
    const currentPrice = prices[trade.coin];
    if (!currentPrice) return 0;
    
    // If we have a pre-calculated target profit, we should trend towards it
    if (trade.targetProfit !== undefined) {
      const startTime = trade.timestamp;
      const durationMs = (trade.duration || 60) * 1000;
      const elapsed = Date.now() - startTime;
      const rawProgress = Math.min(1, elapsed / durationMs);
      
      // Seed for unique character per trade to make the "mid-steps" consistent
      const seed = trade.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      
      // Quantize progress to "shift only twice" as requested
      // We'll also make the "intermediate" values static so they don't jitter
      let displayProfit = 0;
      
      if (rawProgress >= 0.85) {
        // Final stage: Show close to full profit/loss
        displayProfit = trade.targetProfit;
      } else if (rawProgress >= 0.45) {
        // Second shift: Show about 60% of the movement
        displayProfit = trade.targetProfit * 0.6;
      } else if (rawProgress >= 0.15) {
        // First shift: Show about 25% of the movement
        displayProfit = trade.targetProfit * 0.25;
      } else {
        // Start: Almost zero movement
        displayProfit = trade.targetProfit * 0.05;
      }
      
      // Add a tiny bit of STATIC variation based on the trade ID (not time) 
      // so different trades don't look identical even if amounts are same
      const staticVariation = (seed % 10) * 0.01; 
      
      return Number((displayProfit + staticVariation).toFixed(2));
    }

    const diff = trade.type === 'BUY' 
      ? (currentPrice - trade.price) 
      : (trade.price - currentPrice);
    
    const percentChange = diff / trade.price;
    
    // Normal movement (no target profit) - reduced leverage to 1.5x for realism
    return Number((trade.amount * percentChange * 1.5).toFixed(2));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-6">
      {/* Top Bar for Mobile Asset Selection */}
      <div className="lg:hidden bg-white dark:bg-[#161a1e] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-xs">
            {selectedCoin.symbol[0]}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedCoin.symbol}/USDT</p>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-green-500 font-bold">${prices[selectedCoin.symbol]?.toLocaleString()}</p>
              <span className="text-[8px] text-slate-400 font-mono">{currentTime.toLocaleTimeString([], { hour12: false })}</span>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setIsAssetSelectorOpen(true)}
          className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Mobile Asset Selector Modal */}
      <AnimatePresence>
        {isAssetSelectorOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAssetSelectorOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-x-0 bottom-0 bg-white dark:bg-[#161a1e] rounded-t-[32px] z-[101] lg:hidden max-h-[80vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Select Asset</h3>
                <button 
                  onClick={() => setIsAssetSelectorOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search assets..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-10 pr-4 text-sm font-bold focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
                {filteredCoins.map((coin) => (
                  <button
                    key={coin.symbol}
                    onClick={() => {
                      setSelectedCoin(coin);
                      setIsAssetSelectorOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-6 py-4 transition-all border-b border-slate-50 dark:border-slate-800/50",
                      selectedCoin.symbol === coin.symbol ? "bg-primary/5" : "active:bg-slate-50 dark:active:bg-slate-800/20"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center font-black text-xs">
                        {coin.symbol[0]}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black text-slate-900 dark:text-white">{coin.symbol}/USDT</p>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{coin.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900 dark:text-white">${prices[coin.symbol]?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                      <p className="text-[10px] text-green-500 font-bold">+2.45%</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
        {/* Main Chart Area */}
        <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm h-[500px] flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="hidden lg:flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black">{selectedCoin.symbol}/USDT</span>
                <span className="text-green-500 font-bold text-sm">${prices[selectedCoin.symbol]?.toLocaleString()}</span>
                <span className="ml-4 text-[10px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                  {currentTime.toLocaleTimeString([], { hour12: false })}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Indicators Button */}
              <div className="relative">
                <button
                  onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
                  className={cn(
                    "p-2 rounded-lg transition-all border border-slate-200 dark:border-slate-800",
                    showIndicatorMenu ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary"
                  )}
                  title="Indicators"
                >
                  <Layers size={14} />
                </button>

                <AnimatePresence>
                  {showIndicatorMenu && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowIndicatorMenu(false)}
                        className="fixed inset-0 z-[60]"
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-56 bg-white dark:bg-[#1c2229] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-[61] overflow-hidden"
                      >
                        <div className="p-2 space-y-1">
                          {[
                            { id: 'rsi', label: 'RSI (Momentum)', desc: 'Relative Strength Index' },
                            { id: 'ma', label: 'MA (Average)', desc: '10-period Trend' },
                            { id: 'ema', label: 'EMA (Fast)', desc: '20-period Fast Trend' },
                            { id: 'fibonacci', label: 'Fibonacci', desc: 'Support/Resistance' }
                          ].map((ind) => (
                            <button
                              key={ind.id}
                              onClick={() => {
                                setIndicators(prev => ({ 
                                  ...prev, 
                                  [ind.id]: !prev[ind.id as keyof typeof prev] 
                                }));
                              }}
                              className={cn(
                                "w-full text-left px-4 py-3 rounded-lg transition-all group",
                                indicators[ind.id as keyof typeof indicators]
                                  ? "bg-primary/10 text-primary"
                                  : "hover:bg-slate-100 dark:hover:bg-slate-800"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-wider">{ind.label}</span>
                                {indicators[ind.id as keyof typeof indicators] && <Check size={14} />}
                              </div>
                              <p className="text-[10px] text-slate-500 font-bold opacity-80">{ind.desc}</p>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {['AREA', 'LINE', 'CANDLE'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setChartType(t as ChartType)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[10px] font-bold transition-all",
                      chartType === t ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {['1M', '1H', '1D'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimeframe(t as Timeframe)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[10px] font-bold transition-all",
                      timeframe === t ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex-1 p-4 min-h-0">
            <AdvancedChart 
              data={chartData} 
              type={chartType} 
              timeframe={timeframe}
              isDarkMode={isDarkMode}
              symbol={selectedCoin.symbol}
              indicators={indicators}
            />
          </div>
        </div>

        {/* Trading Panel - Moved below chart */}
        <div id="trading-panel" className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
          {/* Order Form */}
          <div className="lg:col-span-2 bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount (USDT)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-9 pr-4 text-sm font-black focus:outline-none focus:border-primary transition-all"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {['50%', 'MAX'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        const balance = user?.activeAccount === 'REAL' ? user?.realBalance : user?.demoBalance;
                        if (p === 'MAX') {
                          const maxAmount = Math.max(0, balance - MIN_BALANCE_AFTER_LOSS);
                          setAmount(maxAmount.toString());
                        } else {
                          setAmount((balance * 0.5).toString());
                        }
                      }}
                      className="py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm font-black focus:outline-none focus:border-primary appearance-none"
                  >
                    <option value="5">5 Seconds</option>
                    <option value="10">10 Seconds</option>
                    <option value="30">30 Seconds</option>
                    <option value="60">1 Minute</option>
                    <option value="120">2 Minutes</option>
                    <option value="180">3 Minutes</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleTrade('BUY')}
                    className={cn(
                      "py-4 rounded-xl font-bold text-white transition-all shadow-lg uppercase tracking-widest text-[10px]",
                      selectedType === 'BUY' ? "bg-green-500 ring-4 ring-green-500/20" : "bg-green-600 hover:bg-green-700 shadow-green-600/20"
                    )}
                  >
                    BUY
                  </button>
                  <button
                    onClick={() => handleTrade('SELL')}
                    className={cn(
                      "py-4 rounded-xl font-bold text-white transition-all shadow-lg uppercase tracking-widest text-[10px]",
                      selectedType === 'SELL' ? "bg-red-500 ring-4 ring-red-500/20" : "bg-red-600 hover:bg-red-700 shadow-red-600/20"
                    )}
                  >
                    SELL
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Asset Selection - Desktop */}
          <div className="hidden lg:flex flex-col bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-9 pr-4 text-[10px] font-bold focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="h-[140px] overflow-y-auto custom-scrollbar">
              {filteredCoins.map((coin) => (
                <button
                  key={coin.symbol}
                  onClick={() => setSelectedCoin(coin)}
                  className={cn(
                    "w-full p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all border-b border-slate-100 dark:border-slate-800 last:border-0",
                    selectedCoin.symbol === coin.symbol && "bg-primary/5 dark:bg-primary/10"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center font-black text-[8px]">
                      {coin.symbol[0]}
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] font-black text-slate-900 dark:text-white">{coin.symbol}/USDT</p>
                    </div>
                  </div>
                  <p className="text-[10px] font-black text-slate-900 dark:text-white">${prices[coin.symbol]?.toLocaleString()}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active Trades Section */}
        <div id="active-trades" className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Active Trades</h3>
            <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold">
              {activeTrades.length}
            </span>
          </div>
          
          {activeTrades.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeTrades.map(trade => {
                const liveProfit = calculateLiveProfit(trade);
                const timeLeft = Math.max(0, Math.ceil((trade.timestamp + (trade.duration || 0) * 1000 - Date.now()) / 1000));
                
                return (
                  <div key={trade.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-black px-2 py-1 rounded",
                          trade.type === 'BUY' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {trade.type}
                        </span>
                        <span className="text-sm font-black">{trade.coin}/USDT</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Activity size={14} />
                        <span className="text-xs font-mono font-bold">{timeLeft}s</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Profit/Loss</p>
                        <p className={cn(
                          "text-lg font-black",
                          liveProfit >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {liveProfit >= 0 ? '+' : ''}{liveProfit.toFixed(2)} USDT
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Investment</p>
                        <p className="text-lg font-black">{trade.amount} USDT</p>
                      </div>
                    </div>

                    <button
                      onClick={() => closeTrade(trade.id, liveProfit)}
                      className="w-full py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Close Early
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Activity size={24} />
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No Active Trades</p>
              <p className="text-[10px] text-slate-500 mt-1">Your running trades will appear here</p>
            </div>
          )}
        </div>

        {/* AI Signal Section */}
        <div className="bg-white dark:bg-[#161a1e] border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-500">
              <BrainCircuit size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest">AI Trade Signal</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase">Real-time market analysis</p>
            </div>
          </div>

          {aiSignal ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center font-black text-sm shadow-sm text-slate-900 dark:text-white">
                      {aiSignal.coin[0]}
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{aiSignal.coin}/USDT</p>
                      <div className="flex items-center gap-1">
                        {aiSignal.type === 'BUY' ? (
                          <TrendingUp size={14} className="text-green-500" />
                        ) : (
                          <TrendingDown size={14} className="text-red-500" />
                        )}
                        <span className={cn(
                          "text-xs font-black uppercase",
                          aiSignal.type === 'BUY' ? "text-green-500" : "text-red-500"
                        )}>
                          {aiSignal.type} Signal
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Confidence</p>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full" 
                          style={{ width: `${aiSignal.confidence}%` }}
                        />
                      </div>
                      <span className="text-sm font-black text-purple-500">{aiSignal.confidence}%</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const coin = CRYPTO_LIST.find(c => c.symbol === aiSignal.coin);
                    if (coin) setSelectedCoin(coin);
                    setSelectedType(aiSignal.type);
                    const element = document.getElementById('trading-panel');
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-purple-600/20"
                >
                  Use Signal
                </button>
              </div>

              <div className="p-6 bg-purple-500/5 border border-purple-500/10 rounded-2xl flex items-start gap-4">
                <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-500 shrink-0">
                  <Lightbulb size={20} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-black text-purple-500 uppercase tracking-wider">Analysis Reason</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                    {aiSignal.reason}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="animate-pulse flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
                <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800 rounded-full" />
              </div>
            </div>
          )}
        </div>
      </div>
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
