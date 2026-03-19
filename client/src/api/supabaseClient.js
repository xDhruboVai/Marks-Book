import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.REACT_APP_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.REACT_APP_SUPABASE_ANON_KEY || '').trim();

export const hasSupabaseEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const supabaseEnvMessage =
  'Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY in client/.env';

export const supabase = hasSupabaseEnv
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
