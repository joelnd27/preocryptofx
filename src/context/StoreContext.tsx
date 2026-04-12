import React, { createContext, useContext } from 'react';
import { useStore as useStoreHook } from '../hooks/useStore.ts';

const StoreContext = createContext<ReturnType<typeof useStoreHook> | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useStoreHook();
  return (
    <StoreContext.Provider value={store}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}
