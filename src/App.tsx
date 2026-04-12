/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
import DashboardLayout from './components/DashboardLayout.tsx';

export default function App() {
  const { user } = useStore();
  const isAdmin = user?.role === 'admin';

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={!user ? <Login /> : <Navigate to={isAdmin ? "/admin" : "/dashboard"} />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to={isAdmin ? "/admin" : "/dashboard"} />} />
        
        {/* Protected Routes */}
        <Route path="/dashboard" element={user ? (isAdmin ? <Navigate to="/admin" /> : <DashboardLayout><Dashboard /></DashboardLayout>) : <Navigate to="/login" />} />
        <Route path="/trade" element={user ? <DashboardLayout><Trade /></DashboardLayout> : <Navigate to="/login" />} />
        <Route path="/bots" element={user ? <DashboardLayout><Bots /></DashboardLayout> : <Navigate to="/login" />} />
        <Route path="/transactions" element={user ? <DashboardLayout><Transactions /></DashboardLayout> : <Navigate to="/login" />} />
        <Route path="/trades" element={user ? <DashboardLayout><AllTrades /></DashboardLayout> : <Navigate to="/login" />} />
        <Route path="/profile" element={user ? <DashboardLayout><Profile /></DashboardLayout> : <Navigate to="/login" />} />
        <Route path="/help" element={user ? <DashboardLayout><Help /></DashboardLayout> : <Navigate to="/login" />} />
        <Route path="/admin" element={user && isAdmin ? <DashboardLayout><AdminPanel /></DashboardLayout> : <Navigate to="/dashboard" />} />
      </Routes>
    </Router>
  );
}

