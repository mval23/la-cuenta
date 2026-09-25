import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Boton, BotonVolver } from '../componentes/Boton'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { campo } from '../componentes/estilos'
import { MensajeDeError } from '../componentes/MensajeDeError'
import { Parecidas } from '../componentes/Parecidas'
import type { DatosAviso } from '../componentes/useAviso'
import { guardarPago } from '../lib/pagos'
import { normalizarNombre } from '../lib/personas'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Departamento, Persona, Saldo } from '../lib/tipos'
import { DetallePersona } from './DetallePersona'

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

/**
 * Todas las personas. Tocar una abre su detalle, el mismo de Registrar y
 * Cobrar: ahí se cambia el nombre o el departamento, se archiva o se une.
 */
export function Personas({ mostrar, onVolver }: { mostrar: (aviso: DatosAviso) => void; onVolver: () => void }) {
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  const [saldos, setSaldos] = useState<ReadonlyMap<number, Saldo>>(new Map())
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState<number | null>(null)
  const posicionDeLista = useRef(0)

  const cargar = useCallback(async () => {
    const [p, d, s] = await Promise.all([
      supabase.from('personas').select('id, nombre, departamento_id, activo'),
      supabase.from('departamentos').select('id, nombre, alias, activo').order('nombre'),
      supabase.from('saldos').select('persona_id, nombre, departamento_id, departamento, activo, comprado, pagado, saldo'),
    ])
    setErrorDeCarga(p.error !== null || d.error !== null)
    if (d.data) setDepartamentos(d.data)
    if (!p.data) return
    // Quien no sale en los saldos (sin permiso para verlos, por ejemplo) queda
    // en cero. Se arma aquí, una vez: el detalle se recarga si su saldo cambia.
    const porPersona = new Map((s.data ?? []).map((x) => [x.persona_id, x]))
    for (const persona of p.data) {
      if (porPersona.has(persona.id)) continue
      porPersona.set(persona.id, {
        persona_id: persona.id,
        nombre: persona.nombre,
        departamento_id: persona.departamento_id,
        departamento: d.data?.find((x) => x.id === persona.departamento_id)?.nombre ?? '',
        activo: persona.activo,
        comprado: 0,
        pagado: 0,
        saldo: 0,
      })
    }
    setSaldos(porPersona)
    setPersonas(p.data)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // El detalle abre desde arriba; al volver, la lista queda donde estaba.
  useLayoutEffect(() => {
    window.scrollTo(0, abierta === null ? posicionDeLista.current : 0)
  }, [abierta])

  function abrir(id: number) {
    posicionDeLista.current = window.scrollY
    setAbierta(id)
  }

  if (personas === null) {
    return errorDeCarga ? (
      <ErrorDeCarga texto="No se pudieron cargar las personas." onReintentar={cargar} />
    ) : (
      <p className="text-lg text-tinta-suave">Cargando personas...</p>
    )
  }

  const nombreDepto = (id: number) => departamentos.find((d) => d.id === id)?.nombre ?? ''

  const saldo = abierta === null ? undefined : saldos.get(abierta)
  if (saldo) {
    return (
      <DetallePersona
        key={saldo.persona_id}
        saldo={saldo}
        enPanel={false}
        volverA="Personas"
        onVolver={() => setAbierta(null)}
        onCambio={cargar}
        onPago={(valor, tipo) => guardarPago({ saldo, valor, tipo, mostrar, recargar: cargar })}
        onUnida={async (id) => {
          await cargar()
          setAbierta(id)
        }}
        mostrar={mostrar}
      />
    )
  }

  const activos = departamentos.filter((d) => d.activo)
  const activas = personas.filter((p) => p.activo)
  const archivadas = personas
    .filter((p) => !p.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
  const grupos = agrupar(activas, departamentos, busqueda)

  const fila = (p: Persona, conDepartamento = false) => {
    const debe = saldos.get(p.id)?.saldo ?? 0
    return (
      <li key={p.id}>
        <button
          type="button"
          onClick={() => abrir(p.id)}
          className="flex min-h-14 w-full items-center gap-3 py-1.5 pr-3 pl-4 text-left active:bg-hundido"
        >
          <span className={`min-w-0 flex-1 text-lg ${p.activo ? '' : 'text-tinta-suave'}`}>
            {p.nombre}
            {conDepartamento && <span className="text-base text-tinta-suave"> · {nombreDepto(p.departamento_id)}</span>}
          </span>
          {debe > 0 && <span className="text-lg tabular-nums text-tinta-suave">Debe {formatearPesos(debe)}</span>}
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 fill-none stroke-tinta-tenue stroke-2">
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <BotonVolver texto="Volver a Ajustes" className="-mb-2" onClick={onVolver} />
      <h1 className="text-titulo font-bold">Personas</h1>

      <p className="text-lg text-tinta-suave">
        Toca a una persona para cambiar su nombre o su departamento, archivarla o unirla con otra repetida.
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
            {g.personas.map((p) => fila(p))}
          </ul>
        </div>
      ))}

      {archivadas.length > 0 && (
        <details className="rounded-xl border border-linea bg-superficie p-4">
          <summary className="min-h-11 cursor-pointer content-center text-lg font-semibold text-tinta-suave">
            Archivadas ({archivadas.length})
          </summary>
          <p className="mt-2 text-lg text-tinta-suave">No aparecen al registrar. Toca una para volver a mostrarla.</p>
          <ul className="-mx-4 mt-3 divide-y divide-linea border-t border-linea">
            {archivadas.map((p) => fila(p, true))}
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
  // Un nombre repetido se avisa debajo de los campos, donde se corrige.
  const [error, setError] = useState<string | null>(null)
  const idError = useId()
  const listo = nombre.trim() !== '' && departamentoId !== null

  async function agregar(e: FormEvent) {
    e.preventDefault()
    if (!listo || guardando) return
    setGuardando(true)
    const limpio = nombre.trim()
    const { error } = await supabase.from('personas').insert({ nombre: limpio, departamento_id: departamentoId })
    setGuardando(false)
    if (error) {
      if (error.code === '23505') setError(`Ya hay una persona llamada ${limpio} en ${nombreDepto(departamentoId)}.`)
      else mostrar({ tipo: 'error', texto: 'No se pudo guardar. Revisa el internet e intenta otra vez.' })
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
            onChange={(e) => {
              setError(null)
              setNombre(e.target.value)
            }}
            autoComplete="off"
            autoCapitalize="words"
            aria-invalid={error !== null}
            aria-describedby={error ? idError : undefined}
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-tinta-suave">Departamento</span>
          <select
            value={departamentoId ?? ''}
            onChange={(e) => {
              setError(null)
              setDepartamentoId(e.target.value ? Number(e.target.value) : null)
            }}
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
      {error && <MensajeDeError id={idError} texto={error} />}
      <Parecidas nombre={nombre} personas={personas} nombreDepto={nombreDepto} />
      <Boton type="submit" className="self-end" disabled={!listo || guardando}>
        {guardando ? 'Agregando...' : 'Agregar'}
      </Boton>
    </form>
  )
}
