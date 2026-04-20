import React, { useState } from 'react';
import { useStore } from '../context/StoreContext.tsx';
import { ShieldCheck, Upload, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

export default function Verification() {
  const { user, setUser } = useStore();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submitVerification = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const now = Date.now();
      if (isSupabaseConfigured()) {
        await supabase.from('users').update({
          verification_status: 'pending',
          verification_submitted_at: now,
          verification_documents: { status: 'submitted', timestamp: now }
        }).eq('id', user.id);
      }
      setUser({ ...user, verificationStatus: 'pending', verificationSubmittedAt: now });
      setSubmitted(true);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  if (user?.verificationStatus === 'verified') return <div className="text-center py-20 text-white"><h1>Account Verified</h1></div>;
  if (user?.verificationStatus === 'pending' || submitted) return <div className="text-center py-20 text-white"><h1>Verification Pending</h1></div>;

  return (
    <div className="max-w-xl mx-auto py-12">
      <h1 className="text-2xl font-bold text-white mb-4 flex items-center gap-2"><ShieldCheck className="w-8 h-8 text-blue-500" /> Identity Verification</h1>
      <div className="bg-[#121212] border border-gray-800 rounded-2xl p-8 text-center">
        <Upload className="w-12 h-12 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-400 mb-6">Upload your identity document (ID, Passport) to unlock all features.</p>
        <button onClick={submitVerification} disabled={loading} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Start Verification'}
        </button>
      </div>
    </div>
  );
}
