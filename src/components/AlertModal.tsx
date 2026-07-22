import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'error' | 'success' | 'info' | 'warning';
}

export default function AlertModal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  type = 'info' 
}: AlertModalProps) {
  const icons = {
    error: <AlertCircle className="text-red-500" size={18} />,
    success: <CheckCircle2 className="text-green-500" size={18} />,
    info: <Info className="text-blue-500" size={18} />,
    warning: <AlertTriangle className="text-yellow-600" size={18} />
  };

  const colors = {
    error: 'border-red-500/30 bg-red-500/5',
    success: 'border-green-500/30 bg-green-500/5',
    info: 'border-blue-500/30 bg-blue-500/5',
    warning: 'border-yellow-500/50 bg-yellow-100/50 dark:bg-yellow-500/10'
  };

  // Auto-close after 5 seconds
  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[200] pointer-events-none">
          <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className={cn(
              "pointer-events-auto relative flex items-center gap-2 p-2 pr-8 bg-white dark:bg-slate-900 border rounded-xl shadow-2xl max-w-md",
              colors[type]
            )}
          >
            <div className="shrink-0">
              {icons[type]}
            </div>

            <div className="flex-1 min-w-0 py-1">
              <p className="text-xs font-black text-slate-900 dark:text-white leading-tight">
                <span className="uppercase tracking-[0.1em] mr-2 text-slate-900 dark:text-white">{title}:</span>
                <span className="text-slate-800 dark:text-slate-100 font-black">{message}</span>
              </p>
            </div>

            <button 
              onClick={onClose}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
            >
              <X size={14} />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
