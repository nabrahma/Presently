import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The app remains usable locally for UI development without credentials.
// Configure these values in .env.local and Vercel to activate Supabase Auth/data.
export const supabase = url && anonKey ? createClient(url, anonKey) : null
