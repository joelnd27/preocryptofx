import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, ArrowRight, AlertCircle, Shield } from 'lucide-react';
import { useStore } from '../context/StoreContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdminReset, setShowAdminReset] = useState(false);
  const { login } = useStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowAdminReset(false);
    setLoading(true);
    
    try {
      await login(email, password);
      const isAdmin = email.includes('admin'); // This is just a hint for the UI, real role comes from DB
      navigate(isAdmin ? '/admin' : '/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message.includes('rate limit exceeded')) {
        setError('Security limit reached. Please wait 15 minutes or disable "Rate Limits" in your Supabase Auth settings.');
      } else if (err.message === 'Invalid login credentials') {
        setError('Invalid email or password. Please check your credentials.');
        // Show admin reset helper if it looks like an admin attempt
        if (email.toLowerCase().includes('admin') || email.toLowerCase().includes('wren')) {
          setShowAdminReset(true);
          setError('Admin login failed. Please ensure your email is confirmed in Supabase and your password is correct.');
        }
      } else {
        setError(err.message || 'An error occurred during login.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-400/10 blur-[120px] rounded-full"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-xl text-white">P</div>
            <span className="text-2xl font-bold text-white">PreoCryptoFX</span>
          </Link>
          <h1 className="text-3xl font-bold text-white">Welcome Back</h1>
          <p className="text-slate-400 mt-2">Enter your credentials to access your account</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="space-y-4">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
                  <AlertCircle size={18} />
                  {error}
                </div>
                
                {showAdminReset && (
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-3">
                    <p className="text-xs text-blue-400 font-bold flex items-center gap-2">
                      <Shield size={14} /> Admin Reset Helper
                    </p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      If you've forgotten your admin password, you must reset your account in Supabase to register again. 
                      Copy the code below and run it in your Supabase SQL Editor:
                    </p>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <code className="text-[9px] text-blue-300 block whitespace-pre overflow-x-auto">
                        {`DELETE FROM auth.users WHERE email = '${email.toLowerCase()}';\nDELETE FROM public.users WHERE email = '${email.toLowerCase()}';`}
                      </code>
                    </div>
                    <Link 
                      to="/register" 
                      className="block text-center py-2 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded-lg hover:bg-blue-600/30 transition-all"
                    >
                      Go to Register after running code
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-sm font-medium text-slate-300">Password</label>
                <a href="#" className="text-xs text-blue-400 hover:text-blue-300">Forgot password?</a>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-800 text-center">
            <p className="text-slate-400 text-sm">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-400 font-bold hover:text-blue-300">Create Account</Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
