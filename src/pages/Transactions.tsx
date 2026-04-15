import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  Search, 
  Filter,
  History,
  CheckCircle2,
  Clock,
  X,
  XCircle,
  CreditCard,
  Wallet,
  Smartphone,
  Info,
  ChevronRight,
  DollarSign,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatCurrency, cn } from '../lib/utils';
import { USD_TO_KES, MIN_DEPOSIT_USD, MIN_WITHDRAWAL_USD, WITHDRAWAL_EXCHANGE_RATE } from '../types.ts';
import AlertModal from '../components/AlertModal';

export default function Transactions() {
  const { user, addTransaction, processPayheroDeposit, failLatestDeposit, checkPaymentStatus, refreshData, adminCreditUser } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [paymentMethod, setPaymentMethod] = useState<'MPESA'>('MPESA');
  const [withdrawalMethod, setWithdrawalMethod] = useState<'MPESA' | 'BANK'>('MPESA');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [currentTxRef, setCurrentTxRef] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'IDLE' | 'WAITING' | 'SUCCESS' | 'FAILED' | 'REJECTED' | 'CANCELLED' | 'VERIFYING'>('IDLE');
  const [timeLeft, setTimeLeft] = useState(30);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAW'>('ALL');
  const [currentWithdrawalRate, setCurrentWithdrawalRate] = useState(WITHDRAWAL_EXCHANGE_RATE);
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'error' | 'success' | 'info' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  useEffect(() => {
    // Slightly randomize withdrawal rate between 125 and 128
    const rate = 125 + (Math.random() * 3);
    setCurrentWithdrawalRate(Number(rate.toFixed(2)));
  }, [isModalOpen]);

  // Automatically detect when a pending transaction is completed via real-time sync
  useEffect(() => {
    if ((paymentStatus === 'WAITING' || paymentStatus === 'VERIFYING') && user?.transactions && currentTxRef) {
      // Find the specific transaction we are waiting for
      const targetTx = user.transactions.find(t => t.externalId === currentTxRef || t.id === currentTxRef);
        
      if (targetTx) {
        if (targetTx.status === 'completed') {
          setPaymentStatus('SUCCESS');
          setCurrentTxRef(null);
        } else if (targetTx.status === 'failed' || targetTx.status === 'rejected') {
          setPaymentStatus('FAILED');
          setErrorMessage('Transaction failed, was rejected, or was cancelled.');
          setCurrentTxRef(null);
        }
      }
    }
  }, [user?.transactions, paymentStatus, currentTxRef]);

  // Poll for status updates while waiting
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    if (paymentStatus === 'WAITING' || paymentStatus === 'VERIFYING') {
      pollInterval = setInterval(() => {
        refreshData();
      }, 5000);
    }
    return () => clearInterval(pollInterval);
  }, [paymentStatus, refreshData]);

  // Handle 30-second timeout for deposits
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (paymentStatus === 'WAITING') {
      setTimeLeft(30);
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setPaymentStatus('VERIFYING');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (paymentStatus === 'VERIFYING') {
      // Give verification another 30 seconds before failing
      setTimeLeft(30);
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setPaymentStatus('FAILED');
            setErrorMessage('Verification timed out. If you have paid, please click "Check Status" in your Activity Log.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [paymentStatus]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    // Handle both number timestamps and ISO strings
    const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
    if (isNaN(date.getTime())) {
      // Try parsing as number if it's a string number
      const num = Number(timestamp);
      if (!isNaN(num)) return new Date(num).toLocaleString();
      return 'Invalid Date';
    }
    return date.toLocaleString();
  };

  const filteredTransactions = (user?.transactions || [])
    .filter(tx => {
      const matchesSearch = tx.id.toLowerCase().includes(search.toLowerCase()) || 
                           tx.type.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === 'ALL' || tx.type === filter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod !== 'MPESA' && modalType === 'DEPOSIT') return;
    
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return;

    if (modalType === 'DEPOSIT') {
      if (user?.verificationStatus !== 'verified') {
        setAlertConfig({
          isOpen: true,
          title: 'Verification Required',
          message: 'Please verify your account in the Profile section before making a deposit.',
          type: 'warning'
        });
        return;
      }

      if (paymentMethod !== 'MPESA') {
        setAlertConfig({
          isOpen: true,
          title: 'Method Not Supported',
          message: 'Currently only M-Pesa is supported for deposits.',
          type: 'info'
        });
        return;
      }
      
      if (user?.activeAccount === 'DEMO') {
        setAlertConfig({
          isOpen: true,
          title: 'Real Account Required',
          message: 'Deposits are only available for REAL accounts. Demo accounts use virtual funds.',
          type: 'warning'
        });
        return;
      }

      if (val < MIN_DEPOSIT_USD) {
        setAlertConfig({
          isOpen: true,
          title: 'Minimum Deposit',
          message: `The minimum deposit amount is $${MIN_DEPOSIT_USD}.`,
          type: 'info'
        });
        return;
      }

      setIsProcessing(true);
      setPaymentStatus('WAITING');
      setErrorMessage(null);
      try {
        const result = await processPayheroDeposit(val, phone);
        if (result) {
          if (typeof result === 'string') {
            setCurrentTxRef(result);
          }
          setPaymentStatus('WAITING');
          setAmount('');
        } else {
          setPaymentStatus('FAILED');
          setErrorMessage('Failed to initiate payment. Please check your details.');
        }
      } catch (error: any) {
        setPaymentStatus('FAILED');
        const details = error.response?.data?.details;
        let msg = typeof details === 'object' ? JSON.stringify(details) : details;
        
        if (msg && msg.includes('Too many unsuccessful requests')) {
          msg = 'Too many unsuccessful requests try after 24hrs';
        }
        
        setErrorMessage(msg || error.message || 'An unexpected error occurred.');
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Withdrawal Logic
      if (user?.verificationStatus !== 'verified') {
        setAlertConfig({
          isOpen: true,
          title: 'Verification Required',
          message: 'Please verify your account in the Profile section before making a withdrawal.',
          type: 'warning'
        });
        return;
      }

      if (user?.activeAccount === 'DEMO') {
        setAlertConfig({
          isOpen: true,
          title: 'Real Account Required',
          message: 'Withdrawals are only available for REAL accounts. Demo funds have no real-world value.',
          type: 'warning'
        });
        return;
      }

      if (phone !== user?.phone) {
        setAlertConfig({
          isOpen: true,
          title: 'Phone Mismatch',
          message: `Withdrawals can only be made to the phone number used to register your account (${user?.phone}).`,
          type: 'error'
        });
        return;
      }

      if (val < MIN_WITHDRAWAL_USD) {
        setAlertConfig({
          isOpen: true,
          title: 'Minimum Withdrawal',
          message: `The minimum withdrawal amount is $${MIN_WITHDRAWAL_USD}.`,
          type: 'info'
        });
        return;
      }

      const balance = user?.activeAccount === 'REAL' ? user?.realBalance : user?.demoBalance;
      if (val > balance) {
        setAlertConfig({
          isOpen: true,
          title: 'Insufficient Balance',
          message: 'You do not have enough funds in your account to complete this withdrawal.',
          type: 'error'
        });
        return;
      }

      addTransaction({
        id: Math.random().toString(36).substr(2, 9).toUpperCase(),
        type: 'WITHDRAW',
        amount: val,
        status: 'pending',
        timestamp: Date.now(),
        accountType: user?.activeAccount || 'DEMO',
        method: withdrawalMethod
      });
      
      setAlertConfig({
        isOpen: true,
        title: 'Request Submitted',
        message: 'Your withdrawal request has been submitted successfully and is pending.',
        type: 'success'
      });
      setIsModalOpen(false);
      setAmount('');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Financial Ledger</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-mono uppercase tracking-widest">Transaction History & Asset Management</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative group flex-1 sm:flex-none">
            <button
              onClick={() => { setModalType('DEPOSIT'); setIsModalOpen(true); }}
              disabled={user?.activeAccount === 'DEMO'}
              className={cn(
                "w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold transition-all shadow-sm",
                (user?.activeAccount === 'DEMO')
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed" 
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/10"
              )}
            >
              <Plus size={18} /> <span className="text-sm sm:text-base">Deposit</span>
            </button>
            {user?.activeAccount === 'DEMO' && (
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                Deposits disabled for Demo
              </div>
            )}
          </div>
          <div className="relative group flex-1 sm:flex-none">
            <button
              onClick={() => { setModalType('WITHDRAW'); setIsModalOpen(true); }}
              disabled={user?.activeAccount === 'DEMO'}
              className={cn(
                "w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold transition-all",
                user?.activeAccount === 'DEMO'
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              <ArrowUpRight size={18} /> <span className="text-sm sm:text-base">Withdraw</span>
            </button>
            {user?.activeAccount === 'DEMO' && (
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                Withdrawals disabled for Demo
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm dark:shadow-none">
            <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/20">
              <h3 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <History size={18} className="text-blue-500" /> Activity Log
              </h3>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    type="text" 
                    placeholder="Search hash..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full sm:w-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-1.5 pl-9 pr-4 text-xs focus:outline-none focus:border-blue-500 transition-all shadow-sm"
                  />
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg overflow-x-auto no-scrollbar border border-slate-200 dark:border-slate-700">
                  {['ALL', 'DEPOSIT', 'WITHDRAW'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f as any)}
                      className={cn(
                        "px-3 py-1 rounded-md text-[10px] font-bold transition-all whitespace-nowrap",
                        filter === f 
                          ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" 
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {f === 'ALL' ? 'All' : f === 'DEPOSIT' ? 'In' : 'Out'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Timestamp</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Operation</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Asset Value</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Account</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Status</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Reference Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{formatDate(tx.timestamp)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "p-1.5 rounded-lg",
                            tx.type === 'DEPOSIT' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {tx.type === 'DEPOSIT' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                          </div>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{tx.type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "text-xs font-bold font-mono",
                          tx.type === 'DEPOSIT' ? "text-green-500" : "text-red-500"
                        )}>
                          {tx.type === 'DEPOSIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-bold uppercase border",
                          tx.accountType === 'REAL' ? "bg-green-500/5 border-green-500/20 text-green-500" : "bg-blue-500/5 border-blue-500/20 text-blue-500"
                        )}>
                          {tx.accountType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              tx.status === 'completed' ? "bg-green-500" : tx.status === 'failed' ? "bg-red-500" : "bg-yellow-500 animate-pulse"
                            )} />
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-tighter",
                              tx.status === 'completed' ? "text-green-500" : tx.status === 'failed' ? "text-red-500" : "text-yellow-500"
                            )}>{tx.status === 'pending' ? 'is pending' : tx.status}</span>
                          </div>
                          {tx.status === 'pending' && tx.type === 'DEPOSIT' && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={async () => {
                                  setIsChecking(true);
                                  try {
                                    const result = await checkPaymentStatus(tx.externalId || tx.id);
                                    if (result?.status === 'Success' || result?.status === 'Successful' || result?.ResultCode === 0) {
                                      setAlertConfig({
                                        isOpen: true,
                                        title: 'Payment Confirmed',
                                        message: 'Your payment has been verified and your balance updated.',
                                        type: 'success'
                                      });
                                    }
                                    await refreshData();
                                  } finally {
                                    setIsChecking(false);
                                  }
                                }}
                                disabled={isChecking}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-blue-500 transition-colors disabled:opacity-50"
                                title="Check Status"
                              >
                                <RefreshCw size={10} className={cn(isChecking && "animate-spin")} />
                              </button>
                              {user?.role === 'admin' && tx.status === 'pending' && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`FORCE CREDIT: Add ${tx.amount} to this user's balance and mark as completed?`)) {
                                      setIsChecking(true);
                                      const success = await adminCreditUser(tx.userId || user.id, tx.amount, tx.id);
                                      if (success) {
                                        setAlertConfig({
                                          isOpen: true,
                                          title: 'Admin Force Credit',
                                          message: 'Balance has been manually credited successfully.',
                                          type: 'success'
                                        });
                                      } else {
                                        setAlertConfig({
                                          isOpen: true,
                                          title: 'Error',
                                          message: 'Failed to perform manual credit.',
                                          type: 'error'
                                        });
                                      }
                                      setIsChecking(false);
                                    }
                                  }}
                                  disabled={isChecking}
                                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 transition-colors ml-1"
                                  title="Force Credit (Admin Only)"
                                >
                                  <ShieldCheck size={10} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-mono text-slate-400 group-hover:text-blue-500 transition-colors">#{tx.id.substring(0, 12).toUpperCase()}...</span>
                      </td>
                    </tr>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2 opacity-50">
                          <History size={32} />
                          <p className="text-sm font-medium">No records found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {filteredTransactions.map((tx) => (
                <div key={tx.id} className="p-4 space-y-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl",
                        tx.type === 'DEPOSIT' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {tx.type === 'DEPOSIT' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{tx.type}</p>
                        <p className="text-[10px] font-mono text-slate-500">#{tx.id}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-sm font-bold font-mono",
                        tx.type === 'DEPOSIT' ? "text-green-500" : "text-red-500"
                      )}>
                        {tx.type === 'DEPOSIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </p>
                      <p className="text-[10px] text-slate-500">{formatDate(tx.timestamp)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                      tx.accountType === 'REAL' ? "bg-green-500/10 text-green-500" : "bg-blue-500/10 text-blue-500"
                    )}>
                      {tx.accountType}
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        {tx.status === 'completed' ? (
                          <CheckCircle2 size={12} className="text-green-500" />
                        ) : tx.status === 'failed' ? (
                          <XCircle size={12} className="text-red-500" />
                        ) : (
                          <Clock size={12} className="text-yellow-500 animate-pulse" />
                        )}
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-tighter",
                          tx.status === 'completed' ? "text-green-500" : tx.status === 'failed' ? "text-red-500" : "text-yellow-500"
                        )}>{tx.status === 'pending' ? 'is pending' : tx.status}</span>
                      </div>
                      {tx.status === 'pending' && tx.type === 'DEPOSIT' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setIsChecking(true);
                              try {
                                const result = await checkPaymentStatus(tx.externalId || tx.id);
                                if (result?.status === 'Success' || result?.status === 'Successful' || result?.ResultCode === 0) {
                                  setAlertConfig({
                                    isOpen: true,
                                    title: 'Payment Confirmed',
                                    message: 'Your payment has been verified and your balance updated.',
                                    type: 'success'
                                  });
                                }
                                await refreshData();
                              } finally {
                                setIsChecking(false);
                              }
                            }}
                            disabled={isChecking}
                            className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg text-blue-500 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw size={10} className={cn(isChecking && "animate-spin")} />
                          </button>
                          {user?.role === 'admin' && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm(`FORCE CREDIT: Add ${tx.amount} to this user's balance?`)) {
                                  setIsChecking(true);
                                  const success = await adminCreditUser(tx.userId || user.id, tx.amount, tx.id);
                                  if (success) {
                                    setAlertConfig({
                                      isOpen: true,
                                      title: 'Admin Force Credit',
                                      message: 'Balance has been manually credited successfully.',
                                      type: 'success'
                                    });
                                  } else {
                                    setAlertConfig({
                                      isOpen: true,
                                      title: 'Error',
                                      message: 'Failed to perform manual credit.',
                                      type: 'error'
                                    });
                                  }
                                  setIsChecking(false);
                                }
                              }}
                              disabled={isChecking}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-500 transition-colors disabled:opacity-50"
                            >
                              <ShieldCheck size={10} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredTransactions.length === 0 && (
                <div className="p-12 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2 opacity-50">
                    <History size={40} />
                    <p className="text-sm">No transactions found</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 sm:p-8 rounded-[24px] sm:rounded-[32px] text-white shadow-xl shadow-blue-600/10 relative overflow-hidden group">
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6 sm:mb-8">
                <Wallet size={28} />
                <div className="px-3 py-1 bg-white/20 rounded-full text-[9px] font-bold uppercase tracking-wider">
                  {user?.activeAccount} Account
                </div>
              </div>
              <p className="text-blue-100 text-xs mb-1 opacity-80">Total Balance</p>
              <h3 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8 font-mono tracking-tight">
                {formatCurrency(user?.activeAccount === 'REAL' ? user?.realBalance : user?.demoBalance)}
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="p-3 bg-white/10 rounded-xl sm:rounded-2xl">
                  <p className="text-[9px] text-blue-100 uppercase font-bold mb-1 opacity-60">Deposits</p>
                  <p className="text-base sm:text-lg font-bold font-mono">
                    {formatCurrency(user?.transactions?.filter(t => t.type === 'DEPOSIT').reduce((acc, t) => acc + t.amount, 0) || 0)}
                  </p>
                </div>
                <div className="p-3 bg-white/10 rounded-xl sm:rounded-2xl">
                  <p className="text-[9px] text-blue-100 uppercase font-bold mb-1 opacity-60">Withdrawals</p>
                  <p className="text-base sm:text-lg font-bold font-mono">
                    {formatCurrency(user?.transactions?.filter(t => t.type === 'WITHDRAW').reduce((acc, t) => acc + t.amount, 0) || 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
            <h4 className="font-bold mb-4 flex items-center gap-2">
              <Info size={18} className="text-blue-500" /> Payment Information
            </h4>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center text-green-500 shrink-0">
                  <Smartphone size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold">M-Pesa (Payhero)</p>
                  <p className="text-[10px] text-slate-500">Instant deposits via STK Push. $1 = {USD_TO_KES} KES.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500 shrink-0">
                  <CreditCard size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Bank Transfer</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Processing time: 1-3 business days.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] shadow-2xl overflow-hidden"
            >
              {/* Close Button */}
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setPaymentStatus('IDLE');
                }} 
                className="absolute top-6 right-6 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors z-10"
              >
                <X size={20} />
              </button>

              <div className="p-6 sm:p-8">
                {paymentStatus === 'IDLE' ? (
                  <>
                    <div className="mb-6">
                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{modalType === 'DEPOSIT' ? 'Deposit Funds' : 'Withdraw Funds'}</h3>
                    </div>
 
                    <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
                      <button
                        onClick={() => setModalType('DEPOSIT')}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all",
                          modalType === 'DEPOSIT' ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"
                        )}
                      >
                        Deposit
                      </button>
                      <button
                        onClick={() => setModalType('WITHDRAW')}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all",
                          modalType === 'WITHDRAW' ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"
                        )}
                      >
                        Withdraw
                      </button>
                    </div>
 
                    <form onSubmit={handleTransaction} className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Method</label>
                        <div className="grid grid-cols-2 gap-2">
                          {modalType === 'DEPOSIT' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setPaymentMethod('MPESA')}
                                className={cn(
                                  "p-2.5 rounded-xl border flex items-center gap-2 transition-all",
                                  paymentMethod === 'MPESA' ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
                                )}
                              >
                                <Smartphone size={14} />
                                <span className="text-[10px] font-bold">M-Pesa</span>
                              </button>
                              <button
                                type="button"
                                className="p-2.5 rounded-xl border flex items-center gap-2 bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed relative overflow-hidden"
                              >
                                <CreditCard size={14} />
                                <span className="text-[10px] font-bold">Card</span>
                                <div className="absolute top-0 right-0 bg-slate-500 text-white text-[6px] px-1 rounded-bl">SOON</div>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setWithdrawalMethod('MPESA')}
                                className={cn(
                                  "p-2.5 rounded-xl border flex items-center gap-2 transition-all",
                                  withdrawalMethod === 'MPESA' ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
                                )}
                              >
                                <Smartphone size={14} />
                                <span className="text-[10px] font-bold">M-Pesa</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setWithdrawalMethod('BANK')}
                                className={cn(
                                  "p-2.5 rounded-xl border flex items-center gap-2 transition-all",
                                  withdrawalMethod === 'BANK' ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
                                )}
                              >
                                <Wallet size={14} />
                                <span className="text-[10px] font-bold">Bank</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
 
                      <div className="space-y-2">
                        <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount (USD)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                          <input
                            type="number"
                            required
                            min={modalType === 'DEPOSIT' ? MIN_DEPOSIT_USD : MIN_WITHDRAWAL_USD}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-4 text-sm font-bold focus:outline-none focus:border-blue-500 transition-colors text-slate-900 dark:text-white"
                            placeholder="0.00"
                          />
                        </div>
                        <p className="text-[9px] text-slate-500 flex items-center justify-between px-1">
                          <span>Min: ${modalType === 'DEPOSIT' ? MIN_DEPOSIT_USD : MIN_WITHDRAWAL_USD}</span>
                          <span className="text-blue-500 font-bold">
                            ≈ {(parseFloat(amount || '0') * (modalType === 'DEPOSIT' ? USD_TO_KES : currentWithdrawalRate)).toLocaleString()} KES
                          </span>
                        </p>
                        {modalType === 'WITHDRAW' && (
                          <p className="text-[8px] text-slate-400 mt-1 italic">
                            Current withdrawal rate: $1 = {currentWithdrawalRate} KES
                          </p>
                        )}
                      </div>
 
                      <div className="space-y-2">
                        <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {modalType === 'DEPOSIT' ? 'M-Pesa Number' : 'Registered Phone'}
                        </label>
                        <div className="relative">
                          <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                          <input
                            type="tel"
                            required
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className={cn(
                              "w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-4 text-sm font-bold focus:outline-none transition-colors text-slate-900 dark:text-white",
                              modalType === 'WITHDRAW' ? "bg-slate-100 dark:bg-slate-800 cursor-not-allowed opacity-70" : "focus:border-blue-500"
                            )}
                            placeholder="2547XXXXXXXX"
                            readOnly={modalType === 'WITHDRAW'}
                          />
                        </div>
                      </div>
 
                      <button
                        type="submit"
                        disabled={isProcessing}
                        className={cn(
                          "w-full py-3.5 rounded-xl font-bold text-white transition-all shadow-md flex items-center justify-center gap-2 mt-4",
                          isProcessing ? "bg-slate-700 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10"
                        )}
                      >
                        {isProcessing ? (
                          <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        ) : (
                          <>{modalType === 'DEPOSIT' ? 'Deposit Now' : 'Withdraw Now'} <ArrowRight size={16} /></>
                        )}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center space-y-6">
                    {paymentStatus === 'VERIFYING' && (
                      <div className="flex flex-col items-center text-center py-4">
                        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Verifying Payment</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-[280px]">
                          We're waiting for network confirmation. This can sometimes take a minute.
                        </p>
                        
                        <div className="flex flex-col gap-3 w-full">
                          <button 
                            onClick={async () => {
                              setIsChecking(true);
                              await refreshData();
                              
                              // Check if the transaction is now completed in our local state
                              const latestTx = user?.transactions?.find(t => t.externalId === currentTxRef || t.id === currentTxRef);
                              if (latestTx && latestTx.status === 'completed') {
                                setPaymentStatus('SUCCESS');
                                setCurrentTxRef(null);
                              } else if (currentTxRef) {
                                // Try backend check
                                const result = await checkPaymentStatus(currentTxRef);
                                if (result?.status === 'Success' || result?.status === 'Successful' || result?.ResultCode === 0) {
                                  setPaymentStatus('SUCCESS');
                                  setCurrentTxRef(null);
                                  await refreshData();
                                }
                              }
                              setIsChecking(false);
                            }}
                            disabled={isChecking}
                            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                          >
                            {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Check Status Again
                          </button>
                          <button 
                            onClick={() => {
                              setPaymentStatus('IDLE');
                              setIsModalOpen(false);
                            }}
                            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors"
                          >
                            Close and check history later
                          </button>
                        </div>
                      </div>
                    )}

                    {paymentStatus === 'WAITING' && (
                      <div className="flex flex-col items-center gap-6">
                        <div className="relative">
                          <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-sm font-bold font-mono text-blue-500">{timeLeft}s</span>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xl font-bold mb-2">Waiting for PIN</h4>
                          <p className="text-xs text-slate-500 px-4 max-w-[280px] mx-auto">
                            Check your phone for the M-Pesa prompt and enter your PIN to complete the transaction.
                          </p>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800/50 w-full">
                          <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400 mb-2">
                            <Clock size={16} className="animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-wider">STK Push Sent</span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 text-left">
                            Your balance will update automatically once confirmed. If you've already entered your PIN, you can click "Check Status" below.
                          </p>
                        </div>
                        <div className="flex flex-col gap-3 w-full">
                          <button 
                            onClick={async () => {
                              setIsChecking(true);
                              await refreshData();
                              
                              // Check if the transaction is now completed in our local state
                              const latestTx = user?.transactions?.find(t => t.externalId === currentTxRef || t.id === currentTxRef);
                              if (latestTx && latestTx.status === 'completed') {
                                setPaymentStatus('SUCCESS');
                                setCurrentTxRef(null);
                              } else if (currentTxRef) {
                                // Try backend check
                                const result = await checkPaymentStatus(currentTxRef);
                                if (result?.status === 'Success' || result?.status === 'Successful' || result?.ResultCode === 0) {
                                  setPaymentStatus('SUCCESS');
                                  setCurrentTxRef(null);
                                  await refreshData();
                                }
                              }
                              setIsChecking(false);
                            }}
                            disabled={isChecking}
                            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                          >
                            {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Check Status
                          </button>
                          <button 
                            onClick={() => {
                              setPaymentStatus('IDLE');
                              setIsModalOpen(false);
                            }}
                            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors"
                          >
                            Cancel and go back
                          </button>
                        </div>
                      </div>
                    )}

                    {paymentStatus === 'SUCCESS' && (
                      <>
                        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center text-green-500">
                          <CheckCircle2 size={32} />
                        </div>
                        <div>
                          <h4 className="text-lg font-bold mb-2">Success!</h4>
                          <p className="text-xs text-slate-500">Your account has been credited successfully.</p>
                        </div>
                        <button 
                          onClick={() => { setIsModalOpen(false); setPaymentStatus('IDLE'); }}
                          className="w-full py-3 bg-blue-600 text-white text-sm font-bold rounded-xl"
                        >
                          Done
                        </button>
                      </>
                    )}
 
                    {(paymentStatus === 'FAILED' || paymentStatus === 'REJECTED' || paymentStatus === 'CANCELLED') && (
                      <>
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                          <X size={32} />
                        </div>
                        <div>
                          <h4 className="text-lg font-bold mb-2">
                            {paymentStatus === 'REJECTED' ? 'Rejected' : 
                             paymentStatus === 'CANCELLED' ? 'Cancelled' : 'Failed'}
                          </h4>
                          <p className="text-xs text-slate-500 px-4">
                            {errorMessage || 'Something went wrong with the transaction.'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-3 w-full">
                          <button 
                            onClick={() => setPaymentStatus('IDLE')}
                            className="w-full py-3 bg-slate-800 text-white text-sm font-bold rounded-xl"
                          >
                            Try Again
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Alert Modal */}
      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />
    </div>
  );
}
