import React, { useState } from 'react';
import { useStore } from '../context/StoreContext.tsx';
import { 
  ShieldCheck, 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight,
  Shield,
  Loader2,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

export default function Verification() {
  const { user, submitVerification } = useStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [idType, setIdType] = useState('National ID');
  const [files, setFiles] = useState<{ front?: File, back?: File }>({});

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (file) {
      setFiles(prev => ({ ...prev, [side]: file }));
    }
  };

  const handleManualSubmit = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const documents = {
        type: idType,
        front: files.front?.name || 'identity-front.jpg',
        back: files.back?.name || 'identity-back.jpg'
      };

      await submitVerification(documents);

      setStep(3);
    } catch (err: any) {
      console.error('Verification submission error:', err);
      alert(err.message || 'Failed to submit verification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (user?.verificationStatus === 'verified') {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <div className="bg-[#121212] border border-gray-800 rounded-2xl p-12 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Account Verified!</h1>
          <p className="text-gray-400 mb-8">Your identity has been successfully verified. You now have full access to all withdrawal features and higher trading limits.</p>
          <div className="flex items-center justify-center gap-2 text-green-500 text-sm font-medium">
            <Lock className="w-4 h-4" />
            End-to-End Encrypted Data
          </div>
        </div>
      </div>
    );
  }

  if (user?.verificationStatus === 'pending') {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <div className="bg-[#121212] border border-gray-800 rounded-2xl p-12 relative overflow-hidden text-center">
          <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500" />
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
              </div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Verification Pending</h1>
          <p className="text-gray-400 mb-8">Your documents are being securely reviewed. This process typically takes between 5 to 10 minutes. Feel free to continue trading while we process your request.</p>
          <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
            <AlertCircle className="w-4 h-4" />
            You'll receive a notification once verified.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <ShieldCheck className="w-8 h-8 text-blue-500" />
          Identity Verification (KYC)
        </h1>
        <p className="text-gray-400">Complete your profile to unlock full platform features and withdrawals.</p>
      </div>

      <div className="bg-[#121212] border border-gray-800 rounded-2xl overflow-hidden">
        {/* Progress Bar */}
        <div className="flex border-b border-gray-800 bg-[#161616]">
          {[1, 2].map((i) => (
            <div 
              key={i} 
              className={`flex-1 py-4 px-6 text-sm font-medium flex items-center gap-2 ${
                step === i ? 'text-blue-500 border-b-2 border-blue-500' : 
                step > i ? 'text-green-500' : 'text-gray-500'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === i ? 'bg-blue-500 text-white' : 
                step > i ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400'
              }`}>
                {step > i ? <CheckCircle2 className="w-4 h-4" /> : i}
              </div>
              Step {i}: {i === 1 ? 'Method' : 'Documents'}
            </div>
          ))}
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <h3 className="text-lg font-medium text-white mb-4">Choose verification method</h3>
                <div className="grid gap-4">
                  {['National ID', 'Passport', 'Driving License'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setIdType(type)}
                      className={`p-4 rounded-xl border flex items-center justify-between group transition-all ${
                        idType === type ? 'bg-blue-500/10 border-blue-500' : 'bg-[#1a1a1a] border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          idType === type ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400'
                        }`}>
                          {type === 'National ID' ? <FileText className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
                        </div>
                        <div>
                          <p className="text-white font-medium">{type}</p>
                          <p className="text-gray-500 text-xs">Standard identification for verification</p>
                        </div>
                      </div>
                      <ChevronRight className={`w-5 h-5 transition-transform ${idType === type ? 'text-blue-500 translate-x-1' : 'text-gray-600'}`} />
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20"
                >
                  Continue to Documents
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-4">
                  <AlertCircle className="w-6 h-6 text-blue-500 flex-shrink-0" />
                  <p className="text-sm text-blue-200">
                    Please ensure the photo is clear, all details are visible, and the document is not expired.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(['front', 'back'] as const).map((side) => (
                    <div key={side} className="space-y-2">
                      <p className="text-sm font-medium text-gray-400 capitalize">{side} of document</p>
                      <label className={`relative h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                        files[side] ? 'bg-green-500/5 border-green-500/30' : 'bg-[#1a1a1a] border-gray-800 hover:border-gray-700'
                      }`}>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => handleFileUpload(e, side)}
                        />
                        {files[side] ? (
                          <>
                            <CheckCircle2 className="w-10 h-10 text-green-500 mb-2" />
                            <p className="text-green-500 text-sm font-medium">{files[side]!.name}</p>
                            <p className="text-gray-500 text-xs mt-1">Click to replace</p>
                          </>
                        ) : (
                          <>
                            <Upload className="w-10 h-10 text-gray-500 mb-2" />
                            <p className="text-gray-400 text-sm font-medium">Upload {side} side</p>
                            <p className="text-gray-600 text-xs mt-1">JPG, PNG up to 10MB</p>
                          </>
                        )}
                      </label>
                    </div>
                  ))}
                </div>

                <div className="flex gap-4 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-4 bg-[#1a1a1a] hover:bg-[#222] text-white rounded-xl font-bold transition-all border border-gray-800"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleManualSubmit}
                    disabled={loading || !files.front || !files.back}
                    className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Submit Verification'
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-6"
              >
                <div className="flex justify-center">
                  <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white">Successfully Submitted</h3>
                <p className="text-gray-400">
                  Your identity documents have been securely uploaded and are waiting for review. 
                  You will be notified once your account is fully verified.
                </p>
                <button
                  onClick={() => window.location.href = '/dashboard'}
                  className="w-full py-4 bg-[#1a1a1a] hover:bg-[#222] text-white rounded-xl font-bold transition-all border border-gray-800"
                >
                  Back to Dashboard
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
