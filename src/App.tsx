import type { Session } from '@supabase/supabase-js'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Boton } from './componentes/Boton'
import { supabase } from './lib/supabase'
import type { Perfil } from './lib/tipos'
import { Ajustes } from './pantallas/Ajustes'
import { Cobrar } from './pantallas/Cobrar'
import { Login } from './pantallas/Login'
import { Registrar } from './pantallas/Registrar'

type Pestana = 'registrar' | 'cobrar' | 'ajustes'

const pestanas: { id: Pestana; titulo: string; icono: ReactNode }[] = [
  {
    id: 'registrar',
    titulo: 'Registrar',
    icono: (
      <path d="M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z" />
    ),
  },
  {
    id: 'cobrar',
    titulo: 'Cobrar',
    icono: (
      <>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </>
    ),
  },
  {
    id: 'ajustes',
    titulo: 'Ajustes',
    icono: (
      <>
        <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
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
  // Cada pestaña recuerda hasta dónde se había bajado.
  const posiciones = useRef<Record<Pestana, number>>({ registrar: 0, cobrar: 0, ajustes: 0 })

  useEffect(() => {
    supabase
      .from('perfiles')
      .select('id, nombre, rol')
      .eq('id', usuarioId)
      .maybeSingle()
      .then(({ data }) => setPerfil(data))
  }, [usuarioId])

  useLayoutEffect(() => {
    window.scrollTo(0, posiciones.current[pestana])
  }, [pestana])

  function cambiar(nueva: Pestana) {
    if (nueva === pestana) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    posiciones.current[pestana] = window.scrollY
    setPestana(nueva)
  }

  if (perfil === undefined) return <Cargando />
  if (perfil === null) return <SinAcceso />

  // Las tres pantallas quedan montadas: al cambiar de pestaña no se pierde lo
  // que se estaba escribiendo ni la búsqueda.
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-[calc(var(--alto-pestanas)+env(safe-area-inset-bottom)+6rem)] sm:px-8 ancha:max-w-6xl ancha:px-10">
        <div hidden={pestana !== 'registrar'}>
          <Registrar perfil={perfil} activa={pestana === 'registrar'} />
        </div>
        <div hidden={pestana !== 'cobrar'}>
          <Cobrar perfil={perfil} activa={pestana === 'cobrar'} />
        </div>
        <div hidden={pestana !== 'ajustes'}>
          <Ajustes perfil={perfil} activa={pestana === 'ajustes'} />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid h-(--alto-pestanas) max-w-xl grid-cols-3 gap-2 px-3 py-1.5">
          {pestanas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => cambiar(p.id)}
              aria-current={pestana === p.id ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl text-base font-semibold ${
                pestana === p.id ? 'bg-marca-suave text-marca' : 'text-tinta-suave active:bg-hundido'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-6 w-6 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
              >
                {p.icono}
              </svg>
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
    <div className="flex min-h-dvh items-center justify-center text-lg text-tinta-suave">Cargando...</div>
  )
}

function SinAcceso() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-5 text-center">
      <p className="text-lg">Este usuario todavía no tiene permiso para usar La Cuenta.</p>
      <Boton variante="secundario" onClick={() => supabase.auth.signOut()}>
        Salir
      </Boton>
    </div>
  )
}
