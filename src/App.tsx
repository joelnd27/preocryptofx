/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './context/StoreContext.tsx';
import Landing from './pages/Landing.tsx';
import Login from './pages/Login.tsx';
import Register from './pages/Register.tsx';
import Dashboard from './pages/Dashboard.tsx';
import Trade from './pages/Trade.tsx';
import Bots from './pages/Bots.tsx';
import Transactions from './pages/Transactions.tsx';
import AllTrades from './pages/AllTrades.tsx';
import CopyTrading from './pages/CopyTrading.tsx';
import Profile from './pages/Profile.tsx';
import Help from './pages/Help.tsx';
import Referrals from './pages/Referrals.tsx';
import AdminPanel from './pages/AdminPanel.tsx';
import Verification from './pages/Verification.tsx';
import DashboardLayout from './components/DashboardLayout.tsx';
import AlertModal from './components/AlertModal.tsx';

class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string }> {
  declare props: { children: React.ReactNode };
  declare state: { hasError: boolean; message: string };
  declare setState: (state: { hasError: boolean; message: string }) => void;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unexpected rendering error' };
  }

  componentDidCatch(error: Error) {
    console.error('[App] Route ErrorBoundary caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-white">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
            <h2 className="text-lg font-bold">Something went wrong</h2>
            <p className="text-xs text-slate-400">{this.state.message}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-bold text-white transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user } = useStore();
  
  if (!user) return <Navigate to="/login" />;
  
  const isAdmin = ['wren20688@gmail.com', 'josphatndungu1022@gmail.com'].includes((user?.email || '').toLowerCase());
  
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" />;
  
  return <>{children}</>;
}

function AdminRedirector({ children }: { children: React.ReactNode }) {
  const { user } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const isAdmin = ['wren20688@gmail.com', 'josphatndungu1022@gmail.com'].includes((user?.email || '').toLowerCase());
    if (isAdmin && location.pathname === '/dashboard') {
      navigate('/admin', { replace: true });
    }
  }, [user?.email, user?.id, location.pathname, navigate]);

  return <>{children}</>;
}

import PWAInstallBanner from './components/PWAInstallBanner.tsx';

export default function App() {
  const { user, resetDemoBalance } = useStore();
  const isAdmin = ['wren20688@gmail.com', 'josphatndungu1022@gmail.com'].includes((user?.email || '').toLowerCase());
  const [alertConfig, setAlertConfig] = React.useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'success' as 'success' | 'error' | 'info' | 'warning'
  });

  useEffect(() => {
    const handleBalanceReset = (e: any) => {
      setAlertConfig({
        isOpen: true,
        title: e.detail.title,
        message: e.detail.message,
        type: e.detail.type
      });
    };

    const handleVerificationSuccess = () => {
      setAlertConfig({
        isOpen: true,
        title: 'Account Verified!',
        message: 'Your account has been successfully verified. You now have full access to all features.',
        type: 'success'
      });
      // Optional: Force a small refresh of the user state if needed, 
      // but useStore already updates the user state.
    };

    window.addEventListener('balance-reset', handleBalanceReset);
    window.addEventListener('verification-success', handleVerificationSuccess);
    return () => {
      window.removeEventListener('balance-reset', handleBalanceReset);
      window.removeEventListener('verification-success', handleVerificationSuccess);
    };
  }, []);

  return (
    <Router>
      <div className="flex flex-col h-full">
        <PWAInstallBanner />
        <div className="flex-1 overflow-x-hidden overflow-y-auto min-h-0">
          <RouteErrorBoundary>
            <AdminRedirector>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={!user ? <Login /> : <Navigate to={isAdmin ? "/admin" : "/dashboard"} />} />
                <Route path="/register" element={!user ? <Register /> : <Navigate to={isAdmin ? "/admin" : "/dashboard"} />} />
                <Route path="/auth" element={!user ? <Register /> : <Navigate to={isAdmin ? "/admin" : "/dashboard"} />} />
                <Route path="/verify" element={user ? <Verification /> : <Navigate to="/login" />} />
                
                {/* Protected Routes */}
                <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
                <Route path="/trade" element={<ProtectedRoute><DashboardLayout><Trade /></DashboardLayout></ProtectedRoute>} />
                <Route path="/bots" element={<ProtectedRoute><DashboardLayout><Bots /></DashboardLayout></ProtectedRoute>} />
                <Route path="/copy-trading" element={<ProtectedRoute><DashboardLayout><CopyTrading /></DashboardLayout></ProtectedRoute>} />
                <Route path="/transactions" element={<ProtectedRoute><DashboardLayout><Transactions /></DashboardLayout></ProtectedRoute>} />
                <Route path="/trades" element={<ProtectedRoute><DashboardLayout><AllTrades /></DashboardLayout></ProtectedRoute>} />
                <Route path="/referrals" element={<ProtectedRoute><DashboardLayout><Referrals /></DashboardLayout></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><DashboardLayout><Profile /></DashboardLayout></ProtectedRoute>} />
                <Route path="/help" element={<ProtectedRoute><DashboardLayout><Help /></DashboardLayout></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute adminOnly><DashboardLayout><AdminPanel /></DashboardLayout></ProtectedRoute>} />
              </Routes>
            </AdminRedirector>
          </RouteErrorBoundary>
        </div>
      </div>
      
      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />
      
    </Router>
  );
}

