import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext.tsx';
import { 
  BarChart3, 
  Wallet, 
  Bot, 
  LayoutDashboard, 
  History, 
  User, 
  LogOut, 
  Menu, 
  X,
  Bell,
  HelpCircle,
  ShieldCheck,
  TrendingUp,
  Cpu,
  ArrowUpCircle,
  ArrowDownCircle,
  MoreVertical,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const menuItems = [
    { name: 'Overview', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Trade', icon: TrendingUp, path: '/trade' },
    { name: 'Bots', icon: Bot, path: '/bots' },
    { name: 'Transactions', icon: Wallet, path: '/transactions' },
    { name: 'Trades', icon: History, path: '/trades' },
    { name: 'Profile', icon: User, path: '/profile' },
    { name: 'Help', icon: HelpCircle, path: '/help' },
  ];

  // Add Admin item if user is admin
  const isAdmin = user?.role === 'admin';
  if (isAdmin) {
    // Insert at index 1 (after Overview)
    menuItems.splice(1, 0, { name: 'Admin', icon: ShieldCheck, path: '/admin' });
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const currentPath = location.pathname;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Mobile Top Navigation */}
      <div className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#0a0a0a] fixed top-0 w-full z-50">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">PreoCryptoFX</span>
        </Link>
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors border border-gray-800"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 bg-[#0a0a0a] border-r border-gray-800 fixed h-full z-40">
        <div className="p-8">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold block tracking-tight">PreoCryptoFX</span>
              <span className="text-xs text-blue-500 font-medium uppercase tracking-wider">Trading Engine</span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => {
            const isActive = currentPath === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all group ${
                  isActive 
                    ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className={`p-2 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'bg-gray-800 group-hover:bg-gray-700'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="font-medium">{item.name}</span>
                {isActive && (
                  <motion.div 
                    layoutId="sidebar-active"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-gray-800 bg-[#0c0c0c]">
          <div className="bg-[#121212] rounded-2xl p-4 border border-gray-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2">
              <div className={`w-2 h-2 rounded-full ${user?.verificationStatus === 'verified' ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white font-bold border border-gray-600">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{user?.username}</p>
                <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl text-sm font-bold transition-all border border-red-500/20 group-hover:border-red-500"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-[280px] bg-[#0a0a0a] border-r border-gray-800 z-[70] lg:hidden flex flex-col"
            >
              <div className="p-6 flex items-center justify-between border-b border-gray-800">
                <Link to="/dashboard" className="flex items-center gap-2" onClick={() => setIsSidebarOpen(false)}>
                  <BarChart3 className="w-6 h-6 text-blue-500" />
                  <span className="text-xl font-bold">PreoCryptoFX</span>
                </Link>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-gray-800 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
                {menuItems.map((item) => {
                  const isActive = currentPath === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsSidebarOpen(false)}
                      className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-all ${
                        isActive 
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                          : 'text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium text-lg">{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="p-6 border-t border-gray-800">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-red-600 text-white rounded-xl font-bold"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="lg:ml-72 min-h-screen pt-[72px] lg:pt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          {children}
        </div>
      </main>
    </div>
  );
}
