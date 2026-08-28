import React from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface PWAInstallBannerProps {
  className?: string;
}

export default function PWAInstallBanner({ className }: PWAInstallBannerProps) {
  const { installApp, isInstallBannerDismissed, dismissInstallBanner, deferredPrompt, isInstalling } = useStore();

  const [isIOS, setIsIOS] = React.useState(false);

  React.useEffect(() => {
    // Basic iOS detection
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);
  }, []);

  if (isInstallBannerDismissed) return null;

  // If deferredPrompt is null and it's not iOS, we might want to hide it IF the app is already installed
  // But usually, if it's already installed, beforeinstallprompt won't fire.
  // However, the user wants a "Download" button to always be working or shown in the right context.
  
  // If already in standalone mode, don't show the banner
  if (window.matchMedia('(display-mode: standalone)').matches) return null;

  const isDarkMode = useStore().isDarkMode;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className={cn(
          "w-full z-[100] relative",
          isDarkMode 
            ? "bg-slate-900 text-white border-b border-slate-800" 
            : "bg-white text-blue-600 border-b border-blue-50 shadow-sm",
          className
        )}
      >
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 flex-nowrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 backdrop-blur-sm",
              isDarkMode ? "bg-white/10" : "bg-blue-600/10"
            )}>
              <Smartphone size={18} className={isDarkMode ? "text-white" : "text-blue-600"} />
            </div>
            <div className="flex flex-col min-w-0 justify-center">
              <h3 className={cn(
                "text-xs sm:text-sm font-bold leading-tight truncate",
                isDarkMode ? "text-white" : "text-slate-900"
              )}>Install PreoCryptoFX App</h3>
              {!isIOS && (
                <p className={cn(
                  "text-[10px] leading-none truncate hidden lg:block mt-0.5",
                  isDarkMode ? "text-slate-400" : "text-slate-500"
                )}>Real-time alerts & faster trading from your home screen.</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => installApp()}
              disabled={isInstalling}
              className={cn(
                "px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 shrink-0",
                isDarkMode 
                  ? "bg-blue-600 text-white hover:bg-blue-700" 
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              <Download size={14} className="shrink-0" /> <span className="shrink-0">{isInstalling ? 'Installing...' : 'Install App'}</span>
            </button>
            
            <button
              onClick={dismissInstallBanner}
              className={cn(
                "p-1 rounded-lg transition-colors shrink-0",
                isDarkMode ? "hover:bg-white/10 text-slate-400" : "hover:bg-slate-100 text-slate-400"
              )}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
