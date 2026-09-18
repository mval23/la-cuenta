// Pestaña "Departamentos": cada departamento con su gente, y un + para agregar
// personas ahí mismo. Cambiar nombres, alias o archivar sigue en Ajustes.

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Aviso } from '../componentes/Aviso'
import { Boton } from '../componentes/Boton'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { campo } from '../componentes/estilos'
import { useAviso, type DatosAviso } from '../componentes/useAviso'
import { normalizarNombre } from '../lib/personas'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Departamento, Persona } from '../lib/tipos'

const orden = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' })

export function Directorio({ activa }: { activa: boolean }) {
  const [departamentos, setDepartamentos] = useState<Departamento[] | null>(null)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [saldos, setSaldos] = useState<Map<number, number>>(new Map())
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set())
  const [agregandoEn, setAgregandoEn] = useState<number | null>(null)
  const { aviso, mostrar, cerrar } = useAviso()

  const cargar = useCallback(async () => {
    const [d, p, s] = await Promise.all([
      supabase.from('departamentos').select('id, nombre, alias, activo').eq('activo', true),
      supabase.from('personas').select('id, nombre, departamento_id, activo').eq('activo', true),
      supabase.from('saldos').select('persona_id, saldo'),
    ])
    setErrorDeCarga(d.error !== null || p.error !== null)
    if (d.data) setDepartamentos([...d.data].sort((a, b) => orden(a.nombre, b.nombre)))
    if (p.data) setPersonas(p.data)
    if (s.data) setSaldos(new Map(s.data.map((x) => [x.persona_id, x.saldo])))
  }, [])

  // Al volver a la pestaña: al registrar se pueden crear personas.
  useEffect(() => {
    if (activa) cargar()
  }, [activa, cargar])

  function alternar(id: number) {
    const nuevos = new Set(abiertos)
    if (nuevos.has(id)) {
      nuevos.delete(id)
      if (agregandoEn === id) setAgregandoEn(null)
    } else nuevos.add(id)
    setAbiertos(nuevos)
  }

  function agregarEn(id: number) {
    cerrar()
    setAbiertos(new Set(abiertos).add(id))
    setAgregandoEn(id)
  }

  if (departamentos === null) {
    return errorDeCarga ? (
      <ErrorDeCarga texto="No se pudieron cargar los departamentos." onReintentar={cargar} />
    ) : (
      <p className="text-lg text-tinta-suave">Cargando...</p>
    )
  }

  const buscado = normalizarNombre(busqueda)
  const grupos = departamentos
    .map((d) => {
      const coincideDepto = buscado !== '' && normalizarNombre(d.nombre).includes(buscado)
      const gente = personas
        .filter((p) => p.departamento_id === d.id)
        .filter((p) => !buscado || coincideDepto || normalizarNombre(p.nombre).includes(buscado))
        .sort((a, b) => orden(a.nombre, b.nombre))
      return { departamento: d, gente, total: personas.filter((p) => p.departamento_id === d.id).length }
    })
    .filter((g) => !buscado || g.gente.length > 0)

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-titulo font-bold">Departamentos</h1>

      {personas.length > 0 && (
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar persona o departamento"
          aria-label="Buscar persona o departamento"
          autoComplete="off"
          className={campo}
        />
      )}

      {departamentos.length === 0 && (
        <p className="text-lg text-tinta-suave">Todavía no hay departamentos. Agrega el primero aquí abajo.</p>
      )}
      {buscado && grupos.length === 0 && <p className="text-lg text-tinta-suave">No hay nadie con ese nombre.</p>}

      <ul className="flex flex-col gap-3">
        {grupos.map(({ departamento: d, gente, total }) => {
          // Al buscar se abren solos, para ver a quién se encontró.
          const abierto = abiertos.has(d.id) || buscado !== ''
          return (
            <li key={d.id} className="overflow-hidden rounded-xl border border-linea bg-superficie">
              <div className="flex items-center gap-2 pr-3">
                <button
                  type="button"
                  onClick={() => alternar(d.id)}
                  aria-expanded={abierto}
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left active:bg-hundido"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={`h-5 w-5 shrink-0 fill-none stroke-tinta-tenue stroke-2 transition-transform ${abierto ? 'rotate-90' : ''}`}
                  >
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xl font-semibold">{d.nombre}</span>
                    <span className="text-base text-tinta-suave">
                      {total} {total === 1 ? 'persona' : 'personas'}
                    </span>
                  </span>
                </button>
                <Boton
                  variante="tintado"
                  compacto
                  aria-label={`Agregar persona a ${d.nombre}`}
                  onClick={() => agregarEn(d.id)}
                  className="flex items-center gap-1"
                >
                  <span aria-hidden="true" className="text-2xl leading-none">
                    +
                  </span>
                  <span>Persona</span>
                </Boton>
              </div>

              {abierto && (
                <div className="flex flex-col gap-3 border-t border-linea p-4">
                  {agregandoEn === d.id && (
                    <AgregarPersona
                      departamento={d}
                      mostrar={mostrar}
                      onAgregada={cargar}
                      onCerrar={() => setAgregandoEn(null)}
                    />
                  )}
                  {gente.length === 0 ? (
                    <p className="text-lg text-tinta-suave">Todavía no hay nadie en {d.nombre}.</p>
                  ) : (
                    <ul className="grid gap-x-6 sm:grid-cols-2">
                      {gente.map((p) => {
                        const debe = saldos.get(p.id) ?? 0
                        return (
                          <li key={p.id} className="flex items-baseline gap-3 border-b border-linea py-2">
                            <span className="min-w-0 flex-1 text-lg">{p.nombre}</span>
                            {debe > 0 && (
                              <span className="text-base text-tinta-suave tabular-nums">
                                debe {formatearPesos(debe)}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <NuevoDepartamento mostrar={mostrar} onAgregado={cargar} />

      <p className="text-base text-tinta-suave">
        Para cambiar un nombre, mover a alguien de departamento o archivar, ve a Ajustes.
      </p>

      <Aviso aviso={aviso} onCerrar={cerrar} />
    </section>
  )
}

function AgregarPersona({
  departamento,
  mostrar,
  onAgregada,
  onCerrar,
}: {
  departamento: Departamento
  mostrar: (aviso: DatosAviso) => void
  onAgregada: () => Promise<void>
  onCerrar: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    entrada.current?.focus()
  }, [])

  async function agregar(e: FormEvent) {
    e.preventDefault()
    const limpio = nombre.trim()
    if (!limpio || guardando) return
    setGuardando(true)
    const { error } = await supabase.from('personas').insert({ nombre: limpio, departamento_id: departamento.id })
    setGuardando(false)
    if (error) {
      mostrar({
        tipo: 'error',
        texto:
          error.code === '23505'
            ? `Ya hay una persona llamada ${limpio} en ${departamento.nombre}.`
            : 'No se pudo guardar. Revisa el internet e intenta otra vez.',
      })
      return
    }
    // Se queda abierto: casi siempre se agregan varias del mismo departamento.
    setNombre('')
    mostrar({ tipo: 'ok', texto: `Se agregó a ${limpio} en ${departamento.nombre}.` })
    entrada.current?.focus()
    await onAgregada()
  }

  return (
    <form onSubmit={agregar} className="flex flex-col gap-3 rounded-xl bg-marca-suave p-4">
      <label htmlFor={`nueva-${departamento.id}`} className="text-lg font-semibold">
        Persona nueva en {departamento.nombre}
      </label>
      <div className="flex flex-wrap gap-3">
        <input
          id={`nueva-${departamento.id}`}
          ref={entrada}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre y apellido"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          className={`${campo} min-w-0 flex-1 basis-60`}
        />
        <Boton type="submit" disabled={!nombre.trim() || guardando}>
          {guardando ? 'Agregando...' : 'Agregar'}
        </Boton>
        <Boton variante="secundario" onClick={onCerrar}>
          Listo
        </Boton>
      </div>
    </form>
  )
}

function NuevoDepartamento({
  mostrar,
  onAgregado,
}: {
  mostrar: (aviso: DatosAviso) => void
  onAgregado: () => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')

  async function agregar(e: FormEvent) {
    e.preventDefault()
    const limpio = nombre.trim()
    if (!limpio) return
    const { error } = await supabase.from('departamentos').insert({ nombre: limpio })
    if (error) {
      mostrar({
        tipo: 'error',
        texto:
          error.code === '23505'
            ? 'Ya existe un departamento con ese nombre.'
            : 'No se pudo guardar. Revisa el internet e intenta otra vez.',
      })
      return
    }
    setNombre('')
    setAbierto(false)
    mostrar({ tipo: 'ok', texto: `Departamento agregado: ${limpio}` })
    await onAgregado()
  }

  if (!abierto) {
    return (
      <Boton variante="secundario" className="self-start" onClick={() => setAbierto(true)}>
        + Nuevo departamento
      </Boton>
    )
  }

  return (
    <form onSubmit={agregar} className="flex flex-wrap gap-3 rounded-xl border border-linea bg-superficie p-4">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre del departamento"
        aria-label="Nombre del nuevo departamento"
        autoComplete="off"
        autoFocus
        className={`${campo} min-w-0 flex-1 basis-60`}
      />
      <Boton type="submit" disabled={!nombre.trim()}>
        Agregar
      </Boton>
      <Boton variante="secundario" onClick={() => setAbierto(false)}>
        Cancelar
      </Boton>
    </form>
  )
}
