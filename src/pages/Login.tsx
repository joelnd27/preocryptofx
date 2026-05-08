import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, ArrowRight, AlertCircle, Shield, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { cn } from '../lib/utils';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isDarkMode } = useStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await login(email, password);
      // STRICT: Only redirect to admin if the email matches the authorized list exactly
      const adminEmails = ['josphatndungu122@gmail.com', 'josphatndungu1022@gmail.com'];
      const isAdmin = adminEmails.includes(email.toLowerCase());
      navigate(isAdmin ? '/admin' : '/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message.includes('rate limit exceeded')) {
        setError('Security limit reached. Please wait 15 minutes or disable "Rate Limits" in your Supabase Auth settings.');
      } else if (err.message === 'Invalid login credentials' || err.message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please check your credentials.');
      } else {
        setError('Invalid email or password. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen flex items-center justify-center p-6 transition-colors duration-300",
      isDarkMode ? "bg-slate-950" : "bg-slate-50"
    )}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={cn(
          "absolute top-1/4 left-1/4 w-96 h-96 blur-[120px] rounded-full",
          isDarkMode ? "bg-blue-600/10" : "bg-blue-400/20"
        )}></div>
        <div className={cn(
          "absolute bottom-1/4 right-1/4 w-96 h-96 blur-[120px] rounded-full",
          isDarkMode ? "bg-cyan-400/10" : "bg-blue-200/20"
        )}></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <img src="/favicon.svg" alt="PreoCryptoFX Logo" className="w-10 h-10" />
            <span className={cn(
              "text-2xl font-bold",
              isDarkMode ? "text-white" : "text-slate-900"
            )}>PreoCryptoFX</span>
          </Link>
          <h1 className={cn(
            "text-3xl font-bold",
            isDarkMode ? "text-white" : "text-slate-900"
          )}>Welcome Back</h1>
          <p className={cn(
            "mt-2",
            isDarkMode ? "text-slate-400" : "text-slate-500"
          )}>Enter your credentials to access your account</p>
        </div>

        <div className={cn(
          "backdrop-blur-xl border p-8 rounded-3xl shadow-2xl transition-all",
          isDarkMode ? "bg-slate-900/50 border-slate-800" : "bg-white/80 border-slate-200"
        )}>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className={cn(
                "text-sm font-medium ml-1",
                isDarkMode ? "text-slate-300" : "text-slate-700"
              )}>Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn(
                    "w-full border rounded-xl py-3 pl-12 pr-4 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500",
                    isDarkMode ? "bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
                  )}
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className={cn(
                  "text-sm font-medium",
                  isDarkMode ? "text-slate-300" : "text-slate-700"
                )}>Password</label>
                <a href="#" className="text-xs text-blue-600 hover:text-blue-500">Forgot password?</a>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    "w-full border rounded-xl py-3 pl-12 pr-12 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500",
                    isDarkMode ? "bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
                  )}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
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

          <div className={cn(
            "mt-8 pt-8 border-t text-center",
            isDarkMode ? "border-slate-800" : "border-slate-100"
          )}>
            <p className="text-slate-500 text-sm">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-600 font-bold hover:text-blue-500">Create Account</Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
