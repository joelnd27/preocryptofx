import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle2, Eye, EyeOff, Users } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { cn } from '../lib/utils';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+254');
  const [countryFlag, setCountryFlag] = useState('🇰🇪');
  const [password, setPassword] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');

  const [searchParams] = useSearchParams();
  const refCodeFromUrl = searchParams.get('ref') || searchParams.get('referral');

  // Detect country on mount
  React.useEffect(() => {
    console.log('[Register] Component mounted. Ref code from URL:', refCodeFromUrl);
    if (refCodeFromUrl) {
      setReferralCodeInput(refCodeFromUrl);
    }
    const detectCountry = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_calling_code) {
          setPhone(data.country_calling_code);
          // Try to get country flag emoji if available
          if (data.country_code) {
            const codePoints = data.country_code
              .toUpperCase()
              .split('')
              .map((char: string) => 127397 + char.charCodeAt(0));
            setCountryFlag(String.fromCodePoint(...codePoints));
          }
        }
      } catch (err) {
        console.error('Country detection failed:', err);
      }
    };
    detectCountry();
  }, []);

  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const [role, setRole] = useState<'user' | 'marketer'>('user');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register, isDarkMode } = useStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await register(username, email, password, role, phone, referralCodeInput || undefined);
      setSuccess(true);
      // Wait a bit before navigating to let them see the success message
      setTimeout(() => navigate('/dashboard'), 2000);
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
          )}>Create Account</h1>
          <p className={cn(
            "mt-2",
            isDarkMode ? "text-slate-400" : "text-slate-500"
          )}>Join the future of automated crypto trading</p>
        </div>

        <div className={cn(
          "backdrop-blur-xl border p-8 rounded-3xl shadow-2xl transition-all",
          isDarkMode ? "bg-slate-900/50 border-slate-800" : "bg-white/80 border-slate-200"
        )}>
          {success ? (
            <div className="text-center space-y-6 py-8">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto text-green-500">
                <CheckCircle2 size={40} />
              </div>
              <div className="space-y-2">
                <h2 className={cn(
                  "text-2xl font-bold",
                  isDarkMode ? "text-white" : "text-slate-900"
                )}>Registration Successful!</h2>
                <p className={isDarkMode ? "text-slate-400" : "text-slate-500"}>Redirecting you to the dashboard...</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
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
              )}>Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={cn(
                    "w-full border rounded-xl py-3 pl-12 pr-4 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500",
                    isDarkMode ? "bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
                  )}
                  placeholder="Enter your full name"
                />
              </div>
            </div>

            <div className={cn(
              "space-y-2 p-3 rounded-2xl border transition-all",
              referralCodeInput ? "bg-blue-600/5 border-blue-500/40 shadow-sm shadow-blue-500/10" : (isDarkMode ? "bg-slate-800/30 border-slate-700/50" : "bg-slate-50 border-slate-200")
            )}>
              <label className={cn(
                "text-sm font-medium ml-1 flex items-center gap-2",
                isDarkMode ? "text-slate-300" : "text-slate-700"
              )}>
                <Users size={14} className={cn(referralCodeInput ? "text-blue-500" : "text-slate-500")} />
                Referral Code {referralCodeInput ? "" : "(optional)"}
              </label>
              <div className="relative">
                <Users className={cn(
                  "absolute left-4 top-1/2 -translate-y-1/2 transition-colors",
                  referralCodeInput ? "text-blue-500" : "text-slate-500"
                )} size={20} />
                <input
                  type="text"
                  value={referralCodeInput}
                  onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                  className={cn(
                    "w-full border rounded-xl py-3 pl-12 pr-4 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono",
                    isDarkMode ? "bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
                  )}
                  placeholder="MKT-XXXXX"
                />
                {referralCodeInput && (
                   <CheckCircle2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500 animate-in fade-in zoom-in" />
                )}
              </div>
              {referralCodeInput && (
                <p className="text-[10px] text-blue-500 font-bold ml-1 flex items-center gap-1 mt-1">
                   Applied Successfully
                </p>
              )}
            </div>

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
              <label className={cn(
                "text-sm font-medium ml-1",
                isDarkMode ? "text-slate-300" : "text-slate-700"
              )}>Phone Number</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">
                  <span className="flex items-center gap-1">{countryFlag}</span>
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={cn(
                    "w-full border rounded-xl py-3 pl-12 pr-4 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500",
                    isDarkMode ? "bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
                  )}
                  placeholder="Enter phone number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={cn(
                "text-sm font-medium ml-1",
                isDarkMode ? "text-slate-300" : "text-slate-700"
              )}>Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onFocus={() => setShowPasswordRequirements(true)}
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
                                : isDarkMode ? "bg-slate-800" : "bg-slate-100"
                            )}
                          />
                        );
                      })}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <RequirementItem met={password.length >= 8} text="At least 8 characters" isDarkMode={isDarkMode} />
                      <RequirementItem met={/[A-Z]/.test(password)} text="One uppercase letter" isDarkMode={isDarkMode} />
                      <RequirementItem met={/[0-9]/.test(password)} text="1 Number" isDarkMode={isDarkMode} />
                      <RequirementItem met={/[^A-Za-z0-9]/.test(password)} text="1 Symbol" isDarkMode={isDarkMode} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-start gap-3 px-1">
              <div className="mt-1">
                <CheckCircle2 size={14} className="text-blue-500" />
              </div>
              <p className={cn(
                "text-xs",
                isDarkMode ? "text-slate-400" : "text-slate-500"
              )}>
                By creating an account, you agree to our <a href="#" className="text-blue-600">Terms of Service</a> and <a href="#" className="text-blue-600">Privacy Policy</a>.
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

          <div className={cn(
            "mt-8 pt-8 border-t text-center",
            isDarkMode ? "border-slate-800" : "border-slate-100"
          )}>
            <p className="text-slate-500 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 font-bold hover:text-blue-600">Sign In</Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function RequirementItem({ met, text, isDarkMode }: { met: boolean; text: string; isDarkMode: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors",
        met ? "bg-green-500/20 text-green-500" : isDarkMode ? "bg-slate-800 text-slate-600" : "bg-slate-100 text-slate-400"
      )}>
        <CheckCircle2 size={10} />
      </div>
      <span className={cn(
        "text-[10px] font-bold tracking-wider transition-colors",
        met ? (isDarkMode ? "text-slate-300" : "text-slate-600") : "text-slate-500"
      )}>
        {text}
      </span>
    </div>
  );
}
