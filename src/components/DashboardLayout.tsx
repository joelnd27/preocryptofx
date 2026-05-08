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
  Search,
  Download
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { cn } from '../lib/utils';
import Chatbot from './Chatbot';
import PWAInstallBanner from './PWAInstallBanner';
import InstallInstructionsModal from './InstallInstructionsModal';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout, switchAccount, isDarkMode, setIsDarkMode, installApp } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin';

  const menuItems = isAdmin ? [
    { icon: ShieldCheck, label: 'Admin', path: '/admin' },
    { icon: UserIcon, label: 'Profile', path: '/profile' },
  ] : [
    { icon: LayoutDashboard, label: 'Overview', path: '/dashboard' },
    { icon: TrendingUp, label: 'Trade', path: '/trade' },
    { icon: Bot, label: 'Bots', path: '/bots' },
    { icon: Wallet, label: 'Finances', path: '/transactions' },
    { icon: History, label: 'History', path: '/trades' },
    { icon: UserIcon, label: 'Profile', path: '/profile' },
  ];

  const bottomItems = [
    { icon: HelpCircle, label: 'Support', path: '/help' },
    { icon: Download, label: 'Download App', onClick: () => installApp() },
    { icon: isDarkMode ? Sun : Moon, label: isDarkMode ? 'Light Mode' : 'Dark Mode', onClick: () => setIsDarkMode(!isDarkMode) },
    { icon: LogOut, label: 'Sign Out', onClick: () => { logout(); navigate('/'); } },
  ];

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300 font-sans flex overflow-hidden",
      isDarkMode ? "bg-background text-foreground" : "bg-slate-50 text-slate-900"
    )}>
      {/* Sidebar - Desktop */}
      <aside className={cn(
        "hidden lg:flex flex-col border-r transition-all duration-300 ease-in-out shrink-0",
        isSidebarOpen ? "w-64" : "w-20",
        isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
      )}>
        <div className="h-16 flex items-center px-6 border-b border-transparent shrink-0">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Logo" className="w-8 h-8 rounded-lg shrink-0" />
            {isSidebarOpen && <span className="text-xl font-bold tracking-tight whitespace-nowrap">PreoCryptoFX</span>}
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
                  : "text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <item.icon size={20} className={cn("shrink-0", location.pathname === item.path ? "text-primary" : "text-slate-400 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-100")} />
              {isSidebarOpen && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-1 shrink-0">
          {bottomItems.map((item, i) => (
            <button
              key={i}
              onClick={item.onClick || (() => item.path && navigate(item.path))}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all group"
            >
              <item.icon size={20} className="shrink-0 text-slate-400 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-100" />
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
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={cn(
                "fixed inset-y-0 left-0 w-64 z-[210] flex flex-col lg:hidden shadow-2xl",
                isDarkMode ? "bg-slate-900" : "bg-white"
              )}
            >
              <div className="h-16 flex items-center justify-between px-6 border-b border-transparent">
                <div className="flex items-center gap-3">
                  <img src="/favicon.svg" alt="Logo" className="w-8 h-8 rounded-lg" />
                  <span className="text-xl font-bold tracking-tight">PreoCryptoFX</span>
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
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        <div className="sticky top-0 z-50 w-full shrink-0">
          <PWAInstallBanner />
          
          {/* Top Header */}
          <header className={cn(
            "h-16 border-b flex items-center justify-between px-4 lg:px-8 shrink-0 relative z-10",
          isDarkMode ? "bg-slate-900/80 border-slate-800" : "bg-white/80 border-slate-200",
          "backdrop-blur-md text-slate-900 dark:text-white"
        )}>
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => {
                if (window.innerWidth >= 1024) setIsSidebarOpen(!isSidebarOpen);
                else setIsMobileMenuOpen(true);
              }}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="Logo" className="w-7 h-7 rounded-lg shrink-0" />
              <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white lg:hidden">PreoCryptoFX</span>
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
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Balance</p>
              <p className="text-sm font-bold text-primary tabular-nums">
                ${(user?.activeAccount === 'REAL' ? user?.realBalance : user?.demoBalance)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors relative">
                <Bell size={20} className="text-slate-500 dark:text-slate-400" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-800"></span>
              </button>
              <Link to="/profile" className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                <UserIcon size={20} className="text-primary" />
              </Link>
            </div>
          </div>
        </header>
      </div>

      {/* Page Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      <Chatbot />
      <InstallInstructionsModal />
    </div>
  );
}
