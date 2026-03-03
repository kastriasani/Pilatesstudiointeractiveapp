import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

/**
 * Supabase client singleton — used ONLY for Realtime subscriptions.
 * All REST/DB queries go through fetch() to the Edge Function.
 * Auth is disabled because the app uses custom KV session tokens.
 */
export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 2 } },
  }
);
