import { useEffect, useLayoutEffect, useState } from 'react'
import { Aviso } from '../componentes/Aviso'
import { Boton } from '../componentes/Boton'
import { useAviso } from '../componentes/useAviso'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../lib/tipos'
import { Departamentos } from './Departamentos'
import { Personas } from './Personas'

type Seccion = 'inicio' | 'personas' | 'departamentos'

const titulos: Record<Seccion, string> = {
  inicio: 'Ajustes',
  personas: 'Personas',
  departamentos: 'Departamentos',
}

export function Ajustes({ perfil, activa }: { perfil: Perfil; activa: boolean }) {
  const { aviso, mostrar, cerrar } = useAviso()
  const [seccion, setSeccion] = useState<Seccion>('inicio')

  // Cada sección abre desde arriba.
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [seccion])

  function ir(nueva: Seccion) {
    cerrar()
    setSeccion(nueva)
  }

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      {seccion !== 'inicio' && (
        <Boton variante="texto" className="-mb-4 -ml-3 self-start" onClick={() => ir('inicio')}>
          <span aria-hidden="true">‹ </span>Ajustes
        </Boton>
      )}
      <h1 className="text-titulo font-bold">{titulos[seccion]}</h1>

      {seccion === 'inicio' && <Inicio perfil={perfil} activa={activa} onIr={ir} />}
      {seccion === 'personas' && <Personas mostrar={mostrar} />}
      {seccion === 'departamentos' && <Departamentos mostrar={mostrar} />}

      <Aviso aviso={aviso} onCerrar={cerrar} />
    </section>
  )
}

function Inicio({
  perfil,
  activa,
  onIr,
}: {
  perfil: Perfil
  activa: boolean
  onIr: (seccion: Seccion) => void
}) {
  const [cuantas, setCuantas] = useState<{ personas: number; departamentos: number } | null>(null)
  const [saliendo, setSaliendo] = useState(false)

  // Se cuentan de nuevo al volver: al registrar se pueden crear personas.
  useEffect(() => {
    if (!activa) return
    Promise.all([
      supabase.from('personas').select('id', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('departamentos').select('id', { count: 'exact', head: true }).eq('activo', true),
    ]).then(([p, d]) => {
      if (p.count !== null && d.count !== null) setCuantas({ personas: p.count, departamentos: d.count })
    })
  }, [activa])

  const filas: { seccion: Seccion; titulo: string; detalle: string }[] = [
    {
      seccion: 'personas',
      titulo: 'Personas',
      detalle: cuantas ? `${cuantas.personas} activas · agregar y cambiar` : 'Agregar y cambiar',
    },
    {
      seccion: 'departamentos',
      titulo: 'Departamentos',
      detalle: cuantas ? `${cuantas.departamentos} activos · agregar y cambiar` : 'Agregar y cambiar',
    },
  ]

  return (
    <>
      <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
        {filas.map((f) => (
          <li key={f.seccion}>
            <button
              type="button"
              onClick={() => onIr(f.seccion)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left active:bg-hundido"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-lg font-semibold">{f.titulo}</span>
                <span className="text-base text-tinta-suave">{f.detalle}</span>
              </span>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 fill-none stroke-tinta-tenue stroke-2">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 border-t border-linea pt-6">
        <p className="text-lg text-tinta-suave">Usuaria: {perfil.nombre}</p>
        {saliendo ? (
          // Para volver a entrar hace falta el PIN: mejor preguntar antes.
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-aviso-suave p-4">
            <span className="mr-auto text-lg">¿Cerrar sesión? Para volver a entrar se necesita el PIN.</span>
            <Boton variante="secundario" compacto onClick={() => setSaliendo(false)}>
              No
            </Boton>
            <Boton compacto onClick={() => supabase.auth.signOut()}>
              Sí, cerrar sesión
            </Boton>
          </div>
        ) : (
          <Boton variante="secundario" className="self-start" onClick={() => setSaliendo(true)}>
            Cerrar sesión
          </Boton>
        )}
      </div>
    </>
  )
}
