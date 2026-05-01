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
    warning: <AlertTriangle className="text-yellow-500" size={18} />
  };

  const colors = {
    error: 'border-red-500/20 bg-red-500/5',
    success: 'border-green-500/20 bg-green-500/5',
    info: 'border-blue-500/20 bg-blue-500/5',
    warning: 'border-yellow-500/20 bg-yellow-500/5'
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

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-900 dark:text-white leading-tight">
                <span className="font-bold uppercase tracking-wider mr-2">{title}:</span>
                <span className="text-slate-500 dark:text-slate-400">{message}</span>
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
