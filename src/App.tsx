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
import Profile from './pages/Profile.tsx';
import Help from './pages/Help.tsx';
import Referrals from './pages/Referrals.tsx';
import AdminPanel from './pages/AdminPanel.tsx';
import Verification from './pages/Verification.tsx';
import DashboardLayout from './components/DashboardLayout.tsx';
import AlertModal from './components/AlertModal.tsx';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user } = useStore();
  
  if (!user) return <Navigate to="/login" />;
  
  const isAdmin = user?.email === 'wren20688@gmail.com' && user?.id === '304020c9-3695-4f8f-85fe-9ee12eda8152';
  
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" />;
  
  return <>{children}</>;
}

function AdminRedirector({ children }: { children: React.ReactNode }) {
  const { user } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const isAdmin = user?.email === 'wren20688@gmail.com' && user?.id === '304020c9-3695-4f8f-85fe-9ee12eda8152';
    if (isAdmin && location.pathname === '/dashboard') {
      navigate('/admin', { replace: true });
    }
  }, [user?.email, user?.id, location.pathname, navigate]);

  return <>{children}</>;
}

import PWAInstallBanner from './components/PWAInstallBanner.tsx';

export default function App() {
  const { user, resetDemoBalance } = useStore();
  const isAdmin = user?.email === 'wren20688@gmail.com' && user?.id === '304020c9-3695-4f8f-85fe-9ee12eda8152';
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
      <div className="flex flex-col min-h-screen">
        <PWAInstallBanner />
        <div className="flex-1 overflow-x-hidden">
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
              <Route path="/transactions" element={<ProtectedRoute><DashboardLayout><Transactions /></DashboardLayout></ProtectedRoute>} />
              <Route path="/trades" element={<ProtectedRoute><DashboardLayout><AllTrades /></DashboardLayout></ProtectedRoute>} />
              <Route path="/referrals" element={<ProtectedRoute><DashboardLayout><Referrals /></DashboardLayout></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><DashboardLayout><Profile /></DashboardLayout></ProtectedRoute>} />
              <Route path="/help" element={<ProtectedRoute><DashboardLayout><Help /></DashboardLayout></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute adminOnly><DashboardLayout><AdminPanel /></DashboardLayout></ProtectedRoute>} />
            </Routes>
          </AdminRedirector>
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

