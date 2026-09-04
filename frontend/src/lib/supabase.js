import { createClient } from '@supabase/supabase-js'

// ponytail: VITE_ prefix for Vite; fallback to injected .env values for hackathon demo
const url = import.meta.env.VITE_SUPABASE_URL || 'https://ctesdmgyfatcaqjbbpkc.supabase.co'
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0ZXNkbWd5ZmF0Y2FxamJicGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0Mzc5NTEsImV4cCI6MjEwNDAxMzk1MX0.ZGOmM7VC8ccJkP3lpD7MG7FPnhSP3PWl8agTUnqMqnA'

export const supabase = createClient(url, anon)
