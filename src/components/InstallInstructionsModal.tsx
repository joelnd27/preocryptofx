import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Share, Smartphone, MousePointer2, PlusSquare, Download } from 'lucide-react';
import { useStore } from '../context/StoreContext';

export default function InstallInstructionsModal() {
  const { showInstallInstructions, setShowInstallInstructions } = useStore();

  if (!showInstallInstructions) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowInstallInstructions(false)}
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[32px] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800"
        >
          <div className="p-6 sm:p-8">
            <button 
              onClick={() => setShowInstallInstructions(false)}
              className="absolute top-6 right-6 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>

            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                <Smartphone size={32} className="text-white" />
              </div>
              
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Install PreoCryptoFX</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Add the app to your home screen for faster access and real-time updates.</p>
              </div>

              <div className="w-full space-y-4">
                {/* iOS Instructions */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 text-xs font-bold">1</div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">iOS (iPhone/iPad)</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    Tap <Share size={14} className="text-blue-500" /> then <span className="font-bold text-slate-700 dark:text-slate-300">"Add to Home Screen"</span> <PlusSquare size={14} />
                  </p>
                </div>

                {/* Android/Chrome Instructions */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 text-xs font-bold">2</div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">Android / Chrome</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    Tap the <span className="font-bold text-slate-700 dark:text-slate-300">three dots (⋮)</span> then <span className="font-bold text-slate-700 dark:text-slate-300">"Install App"</span> or <span className="font-bold text-slate-700 dark:text-slate-300">"Add to Home Screen"</span>
                  </p>
                </div>

                {/* Desktop Instructions */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 text-xs font-bold">3</div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">Desktop</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    Look for the <PlusSquare size={14} className="text-blue-500" /> icon or <Download size={14} className="text-blue-500" /> circle in your address bar <MousePointer2 size={12} />
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowInstallInstructions(false)}
                className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl hover:opacity-90 transition-all uppercase tracking-widest text-xs"
              >
                Got it
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
