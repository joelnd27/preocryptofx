import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/['"]/g, '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/['"]/g, '');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
