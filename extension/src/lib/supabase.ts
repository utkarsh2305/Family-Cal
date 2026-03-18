import { createClient } from '@supabase/supabase-js'

// These are injected at build time via Vite define or .env
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    // Extensions persist auth in chrome.storage, not localStorage
    storage: {
      getItem: (key) =>
        new Promise((resolve) =>
          chrome.storage.local.get(key, (result) => resolve(result[key] ?? null))
        ),
      setItem: (key, value) =>
        new Promise((resolve) =>
          chrome.storage.local.set({ [key]: value }, resolve)
        ),
      removeItem: (key) =>
        new Promise((resolve) => chrome.storage.local.remove(key, resolve)),
    },
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
})
