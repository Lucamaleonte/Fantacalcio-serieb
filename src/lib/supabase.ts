import { createClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from './env'

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configurazione mancante: imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (vedi .env.example).',
  )
}

// Solo la chiave anon/publishable: la sicurezza dei dati è garantita dalle RLS.
// Mai usare qui la chiave service_role/secret.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
