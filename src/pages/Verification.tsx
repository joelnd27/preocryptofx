import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { 
  Shield, 
  Upload, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ArrowRight,
  FileText,
  Camera
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import AlertModal from '../components/AlertModal';

export default function Verification() {
  const { user, submitVerification } = useStore();
  const navigate = useNavigate();
  const [isUploading, setIsUploading] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info' as 'error' | 'success' | 'info' | 'warning'
  });

  const [docs, setDocs] = useState({
    idFront: '',
    idBack: '',
    addressProof: '',
    addressProofType: 'KRA' as 'KRA' | 'DL'
  });

  // Redirect if already pending or verified
  useEffect(() => {
    if (user?.verificationStatus === 'pending' || user?.verificationStatus === 'verified') {
      navigate('/dashboard');
    }
  }, [user?.verificationStatus, navigate]);

  const handleDocUpload = (type: keyof typeof docs, file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setDocs(prev => ({ ...prev, [type]: url }));
  };

  const handleSubmitDocs = async () => {
    if (!docs.idFront || !docs.idBack || !docs.addressProof) {
      setAlertConfig({
        isOpen: true,
        title: 'Missing Documents',
        message: 'Please upload all required documents before submitting.',
        type: 'warning'
      });
      return;
    }

    setIsUploading(true);
    try {
      await submitVerification({
        idFront: docs.idFront,
        idBack: docs.idBack,
        [docs.addressProofType === 'KRA' ? 'kra' : 'drivingLicense']: docs.addressProof
      });
      setAlertConfig({
        isOpen: true,
        title: 'Submission Successful',
        message: 'Your documents have been submitted! Verification usually takes 5-10 minutes.',
        type: 'success'
      });
      // Redirect after a short delay
      setTimeout(() => navigate('/dashboard'), 3000);
    } catch (error) {
      setAlertConfig({
        isOpen: true,
        title: 'Submission Failed',
        message: 'There was an error submitting your documents. Please try again.',
        type: 'error'
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600/10 rounded-2xl text-blue-600 mb-4">
            <Shield size={32} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">Account Verification</h1>
          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-300">Complete your profile to unlock full trading features</p>
        </div>

        <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm">
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">1</span>
                  Identity Documents
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">ID Front</label>
                    <label className={cn(
                      "relative h-32 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden",
                      docs.idFront ? "border-green-500/50 bg-green-500/5" : "border-slate-200 dark:border-slate-800 hover:border-blue-500/50"
                    )}>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleDocUpload('idFront', e.target.files?.[0] || null)} />
                      {docs.idFront ? <CheckCircle2 className="text-green-500" size={24} /> : <Camera className="text-slate-400" size={24} />}
                      <span className="text-[10px] font-bold text-slate-500">{docs.idFront ? 'Uploaded' : 'Front Side'}</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">ID Back</label>
                    <label className={cn(
                      "relative h-32 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden",
                      docs.idBack ? "border-green-500/50 bg-green-500/5" : "border-slate-200 dark:border-slate-800 hover:border-blue-500/50"
                    )}>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleDocUpload('idBack', e.target.files?.[0] || null)} />
                      {docs.idBack ? <CheckCircle2 className="text-green-500" size={24} /> : <Camera className="text-slate-400" size={24} />}
                      <span className="text-[10px] font-bold text-slate-500">{docs.idBack ? 'Uploaded' : 'Back Side'}</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">2</span>
                    Proof of Address
                  </h3>
                  <select 
                    value={docs.addressProofType}
                    onChange={(e) => setDocs(prev => ({ ...prev, addressProofType: e.target.value as any }))}
                    className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1"
                  >
                    <option value="KRA">KRA PIN</option>
                    <option value="DL">Driving License</option>
                  </select>
                </div>
                <label className={cn(
                  "relative h-[148px] rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden",
                  docs.addressProof ? "border-green-500/50 bg-green-500/5" : "border-slate-200 dark:border-slate-800 hover:border-blue-500/50"
                )}>
                  <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => handleDocUpload('addressProof', e.target.files?.[0] || null)} />
                  {docs.addressProof ? <CheckCircle2 className="text-green-500" size={32} /> : <Upload className="text-slate-400" size={32} />}
                  <span className="text-xs font-bold text-slate-500">{docs.addressProof ? 'Document Uploaded' : 'Upload PDF or Image'}</span>
                </label>
              </div>
            </div>

            <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex gap-4">
              <AlertCircle className="text-blue-500 shrink-0" size={20} />
              <p className="text-xs text-slate-500 leading-relaxed">
                Verification is automatic and usually takes 5-10 minutes. Once verified, your documents will be permanently deleted for your privacy.
              </p>
            </div>

            <button
              onClick={handleSubmitDocs}
              disabled={isUploading || !docs.idFront || !docs.idBack || !docs.addressProof}
              className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isUploading ? 'Submitting...' : 'Submit Verification'}
              {!isUploading && <ArrowRight size={20} />}
            </button>
          </div>
        </div>
      </div>

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
