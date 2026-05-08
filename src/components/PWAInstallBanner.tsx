import React from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface PWAInstallBannerProps {
  className?: string;
}

export default function PWAInstallBanner({ className }: PWAInstallBannerProps) {
  const { installApp, isInstallBannerDismissed, dismissInstallBanner, deferredPrompt } = useStore();

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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className={cn(
          "bg-blue-600 text-white w-full z-[100] relative",
          className
        )}
      >
        <div className="max-w-7xl mx-auto px-4 py-1.5 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
              <Smartphone size={18} className="text-white" />
            </div>
            <div className="flex flex-col">
              <h3 className="text-xs sm:text-sm font-bold leading-tight">Install PreoCryptoFX App</h3>
              <p className="text-[10px] text-blue-100 hidden lg:block">Real-time alerts & faster trading from your home screen.</p>
              {isIOS && (
                <p className="text-[10px] text-blue-100 italic">Tap "Share" then "Add to Home Screen"</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {!isIOS && deferredPrompt ? (
              <button
                onClick={installApp}
                className="px-3 py-1.5 bg-white text-blue-600 text-[10px] sm:text-xs font-bold rounded-lg hover:bg-slate-100 transition-all flex items-center gap-2 shadow-sm"
              >
                <Download size={14} /> Install Now
              </button>
            ) : (
              <button
                onClick={() => installApp()} // installApp now handles showing instructions if no prompt
                className="px-3 py-1.5 bg-white text-blue-600 text-[10px] sm:text-xs font-bold rounded-xl hover:bg-slate-100 transition-all flex items-center gap-2 shadow-sm"
              >
                <Download size={14} /> Get App
              </button>
            )}
            
            <button
              onClick={dismissInstallBanner}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors text-blue-100"
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
