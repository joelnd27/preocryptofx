import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  UserCheck, 
  TrendingUp, 
  Copy, 
  Check, 
  CheckCircle2,
  ExternalLink,
  Search,
  Filter,
  ArrowUpRight,
  Info,
  Link as LinkIcon
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { cn } from '../lib/utils';

export default function Referrals() {
  const { user, isDarkMode } = useStore();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Generate real referral link
  const referralLink = `https://preocryptofx.com/register?ref=${user?.referralCode || ''}`;

  const copyToClipboard = (text: string, isLink: boolean) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (isLink) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const referrals = user?.referrals || [];
  const totalReferred = referrals.length;
  const depositedCount = referrals.filter(r => r.hasDeposited).length;
  const totalDepositedAmount = referrals.reduce((sum, r) => sum + (r.totalDeposited || 0), 0);
  const conversionRate = totalReferred > 0 ? Math.round((depositedCount / totalReferred) * 100) : 0;

  const stats = [
    { 
      label: 'Total Referred', 
      value: totalReferred, 
      icon: Users, 
      color: 'blue',
      description: 'Total users signed up'
    },
    { 
      label: 'Deposited Money', 
      value: `$${totalDepositedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
      icon: UserCheck, 
      color: 'emerald',
      description: `From ${depositedCount} active referrals`
    },
  ];

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className={cn(
          "text-2xl font-bold tracking-tight",
          isDarkMode ? "text-white" : "text-slate-900"
        )}>Referral Dashboard</h1>
        <p className={isDarkMode ? "text-slate-400" : "text-slate-500"}>
          Track your referrals and earnings
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "p-5 sm:p-7 rounded-[28px] border relative overflow-hidden shadow-sm",
          isDarkMode ? "bg-slate-900/40 border-slate-800/80" : "bg-white border-slate-200"
        )}
      >
        <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
          <LinkIcon size={140} />
        </div>

        <div className="relative z-10 space-y-5 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <div className="w-9 h-9 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600">
                <LinkIcon size={18} />
              </div>
              <h2 className={cn(
                "text-base font-semibold",
                isDarkMode ? "text-white" : "text-slate-900"
              )}>Your Referral Link</h2>
            </div>
            
            <button
              onClick={() => copyToClipboard(referralLink, true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-95 shrink-0"
            >
              {copiedLink ? (
                <><Check size={16} /> Copied</>
              ) : (
                <><Copy size={16} /> Copy Link</>
              )}
            </button>
          </div>

          <div className={cn(
            "p-3.5 rounded-xl border font-mono text-[11px] sm:text-xs break-all leading-relaxed",
            isDarkMode ? "bg-slate-900/60 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500 shadow-inner"
          )}>
            {referralLink}
          </div>

          <div className="flex items-start gap-2 justify-center sm:justify-start">
            <Info size={14} className="text-blue-500/70 mt-0.5 shrink-0" />
            <p className={cn(
              "text-[11px] leading-relaxed",
              isDarkMode ? "text-slate-500" : "text-slate-400"
            )}>
              Share this link. You earn a referral when the user signs up <span className="font-semibold text-slate-400 dark:text-slate-300">AND</span> makes a successful deposit of at least $17.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn(
              "p-5 rounded-[28px] border flex flex-col gap-3",
              isDarkMode ? "bg-slate-900/40 border-slate-800/80" : "bg-white border-slate-200 shadow-sm"
            )}
          >
            <div className="flex items-center justify-between">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                stat.color === 'blue' ? "bg-blue-600/10 text-blue-600" :
                "bg-emerald-600/10 text-emerald-600"
              )}>
                <stat.icon size={20} />
              </div>
              <div className="text-right">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                )}>{stat.label}</span>
                <p className={cn(
                  "text-xl font-bold mt-0.5",
                  isDarkMode ? "text-white" : "text-slate-900"
                )}>{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Referral History Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={cn(
          "rounded-[28px] border overflow-hidden shadow-sm",
          isDarkMode ? "bg-slate-900/40 border-slate-800/80" : "bg-white border-slate-200"
        )}
      >
        <div className="p-5 border-b border-inherit flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className={cn(
            "text-base font-semibold",
            isDarkMode ? "text-white" : "text-slate-900"
          )}>Referral History</h2>
          
          <div className="flex items-center gap-2">
            <div className={cn(
              "relative flex-1 sm:w-64",
              isDarkMode ? "text-slate-500" : "text-slate-400"
            )}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} />
              <input 
                type="text" 
                placeholder="Search user..."
                className={cn(
                  "w-full pl-9 pr-4 py-2 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                  isDarkMode ? "bg-slate-800/50 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                )}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={isDarkMode ? "bg-slate-800/30" : "bg-slate-50/50"}>
                <th className={cn(
                  "px-6 py-3 text-[10px] font-bold uppercase tracking-[0.1em]",
                  isDarkMode ? "text-slate-600" : "text-slate-400"
                )}>User</th>
                <th className={cn(
                  "px-6 py-3 text-[10px] font-bold uppercase tracking-[0.1em]",
                  isDarkMode ? "text-slate-600" : "text-slate-400"
                )}>Joined</th>
                <th className={cn(
                  "px-6 py-3 text-[10px] font-bold uppercase tracking-[0.1em]",
                  isDarkMode ? "text-slate-600" : "text-slate-400"
                )}>Status</th>
                <th className={cn(
                  "px-6 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-right",
                  isDarkMode ? "text-slate-600" : "text-slate-400"
                )}>Total Deposited</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-inherit">
              {referrals.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center mb-1",
                        isDarkMode ? "bg-slate-800 text-slate-700" : "bg-slate-100 text-slate-200"
                      )}>
                        <Users size={24} />
                      </div>
                      <p className={cn(
                        "text-xs font-medium",
                        isDarkMode ? "text-slate-600" : "text-slate-400"
                      )}>
                        No referrals yet. Share your link to start earning!
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                referrals.map((ref) => (
                  <tr key={ref.userId} className={cn(
                    "transition-colors group",
                    isDarkMode ? "hover:bg-slate-800/20" : "hover:bg-slate-50"
                  )}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                          {ref.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className={cn(
                            "text-sm font-semibold truncate",
                            isDarkMode ? "text-slate-200" : "text-slate-900"
                          )}>{ref.username}</span>
                          <span className={cn(
                            "text-[10px] truncate",
                            isDarkMode ? "text-slate-500" : "text-slate-400"
                          )}>{ref.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-xs",
                        isDarkMode ? "text-slate-500" : "text-slate-500"
                      )}>
                        {new Date(ref.joinedAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 font-bold text-[10px] px-2 py-1 rounded-lg",
                        ref.hasDeposited 
                          ? (isDarkMode ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600")
                          : (isDarkMode ? "bg-slate-800/50 text-slate-500" : "bg-slate-100 text-slate-500")
                      )}>
                        {ref.hasDeposited ? (
                          <><CheckCircle2 size={12} className="stroke-[3]" /> Deposited</>
                        ) : (
                          "No Deposit"
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-xs">
                      <span className={isDarkMode ? "text-slate-300" : "text-slate-700"}>
                        ${(ref.totalDeposited || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
