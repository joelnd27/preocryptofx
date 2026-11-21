import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface AlertModalProps {
  isOpen: boolean;
  type?: 'success' | 'error' | 'info';
  title?: string;
  message: string;
  onClose: () => void;
}

const icons = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  error: <AlertCircle className="w-5 h-5 text-rose-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />
};

const colors = {
  success: 'border-emerald-500/20 bg-emerald-500/5',
  error: 'border-rose-500/20 bg-rose-500/5',
  info: 'border-blue-500/20 bg-blue-500/5'
};

export default function AlertModal({ isOpen, type = 'info', title = 'Notification', message, onClose }: AlertModalProps) {
  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] pointer-events-none">
      <div
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
            <span className="font-medium text-slate-600 dark:text-slate-300">{message}</span>
          </p>
        </div>

        <button
          onClick={onClose}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
