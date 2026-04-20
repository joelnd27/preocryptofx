import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Bot, 
  History, 
  User as UserIcon, 
  HelpCircle, 
  LogOut, 
  Menu, 
  X,
  Bell,
  Sun,
  Moon,
  ShieldCheck,
  Wallet,
  ChevronRight,
  Search
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { cn } from '../lib/utils';
import Chatbot from './Chatbot';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout, switchAccount, isDarkMode, setIsDarkMode } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin';

  const menuItems = [
    { icon: LayoutDashboard, label: 'Overview', path: '/dashboard' },
    { icon: TrendingUp, label: 'Trade', path: '/trade' },
    { icon: Bot, label: 'AI Bots', path: '/bots' },
    { icon: Wallet, label: 'Finances', path: '/transactions' },
    { icon: History, label: 'History', path: '/trades' },
    { icon: UserIcon, label: 'Profile', path: '/profile' },
  ];

  const bottomItems = [
    { icon: HelpCircle, label: 'Support', path: '/help' },
    { icon: isDarkMode ? Sun : Moon, label: isDarkMode ? 'Light Mode' : 'Dark Mode', onClick: () => setIsDarkMode(!isDarkMode) },
    { icon: LogOut, label: 'Sign Out', onClick: () => { logout(); navigate('/'); } },
  ];

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300 font-sans flex overflow-hidden",
      isDarkMode ? "bg-[#0b0e11] text-white" : "bg-slate-50 text-slate-900"
    )}>
      {/* Sidebar - Desktop */}
      <aside className={cn(
        "hidden lg:flex flex-col border-r transition-all duration-300 ease-in-out shrink-0",
        isSidebarOpen ? "w-64" : "w-20",
        isDarkMode ? "bg-[#161a1e] border-slate-800" : "bg-white border-slate-200 shadow-sm"
      )}>
        <div className="h-16 flex items-center px-6 border-b border-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-black shrink-0">P</div>
            {isSidebarOpen && <span className="text-xl font-black tracking-tight whitespace-nowrap">PreoCryptoFX</span>}
          </div>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group",
                location.pathname === item.path
                  ? "bg-primary/10 text-primary font-bold"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <item.icon size={20} className={cn("shrink-0", location.pathname === item.path ? "text-primary" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300")} />
              {isSidebarOpen && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-1 shrink-0">
          {bottomItems.map((item, i) => (
            <button
              key={i}
              onClick={item.onClick || (() => item.path && navigate(item.path))}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all group"
            >
              <item.icon size={20} className="shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
              {isSidebarOpen && <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>}
            </button>
          ))}
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={cn(
                "fixed inset-y-0 left-0 w-64 z-[70] flex flex-col lg:hidden",
                isDarkMode ? "bg-[#161a1e]" : "bg-white"
              )}
            >
              <div className="h-16 flex items-center justify-between px-6 border-b border-transparent">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-black">P</div>
                  <span className="text-xl font-black tracking-tight">PreoCryptoFX</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2">
                  <X size={20} />
                </button>
              </div>
              <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
                {menuItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
                      location.pathname === item.path
                        ? "bg-primary/10 text-primary font-bold"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
              <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
                {bottomItems.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (item.onClick) item.onClick();
                      else if (item.path) navigate(item.path);
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <item.icon size={20} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className={cn(
          "h-16 border-b flex items-center justify-between px-4 lg:px-8 shrink-0 z-40",
          isDarkMode ? "bg-[#161a1e]/80 border-slate-800" : "bg-white/80 border-slate-200",
          "backdrop-blur-md"
        )}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                if (window.innerWidth >= 1024) setIsSidebarOpen(!isSidebarOpen);
                else setIsMobileMenuOpen(true);
              }}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-1.5 border border-transparent focus-within:border-primary/50 transition-all">
              <Search size={16} className="text-slate-400" />
              <input 
                type="text" 
                placeholder="Search assets..." 
                className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-48"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            {/* Account Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <button 
                onClick={() => switchAccount('REAL')}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black transition-all",
                  user?.activeAccount === 'REAL' 
                    ? "bg-white dark:bg-slate-700 text-primary shadow-sm" 
                    : "text-slate-500"
                )}
              >
                REAL
              </button>
              <button 
                onClick={() => switchAccount('DEMO')}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black transition-all",
                  user?.activeAccount === 'DEMO' 
                    ? "bg-white dark:bg-slate-700 text-primary shadow-sm" 
                    : "text-slate-500"
                )}
              >
                DEMO
              </button>
            </div>

            {/* Balance */}
            <div className="hidden sm:block text-right">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Balance</p>
              <p className="text-sm font-black text-primary">
                ${(user?.activeAccount === 'REAL' ? user?.realBalance : user?.demoBalance)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors relative">
                <Bell size={20} className="text-slate-500" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-[#161a1e]"></span>
              </button>
              <Link to="/profile" className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                <UserIcon size={20} className="text-primary" />
              </Link>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      <Chatbot />
    </div>
  );
}
