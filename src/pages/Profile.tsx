import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  User, 
  Mail, 
  Shield, 
  Bell, 
  Smartphone, 
  Globe, 
  Camera,
  CheckCircle2,
  Lock,
  LogOut,
  FileText,
  Upload,
  AlertCircle,
  X,
  Settings2,
  Clock
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import AlertModal from '../components/AlertModal';

export default function Profile() {
  const { user, updateProfile, logout, submitVerification } = useStore();
  const navigate = useNavigate();
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('Personal Info');
  const [isUploading, setIsUploading] = useState(false);
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

  const [docs, setDocs] = useState({
    idFront: '',
    idBack: '',
    addressProof: '',
    addressProofType: 'KRA' as 'KRA' | 'DL'
  });

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await updateProfile({ username, email, phone });
    setIsEditing(false);
    setAlertConfig({
      isOpen: true,
      title: 'Profile Updated',
      message: 'Your personal information has been updated successfully.',
      type: 'success'
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleDocUpload = (type: keyof typeof docs, file: File | null) => {
    if (!file) return;
    
    // In a real app, you'd upload to Supabase Storage or similar
    // For now, we'll create a local preview URL
    const url = URL.createObjectURL(file);
    setDocs(prev => ({ ...prev, [type]: url }));
  };

  const handleSubmitDocs = async () => {
    if (!docs.idFront || !docs.idBack || !docs.addressProof) {
      setAlertConfig({
        isOpen: true,
        title: 'Missing Documents',
        message: 'Please upload all required documents (ID front, ID back, and proof of address) before submitting.',
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
        message: 'Your documents have been submitted successfully! Our team will review them shortly.',
        type: 'success'
      });
    } catch (error) {
      setAlertConfig({
        isOpen: true,
        title: 'Submission Failed',
        message: 'There was an error while submitting your documents. Please try again later.',
        type: 'error'
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Profile Header */}
      <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 relative overflow-hidden shadow-sm dark:shadow-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full"></div>
        
        <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
          <div className="relative group">
            <div className="w-32 h-32 rounded-[40px] bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-5xl font-bold text-white shadow-2xl shadow-blue-600/20">
              {user?.username ? String(user.username[0]).toUpperCase() : '?'}
            </div>
            <button className="absolute bottom-0 right-0 w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-600 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm">
              <Camera size={18} />
            </button>
          </div>
          
          <div className="text-center md:text-left flex-1">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{user?.username}</h2>
              <span className={cn(
                "px-3 py-1 text-[10px] font-bold rounded-full border flex items-center gap-1 uppercase",
                user?.verificationStatus === 'verified' ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" :
                user?.verificationStatus === 'pending' ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20" :
                "bg-slate-500/10 text-slate-500 border-slate-500/20"
              )}>
                {user?.verificationStatus === 'verified' && <CheckCircle2 size={12} />}
                {user?.verificationStatus?.replace('_', ' ') || 'not verified'}
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mb-6">{user?.email}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-4">
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400">
                Member since: <span className="text-slate-900 dark:text-white">April 2026</span>
              </div>
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400">
                Account Type: <span className="text-blue-600 dark:text-blue-400">Trader</span>
              </div>
            </div>
          </div>

          <button 
            onClick={handleLogout}
            className="px-6 py-3 bg-red-500/10 text-red-600 dark:text-red-400 font-bold rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Settings Navigation */}
        <div className="space-y-2">
          {[
            { icon: User, label: 'Personal Info' },
            { icon: FileText, label: 'Verification' },
            { icon: Shield, label: 'Security' },
            { icon: Bell, label: 'Notifications' },
            { icon: Smartphone, label: 'Devices' },
            { icon: Globe, label: 'Language' },
            { icon: Lock, label: 'Privacy' }
          ].map((item, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(item.label)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-medium",
                activeTab === item.label 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Main Settings Area */}
        <div className="md:col-span-2 space-y-8">
          {activeTab === 'Personal Info' && (
            <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Personal Information</h3>
                <button 
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-sm text-blue-600 dark:text-blue-400 font-bold hover:underline"
                >
                  {isEditing ? 'Cancel' : 'Edit Profile'}
                </button>
              </div>

              <form onSubmit={handleUpdate} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-500 ml-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        disabled={!isEditing}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-12 pr-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-500 ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="email"
                        disabled={!isEditing}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-12 pr-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-500 ml-1">Phone Number</label>
                    <div className="relative">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="tel"
                        disabled={!isEditing}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-12 pr-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    type="submit"
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                  >
                    Save Changes
                  </motion.button>
                )}
              </form>
            </div>
          )}

          {activeTab === 'Verification' && (
            <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm dark:shadow-none">
              <div className="mb-8">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Account Verification</h3>
                <p className="text-sm text-slate-500">Upload your documents to verify your identity and unlock all features.</p>
              </div>

              {user?.verificationStatus === 'verified' ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center text-green-500 mb-4">
                    <CheckCircle2 size={40} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Verified Account</h4>
                  <p className="text-sm text-slate-500 max-w-xs">Your identity has been successfully verified. You have full access to all platform features.</p>
                </div>
              ) : user?.verificationStatus === 'pending' ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center text-yellow-500 mb-4">
                    <Clock size={40} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Verification Pending</h4>
                  <p className="text-sm text-slate-500 max-w-xs">Our team is reviewing your documents. This process usually takes 5-10 minutes.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">1. Identity Verification</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">ID Front Side</label>
                          <label 
                            className={cn(
                              "relative h-32 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 overflow-hidden cursor-pointer",
                              docs.idFront ? "border-green-500/50 bg-green-500/5" : "border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5"
                            )}
                          >
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => handleDocUpload('idFront', e.target.files?.[0] || null)}
                            />
                            {docs.idFront ? (
                              <>
                                <CheckCircle2 className="text-green-500" size={24} />
                                <span className="text-[10px] font-bold text-green-600">Uploaded</span>
                              </>
                            ) : (
                              <>
                                <Upload className="text-slate-400" size={24} />
                                <span className="text-[10px] font-bold text-blue-500">Choose Image</span>
                              </>
                            )}
                          </label>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">ID Back Side</label>
                          <label 
                            className={cn(
                              "relative h-32 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 overflow-hidden cursor-pointer",
                              docs.idBack ? "border-green-500/50 bg-green-500/5" : "border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5"
                            )}
                          >
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => handleDocUpload('idBack', e.target.files?.[0] || null)}
                            />
                            {docs.idBack ? (
                              <>
                                <CheckCircle2 className="text-green-500" size={24} />
                                <span className="text-[10px] font-bold text-green-600">Uploaded</span>
                              </>
                            ) : (
                              <>
                                <Upload className="text-slate-400" size={24} />
                                <span className="text-[10px] font-bold text-blue-500">Choose Image</span>
                              </>
                            )}
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">2. Proof of Address</h4>
                        <select 
                          value={docs.addressProofType}
                          onChange={(e) => setDocs(prev => ({ ...prev, addressProofType: e.target.value as any }))}
                          className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1 focus:ring-0"
                        >
                          <option value="KRA">KRA PIN</option>
                          <option value="DL">Driving License</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">
                            {docs.addressProofType === 'KRA' ? 'KRA Certificate (PDF)' : 'Driving License (PDF)'}
                          </label>
                        <label 
                          className={cn(
                            "relative h-32 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 overflow-hidden cursor-pointer",
                            docs.addressProof ? "border-green-500/50 bg-green-500/5" : "border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5"
                          )}
                        >
                          <input 
                            type="file" 
                            accept=".pdf" 
                            className="hidden" 
                            onChange={(e) => handleDocUpload('addressProof', e.target.files?.[0] || null)}
                          />
                          {docs.addressProof ? (
                            <>
                              <CheckCircle2 className="text-green-500" size={24} />
                              <span className="text-[10px] font-bold text-green-600">Uploaded</span>
                            </>
                          ) : (
                            <>
                              <Upload className="text-slate-400" size={24} />
                              <span className="text-[10px] font-bold text-blue-500">Choose PDF</span>
                            </>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex gap-4">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                      <AlertCircle size={20} />
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Please ensure all documents are clear and legible. Supported formats: JPG, PNG, PDF (Max 5MB).
                    </p>
                  </div>

                  <button
                    onClick={handleSubmitDocs}
                    disabled={isUploading || !docs.idFront || !docs.idBack || !docs.addressProof}
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? 'Submitting...' : 'Submit for Verification'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab !== 'Personal Info' && activeTab !== 'Verification' && (
            <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-[32px] p-12 text-center shadow-sm dark:shadow-none">
              <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400">
                <Settings2 size={40} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{activeTab} Settings</h3>
              <p className="text-sm text-slate-500 max-w-xs mx-auto">This section is currently being updated to provide a better experience. Check back soon!</p>
            </div>
          )}
        </div>
      </div>
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
