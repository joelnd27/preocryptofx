import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/['"]/g, '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/['"]/g, '');

// Initialize with placeholders if missing to prevent top-level crash,
// but they will fail gracefully when actually used.
const effectiveUrl = supabaseUrl || 'https://placeholder.supabase.co';
const effectiveKey = supabaseAnonKey || 'placeholder';

export const supabase = createClient(effectiveUrl, effectiveKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  }
});

// Helper to check if supabase is configured with real values
export const isSupabaseConfigured = () => {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  
  const placeholders = [
    'your_supabase_url',
    'your_supabase_anon_key',
    'placeholder',
    'insert_here'
  ];

  const isPlaceholder = placeholders.some(p => 
    supabaseUrl.toLowerCase().includes(p) || 
    supabaseAnonKey.toLowerCase().includes(p)
  );

  const isValidUrl = supabaseUrl.startsWith('http');

  return !isPlaceholder && isValidUrl;
};
