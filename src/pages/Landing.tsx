import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  Shield, 
  Zap, 
  Globe, 
  ArrowRight, 
  CheckCircle2,
  Cpu,
  BarChart3,
  Menu,
  X
} from 'lucide-react';
import { CRYPTO_LIST } from '../types';
import { cn } from '../lib/utils';

export default function Landing() {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const initialPrices: Record<string, number> = {};
    CRYPTO_LIST.forEach(c => {
      initialPrices[c.symbol] = 50000 + (Math.random() * 1000 - 500);
    });
    setPrices(initialPrices);

    const interval = setInterval(() => {
      setPrices(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          next[key] = next[key] * (1 + (Math.random() * 0.002 - 0.001));
        });
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="PreoCryptoFX Logo" className="w-8 h-8 sm:w-10 sm:h-10" />
            <span className="text-xl sm:text-2xl font-display font-black bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent tracking-tighter">
              PreoCryptoFX
            </span>
          </div>
          
          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8 text-slate-400">
            <a href="#features" className="hover:text-white transition-colors text-sm font-medium">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors text-sm font-medium">How it Works</a>
            <Link to="/login" className="px-6 py-2 rounded-full hover:bg-slate-800 transition-colors text-sm font-medium">Login</Link>
            <Link to="/register" className="px-6 py-3 bg-blue-600 rounded-full font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 text-sm">
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden p-2 text-slate-400 hover:text-white"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-slate-900 border-b border-slate-800 overflow-hidden"
            >
              <div className="px-4 py-6 space-y-4">
                <a href="#features" onClick={() => setIsMobileMenuOpen(false)} className="block text-lg text-slate-300 hover:text-white">Features</a>
                <a href="#how-it-works" onClick={() => setIsMobileMenuOpen(false)} className="block text-lg text-slate-300 hover:text-white">How it Works</a>
                <div className="pt-4 flex flex-col gap-3">
                  <Link to="/login" className="w-full py-3 text-center rounded-xl bg-slate-800 font-medium">Login</Link>
                  <Link to="/register" className="w-full py-3 text-center rounded-xl bg-blue-600 font-bold">Get Started</Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 sm:pt-40 pb-16 sm:pb-20 px-4 sm:px-6">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-blue-600/20 blur-[80px] sm:blur-[120px] rounded-full"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-cyan-400/20 blur-[80px] sm:blur-[120px] rounded-full"></div>
        </div>

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="px-3 py-1 sm:px-4 sm:py-2 rounded-full bg-blue-500/10 text-blue-400 text-[10px] sm:text-xs font-mono font-bold border border-blue-500/20 mb-6 inline-block uppercase tracking-widest">
              AI-Powered Financial Intelligence
            </span>
            <h1 className="text-4xl sm:text-6xl md:text-8xl font-display font-black tracking-tight mb-6 sm:mb-8 leading-[0.95]">
              The Future of <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 bg-clip-text text-transparent">
                Crypto Trading
              </span>
            </h1>
            <p className="text-base sm:text-xl text-slate-400 max-w-2xl mx-auto mb-8 sm:mb-12 px-4">
              Experience the next generation of crypto trading. Our AI bots analyze market trends 24/7 to maximize your profits while you sleep.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4">
              <Link to="/register" className="w-full sm:w-auto px-8 sm:px-10 py-3 sm:py-4 bg-blue-600 rounded-full text-base sm:text-lg font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 group shadow-xl shadow-blue-600/20">
                Start Trading Now <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
              </Link>
              <button className="w-full sm:w-auto px-8 sm:px-10 py-3 sm:py-4 bg-slate-900 border border-slate-800 rounded-full text-base sm:text-lg font-bold hover:bg-slate-800 transition-all">
                View Live Demo
              </button>
            </div>
          </motion.div>

          {/* Animated Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-16 sm:mt-20 relative px-2 sm:px-4"
          >
            <div className="relative mx-auto max-w-5xl rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4 backdrop-blur-xl shadow-2xl shadow-blue-500/10">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 px-2">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-8 h-48 sm:h-64 bg-slate-800/30 rounded-xl overflow-hidden relative border border-slate-700/30">
                  {/* Simulated Chart */}
                  <div className="absolute inset-0 flex items-end justify-between px-2 sm:px-4 pb-4 gap-0.5 sm:gap-1">
                    {[...Array(15)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ height: [30, 80, 50, 100, 70][i % 5] + '%' }}
                        transition={{ duration: 2.5, repeat: Infinity, repeatType: 'reverse', delay: i * 0.15 }}
                        className="w-full bg-blue-500/30 rounded-t-sm"
                      />
                    ))}
                  </div>
                  <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] sm:text-xs font-mono text-slate-400">AI BOT ACTIVE: BTC/USDT</span>
                  </div>
                </div>
                <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-1 gap-3 sm:gap-4">
                  <div className="bg-slate-800/30 rounded-xl p-3 sm:p-4 border border-slate-700/30">
                    <p className="text-[10px] sm:text-xs text-slate-400 mb-1 uppercase tracking-widest font-bold">Total Balance</p>
                    <p className="text-lg sm:text-2xl font-mono font-bold tabular-nums">$12,450.00</p>
                    <p className="text-[10px] sm:text-xs text-green-400 mt-1 font-mono">+12.5%</p>
                  </div>
                  <div className="bg-slate-800/30 rounded-xl p-3 sm:p-4 border border-slate-700/30">
                    <p className="text-[10px] sm:text-xs text-slate-400 mb-1">Active Bots</p>
                    <div className="flex items-center gap-2 mt-1 sm:mt-2">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-500/20 rounded flex items-center justify-center text-blue-400"><Cpu size={14} /></div>
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-cyan-500/20 rounded flex items-center justify-center text-cyan-400"><BarChart3 size={14} /></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Price Ticker */}
      <div className="bg-slate-900/50 border-y border-slate-800 py-3 sm:py-4 overflow-hidden relative backdrop-blur-sm">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...CRYPTO_LIST, ...CRYPTO_LIST].map((coin, i) => (
            <div key={i} className="inline-flex items-center gap-3 sm:gap-4 px-6 sm:px-8 border-r border-slate-800">
              <span className="font-bold text-slate-300 text-xs sm:text-sm">{coin.symbol}</span>
              <span className="font-mono text-blue-400 text-xs sm:text-sm">
                ${prices[coin.symbol]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={cn("text-[10px] sm:text-xs", i % 2 === 0 ? "text-green-400" : "text-red-400")}>
                {i % 2 === 0 ? '▲' : '▼'} {(Math.random() * 5).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section id="features" className="py-20 sm:py-32 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-20">
            <h2 className="text-3xl sm:text-5xl font-display font-black mb-4 tracking-tight">Why Choose PreoCryptoFX?</h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto px-4">
              We combine advanced machine learning with high-frequency trading infrastructure to give you an unfair advantage in the markets.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {[
              { icon: Zap, title: "Ultra-Fast Execution", desc: "Our infrastructure is optimized for sub-millisecond trade execution across 20+ major exchanges." },
              { icon: Shield, title: "Bank-Grade Security", desc: "Your assets are protected by multi-sig cold storage and end-to-end encryption." },
              { icon: Cpu, title: "AI Automation", desc: "Deploy sophisticated trading strategies with a single click using our pre-trained AI models." },
              { icon: BarChart3, title: "Advanced Analytics", desc: "Get deep insights into your portfolio performance with real-time PnL tracking." },
              { icon: Globe, title: "Global Access", desc: "Trade anytime, anywhere. Our platform is available 24/7 with zero downtime." },
              { icon: TrendingUp, title: "High Yields", desc: "Our bots are designed to find opportunities in both bull and bear markets." }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="p-6 sm:p-8 rounded-3xl bg-slate-900/50 border border-slate-800 hover:border-blue-500/50 transition-all group backdrop-blur-sm"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon size={24} />
                </div>
                <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">{feature.title}</h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 sm:py-20 px-4 sm:px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-12">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <img src="/favicon.svg" alt="PreoCryptoFX Logo" className="w-10 h-10" />
              <span className="text-xl font-bold">PreoCryptoFX</span>
            </div>
            <p className="text-sm text-slate-400 max-w-sm mb-8">
              The world's most advanced AI-powered crypto trading platform. Join over 500,000 traders worldwide.
            </p>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center hover:bg-slate-800 cursor-pointer transition-colors">
                <Globe size={18} />
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-bold mb-6 text-sm uppercase tracking-wider text-slate-500">Platform</h4>
            <ul className="space-y-4 text-sm text-slate-400">
              <li><Link to="/trade" className="hover:text-white transition-colors">Trading</Link></li>
              <li><Link to="/bots" className="hover:text-white transition-colors">AI Bots</Link></li>
              <li><Link to="/help" className="hover:text-white transition-colors">Help Center</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-6 text-sm uppercase tracking-wider text-slate-500">Legal</h4>
            <ul className="space-y-4 text-sm text-slate-400">
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Cookie Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-16 sm:mt-20 pt-8 border-t border-slate-800 text-center text-slate-500 text-xs sm:text-sm">
          © 2026 PreoCryptoFX. All rights reserved.
        </div>
      </footer>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: inline-flex;
          animation: marquee 40s linear infinite;
        }
      `}</style>
    </div>
  );
}
