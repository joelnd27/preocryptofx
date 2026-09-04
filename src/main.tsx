console.log('[Main] App starting...');
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {StoreProvider} from './context/StoreContext.tsx';
import { registerSW } from 'virtual:pwa-register';

// Register service worker
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
