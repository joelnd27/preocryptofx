console.log('[Main] App starting...');
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {StoreProvider} from './context/StoreContext.tsx';

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element not found');
  
  createRoot(rootElement).render(
    <StrictMode>
      <StoreProvider>
        <App />
      </StoreProvider>
    </StrictMode>,
  );
} catch (error) {
  console.error('[Main] Render error:', error);
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 20px; color: red; font-family: monospace;">
        <h1>Application Error</h1>
        <pre>${error instanceof Error ? error.stack : String(error)}</pre>
      </div>
    `;
  }
}
