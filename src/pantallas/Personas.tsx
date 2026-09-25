import type { PostgrestError } from '@supabase/supabase-js'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Boton } from '../componentes/Boton'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { campo } from '../componentes/estilos'
import { Parecidas } from '../componentes/Parecidas'
import type { DatosAviso } from '../componentes/useAviso'
import { normalizarNombre } from '../lib/personas'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Departamento, Persona } from '../lib/tipos'

function mensajeDeError(error: PostgrestError): string {
  if (error.code === '23505') return 'Ya hay una persona con ese nombre en ese departamento.'
  return 'No se pudo guardar. Revisa el internet e intenta otra vez.'
}

/** Personas activas agrupadas por departamento, en orden alfabético. */
function agrupar(personas: Persona[], departamentos: Departamento[], busqueda: string) {
  const buscado = normalizarNombre(busqueda)
  const orden = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' })
  return departamentos
    .map((d) => ({
      departamento: d,
      personas: personas
        .filter((p) => p.departamento_id === d.id)
        .filter(
          (p) =>
            !buscado ||
            normalizarNombre(p.nombre).includes(buscado) ||
            normalizarNombre(d.nombre).includes(buscado),
        )
        .sort((a, b) => orden(a.nombre, b.nombre)),
    }))
    .filter((g) => g.personas.length > 0)
    .sort((a, b) => orden(a.departamento.nombre, b.departamento.nombre))
}

export function Personas({ mostrar }: { mostrar: (aviso: DatosAviso) => void }) {
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  // Lo que debe cada persona, para avisar al archivar a alguien que debe.
  const [saldos, setSaldos] = useState<Map<number, number>>(new Map())
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<number | null>(null)
  const [porArchivar, setPorArchivar] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    const [p, d, s] = await Promise.all([
      supabase.from('personas').select('id, nombre, departamento_id, activo'),
      supabase.from('departamentos').select('id, nombre, alias, activo').order('nombre'),
      supabase.from('saldos').select('persona_id, saldo'),
    ])
    setErrorDeCarga(p.error !== null || d.error !== null)
    if (p.data) setPersonas(p.data)
    if (d.data) setDepartamentos(d.data)
    if (s.data) setSaldos(new Map(s.data.map((x) => [x.persona_id, x.saldo])))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function actualizar(id: number, cambios: Partial<Omit<Persona, 'id'>>): Promise<boolean> {
    const { error } = await supabase.from('personas').update(cambios).eq('id', id)
    if (error) {
      mostrar({ tipo: 'error', texto: mensajeDeError(error) })
      return false
    }
    await cargar()
    return true
  }

  async function archivar(p: Persona) {
    setPorArchivar(null)
    if (!(await actualizar(p.id, { activo: false }))) return
    const debe = saldos.get(p.id) ?? 0
    mostrar({
      tipo: 'ok',
      texto:
        `Se archivó a ${p.nombre}. Ya no aparece al registrar.` +
        (debe > 0 ? ` Sigue en Cobrar hasta que pague ${formatearPesos(debe)}.` : ''),
      deshacer: () => reactivar(p),
    })
  }

  async function reactivar(p: Persona) {
    if (await actualizar(p.id, { activo: true })) {
      mostrar({ tipo: 'ok', texto: `Se reactivó a ${p.nombre}.` })
    }
  }

  if (personas === null) {
    return errorDeCarga ? (
      <ErrorDeCarga texto="No se pudieron cargar las personas." onReintentar={cargar} />
    ) : (
      <p className="text-lg text-tinta-suave">Cargando personas...</p>
    )
  }

  const activos = departamentos.filter((d) => d.activo)
  const activas = personas.filter((p) => p.activo)
  const archivadas = personas.filter((p) => !p.activo)
  const grupos = agrupar(activas, departamentos, busqueda)
  const nombreDepto = (id: number) => departamentos.find((d) => d.id === id)?.nombre ?? ''

  return (
    <div className="flex flex-col gap-6">
      <p className="text-lg text-tinta-suave">
        Las personas que compran a crédito. También se crean solas al registrar una compra con un nombre nuevo.
      </p>

      {activos.length === 0 ? (
        <p className="rounded-xl bg-info-suave p-4 text-lg text-info">
          Primero hay que crear un departamento, en Ajustes &gt; Departamentos.
        </p>
      ) : (
        <AgregarPersona
          departamentos={activos}
          personas={activas}
          nombreDepto={nombreDepto}
          mostrar={mostrar}
          onAgregada={cargar}
        />
      )}

      {activas.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-tinta-suave">Buscar persona o departamento</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoComplete="off"
            className={campo}
          />
        </label>
      )}

      {activas.length === 0 && <p className="text-lg text-tinta-suave">Todavía no hay personas.</p>}
      {activas.length > 0 && grupos.length === 0 && (
        <p className="text-lg text-tinta-suave">No hay nadie con ese nombre.</p>
      )}

      {grupos.map((g) => (
        <div key={g.departamento.id} className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-2 text-xl font-semibold">
            {g.departamento.nombre}
            <span className="text-base font-normal text-tinta-suave">
              · {g.personas.length} {g.personas.length === 1 ? 'persona' : 'personas'}
              {!g.departamento.activo && ' · departamento archivado'}
            </span>
          </h2>
          <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
            {g.personas.map((p) =>
              editando === p.id ? (
                <EditarPersona
                  key={p.id}
                  persona={p}
                  departamentos={departamentos.filter((d) => d.activo || d.id === p.departamento_id)}
                  onGuardar={async (cambios) => {
                    if (await actualizar(p.id, cambios)) {
                      setEditando(null)
                      mostrar({ tipo: 'ok', texto: `Se guardaron los cambios de ${cambios.nombre}.` })
                    }
                  }}
                  onCancelar={() => setEditando(null)}
                />
              ) : (
                <li key={p.id}>
                  <div className="flex items-center gap-3 py-1.5 pr-3 pl-4">
                    <span className="min-w-0 flex-1 text-lg">{p.nombre}</span>
                    <Boton
                      variante="secundario"
                      compacto
                      aria-label={`Cambiar: ${p.nombre}`}
                      onClick={() => {
                        setPorArchivar(null)
                        setEditando(p.id)
                      }}
                    >
                      Cambiar
                    </Boton>
                    <Boton
                      variante="secundario"
                      compacto
                      aria-label={`Archivar: ${p.nombre}`}
                      disabled={porArchivar === p.id}
                      onClick={() => setPorArchivar(p.id)}
                    >
                      Archivar
                    </Boton>
                  </div>
                  {porArchivar === p.id && (
                    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-peligro-suave px-4 py-3">
                      <span className="mr-auto text-lg">
                        ¿Archivar a <span className="font-semibold">{p.nombre}</span>? Ya no aparece al registrar ni al
                        dictar.
                        {(saldos.get(p.id) ?? 0) > 0 &&
                          ` Lo que debe (${formatearPesos(saldos.get(p.id) ?? 0)}) sigue en Cobrar.`}
                      </span>
                      <Boton variante="secundario" compacto onClick={() => setPorArchivar(null)}>
                        No
                      </Boton>
                      <Boton variante="peligro" compacto onClick={() => archivar(p)}>
                        Sí, archivar
                      </Boton>
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        </div>
      ))}

      {archivadas.length > 0 && (
        <details className="rounded-xl border border-linea bg-superficie p-4">
          <summary className="min-h-11 cursor-pointer content-center text-lg font-semibold text-tinta-suave">
            Archivadas ({archivadas.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {archivadas.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="flex-1 text-lg text-tinta-suave">
                  {p.nombre} <span className="text-base">· {nombreDepto(p.departamento_id)}</span>
                </span>
                <Boton variante="secundario" compacto onClick={() => reactivar(p)}>
                  Reactivar
                </Boton>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function AgregarPersona({
  departamentos,
  personas,
  nombreDepto,
  mostrar,
  onAgregada,
}: {
  departamentos: Departamento[]
  /** Las activas, para avisar si ya hay alguien que suena parecido. */
  personas: Persona[]
  nombreDepto: (id: number) => string
  mostrar: (aviso: DatosAviso) => void
  onAgregada: () => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [departamentoId, setDepartamentoId] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const listo = nombre.trim() !== '' && departamentoId !== null

  async function agregar(e: FormEvent) {
    e.preventDefault()
    if (!listo || guardando) return
    setGuardando(true)
    const limpio = nombre.trim()
    const { error } = await supabase.from('personas').insert({ nombre: limpio, departamento_id: departamentoId })
    setGuardando(false)
    if (error) {
      mostrar({ tipo: 'error', texto: mensajeDeError(error) })
      return
    }
    // Se deja el departamento elegido: suelen agregarse varias del mismo.
    setNombre('')
    mostrar({ tipo: 'ok', texto: `Se agregó a ${limpio}.` })
    await onAgregada()
  }

  return (
    <form onSubmit={agregar} className="flex flex-col gap-3 rounded-xl border border-linea bg-superficie p-4">
      <span className="text-lg font-semibold">Agregar persona</span>
      <div className="grid gap-3 sm:grid-cols-[3fr_2fr]">
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-tinta-suave">Nombre y apellido</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-tinta-suave">Departamento</span>
          <select
            value={departamentoId ?? ''}
            onChange={(e) => setDepartamentoId(e.target.value ? Number(e.target.value) : null)}
            className={campo}
          >
            <option value="">Elegir...</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Parecidas nombre={nombre} personas={personas} nombreDepto={nombreDepto} />
      <Boton type="submit" className="self-end" disabled={!listo || guardando}>
        {guardando ? 'Agregando...' : 'Agregar'}
      </Boton>
    </form>
  )
}

function EditarPersona({
  persona,
  departamentos,
  onGuardar,
  onCancelar,
}: {
  persona: Persona
  departamentos: Departamento[]
  onGuardar: (cambios: { nombre: string; departamento_id: number }) => Promise<void>
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(persona.nombre)
  const [departamentoId, setDepartamentoId] = useState(persona.departamento_id)
  const [guardando, setGuardando] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || guardando) return
    setGuardando(true)
    await onGuardar({ nombre: nombre.trim(), departamento_id: departamentoId })
    setGuardando(false)
  }

  return (
    <li className="bg-marca-suave p-4">
      <form onSubmit={guardar} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[3fr_2fr]">
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold text-tinta-suave">Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold text-tinta-suave">Departamento</span>
            <select value={departamentoId} onChange={(e) => setDepartamentoId(Number(e.target.value))} className={campo}>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-base text-tinta-suave">
          Las compras que ya hizo quedan con el departamento de ese momento.
        </p>
        <div className="flex justify-end gap-3">
          <Boton variante="secundario" compacto onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton type="submit" compacto disabled={!nombre.trim() || guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </Boton>
        </div>
      </form>
    </li>
  )
}
