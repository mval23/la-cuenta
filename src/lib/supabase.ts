import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local y llénalo.',
  )
}

// La sesión queda guardada en el dispositivo y se renueva sola,
// para que la usuaria no tenga que escribir la contraseña cada noche.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})
