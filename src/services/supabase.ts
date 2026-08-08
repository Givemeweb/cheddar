import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. Subscription features will not work.'
  );
}

function createDummyClient(): SupabaseClient {
  const offlineError = new Error('Offline mode: Supabase is not configured');
  return {
    auth: {
      signInAnonymously: async () => ({ data: { user: null }, error: offlineError }),
      getSession: async () => ({ data: { session: null }, error: null }),
      refreshSession: async () => ({ data: { session: null }, error: offlineError }),
    },
    functions: {
      invoke: async () => ({ data: null, error: offlineError }),
    },
  } as unknown as SupabaseClient;
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false, // We manage session persistence ourselves via SecureStore
      },
    })
  : createDummyClient();
