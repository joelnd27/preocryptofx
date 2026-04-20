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
import AdminPanel from './pages/AdminPanel.tsx';
import Verification from './pages/Verification.tsx';
import DashboardLayout from './components/DashboardLayout.tsx';
import Chatbot from './components/Chatbot.tsx';
import AlertModal from './components/AlertModal.tsx';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user } = useStore();
  if (!user) return <Navigate to="/login" />;
  const isAdmin = user.role === 'admin';
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" />;
  return <>{children}</>;
}

function AdminRedirector({ children }: { children: React.ReactNode }) {
  const { user } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user?.role === 'admin' && location.pathname === '/dashboard') {
      navigate('/admin', { replace: true });
    }
  }, [user?.role, location.pathname, navigate]);

  return <>{children}</>;
}

export default function App() {
  const { user } = useStore();
  const isAdmin = user?.role === 'admin';
  const [alertConfig, setAlertConfig] = React.useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'success' as 'success' | 'error' | 'info' | 'warning'
  });

  useEffect(() => {
    const handleVerificationSuccess = () => {
      setAlertConfig({
        isOpen: true,
        title: 'Account Verified!',
        message: 'Your account has been successfully verified. You now have full access to all features.',
        type: 'success'
      });
    };

    window.addEventListener('verification-success', handleVerificationSuccess);
    return () => window.removeEventListener('verification-success', handleVerificationSuccess);
  }, []);

  return (
    <Router>
      <AdminRedirector>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={!user ? <Login /> : <Navigate to={isAdmin ? "/admin" : "/dashboard"} />} />
          <Route path="/register" element={!user ? <Register /> : <Navigate to={isAdmin ? "/admin" : "/dashboard"} />} />
          <Route path="/verify" element={user ? <Verification /> : <Navigate to="/login" />} />
          
          {/* Protected Routes */}
          <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
          <Route path="/trade" element={<ProtectedRoute><DashboardLayout><Trade /></DashboardLayout></ProtectedRoute>} />
          <Route path="/bots" element={<ProtectedRoute><DashboardLayout><Bots /></DashboardLayout></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute><DashboardLayout><Transactions /></DashboardLayout></ProtectedRoute>} />
          <Route path="/trades" element={<ProtectedRoute><DashboardLayout><AllTrades /></DashboardLayout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><DashboardLayout><Profile /></DashboardLayout></ProtectedRoute>} />
          <Route path="/help" element={<ProtectedRoute><DashboardLayout><Help /></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><DashboardLayout><AdminPanel /></DashboardLayout></ProtectedRoute>} />
        </Routes>
      </AdminRedirector>
      
      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />
      
      <Chatbot />
    </Router>
  );
}
