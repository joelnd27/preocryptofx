import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { cn } from '../lib/utils';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+254');
  const [password, setPassword] = useState('');
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const [role, setRole] = useState<'user' | 'marketer'>('user');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      // PREVENT MALICIOUS REGISTRATIONS
      const blacklist = ['iamofsec@gmail.com', 'iamofsec'];
      const isBlacklisted = blacklist.some(b => 
        email.toLowerCase().includes(b) || username.toLowerCase().includes(b)
      );

      if (isBlacklisted) {
        throw new Error('Registration failed. Please contact support or use a valid email.');
      }

      await register(username, email, password, role, phone);
      setSuccess(true);
      // STRICT: Only redirect to admin if the email matches the authorized list exactly
      const adminEmails = ['wren20688@gmail.com'];
      const isAdmin = adminEmails.includes(email.toLowerCase());
      // Wait a bit before navigating to let them see the success message
      setTimeout(() => navigate(isAdmin ? '/admin' : '/dashboard'), 2000);
    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.message.includes('rate limit exceeded')) {
        setError('Security limit reached. Please wait 15 minutes or disable "Rate Limits" in your Supabase Auth settings.');
      } else {
        setError(err.message || 'An error occurred during registration.');
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
          <h1 className="text-3xl font-bold text-white">Create Account</h1>
          <p className="text-slate-400 mt-2">Join the future of automated crypto trading</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl">
          {success ? (
            <div className="text-center space-y-6 py-8">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto text-green-500">
                <CheckCircle2 size={40} />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Registration Successful!</h2>
                <p className="text-slate-400">Redirecting you to the dashboard...</p>
              </div>
              <p className="text-xs text-slate-500">
                Note: If you don't see your dashboard, please check your email for a confirmation link.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="John Doe"
                />
              </div>
            </div>

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
              <label className="text-sm font-medium text-slate-300 ml-1">Phone Number</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">
                  <span className="flex items-center gap-1">🇰🇪</span>
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="+254 700 000 000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="password"
                  required
                  value={password}
                  onFocus={() => setShowPasswordRequirements(true)}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="••••••••"
                />
              </div>

              {/* Password Strength Meter & Requirements */}
              <AnimatePresence>
                {showPasswordRequirements && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 pt-1 overflow-hidden"
                  >
                    <div className="flex gap-1 h-1.5">
                      {[1, 2, 3, 4].map((step) => {
                        const strength = 
                          (password.length >= 8 ? 1 : 0) +
                          (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password) ? 1 : 0) +
                          (/[A-Z]/.test(password) ? 1 : 0) +
                          (password.length >= 12 ? 1 : 0);
                        
                        return (
                          <div 
                            key={step}
                            className={cn(
                              "flex-1 rounded-full transition-all duration-500",
                              step <= strength 
                                ? strength <= 1 ? "bg-red-500" : strength <= 2 ? "bg-yellow-500" : "bg-green-500"
                                : "bg-slate-800"
                            )}
                          />
                        );
                      })}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <RequirementItem met={password.length >= 8} text="8+ characters" />
                      <RequirementItem met={/[A-Z]/.test(password)} text="1 capital letter" />
                      <RequirementItem met={/[0-9]/.test(password)} text="1 number" />
                      <RequirementItem met={/[^A-Za-z0-9]/.test(password)} text="1 symbol" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-start gap-3 px-1">
              <div className="mt-1">
                <CheckCircle2 size={14} className="text-blue-500" />
              </div>
              <p className="text-xs text-slate-400">
                By creating an account, you agree to our <a href="#" className="text-blue-400">Terms of Service</a> and <a href="#" className="text-blue-400">Privacy Policy</a>.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Create Account <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>
          </form>
        )}

          <div className="mt-8 pt-8 border-t border-slate-800 text-center">
            <p className="text-slate-400 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-400 font-bold hover:text-blue-300">Sign In</Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors",
        met ? "bg-green-500/20 text-green-500" : "bg-slate-800 text-slate-600"
      )}>
        <CheckCircle2 size={10} />
      </div>
      <span className={cn(
        "text-[10px] font-bold uppercase tracking-wider transition-colors",
        met ? "text-slate-300" : "text-slate-500"
      )}>
        {text}
      </span>
    </div>
  );
}
