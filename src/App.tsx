import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Boton } from './componentes/Boton'
import { supabase } from './lib/supabase'
import type { Perfil } from './lib/tipos'
import { Ajustes } from './pantallas/Ajustes'
import { Cobrar } from './pantallas/Cobrar'
import { Login } from './pantallas/Login'
import { Registrar } from './pantallas/Registrar'

type Pestana = 'registrar' | 'cobrar' | 'ajustes'

const pestanas: { id: Pestana; titulo: string }[] = [
  { id: 'registrar', titulo: 'Registrar' },
  { id: 'cobrar', titulo: 'Cobrar' },
  { id: 'ajustes', titulo: 'Ajustes' },
]

export default function App() {
  // undefined = todavía cargando; null = sin sesión.
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => setSesion(nueva))
    return () => data.subscription.unsubscribe()
  }, [])

  if (sesion === undefined) return <Cargando />
  if (sesion === null) return <Login />
  return <ConSesion usuarioId={sesion.user.id} />
}

function ConSesion({ usuarioId }: { usuarioId: string }) {
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined)
  const [pestana, setPestana] = useState<Pestana>('registrar')

  useEffect(() => {
    supabase
      .from('perfiles')
      .select('id, nombre, rol')
      .eq('id', usuarioId)
      .maybeSingle()
      .then(({ data }) => setPerfil(data))
  }, [usuarioId])

  if (perfil === undefined) return <Cargando />
  if (perfil === null) return <SinAcceso />

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-32">
        {pestana === 'registrar' && <Registrar perfil={perfil} />}
        {pestana === 'cobrar' && <Cobrar />}
        {pestana === 'ajustes' && <Ajustes perfil={perfil} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t-2 border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-2 p-2">
          {pestanas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestana(p.id)}
              aria-current={pestana === p.id ? 'page' : undefined}
              className={`min-h-16 rounded-2xl text-lg font-semibold ${
                pestana === p.id ? 'bg-amber-800 text-white' : 'text-stone-700 active:bg-stone-100'
              }`}
            >
              {p.titulo}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function Cargando() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-xl text-stone-500">
      Cargando...
    </div>
  )
}

function SinAcceso() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-5 text-center">
      <p className="text-xl">Este usuario todavía no tiene permiso para usar La Cuenta.</p>
      <Boton variante="secundario" onClick={() => supabase.auth.signOut()}>
        Salir
      </Boton>
    </div>
  )
}
