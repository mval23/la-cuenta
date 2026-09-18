import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Boton } from '../componentes/Boton'
import { leerDictado } from '../lib/dictado'
import { hora, hoyBogota } from '../lib/fechas'
import { normalizarNombre, resolverPersona } from '../lib/personas'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Departamento, Perfil, Persona } from '../lib/tipos'

const campo = 'min-h-14 w-full rounded-2xl border-2 border-stone-300 bg-white px-4'

interface Borrador {
  textoOriginal: string
  personaId: number | null
  candidatas: Persona[]
  /** Para crear una persona nueva cuando no se elige una existente. */
  nombreNuevo: string
  departamentoId: number | null
  descripcion: string
  valor: string
}

interface CompraDeHoy {
  id: number
  descripcion: string
  valor_pesos: number
  anulada: boolean
  creada_en: string
  personas: { nombre: string } | null
  departamentos: { nombre: string } | null
}

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '').replace(/^0+/, '')
}

export function Registrar({ perfil }: { perfil: Perfil }) {
  const [departamentos, setDepartamentos] = useState<Departamento[] | null>(null)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [texto, setTexto] = useState('')
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [hoy, setHoy] = useState<CompraDeHoy[]>([])
  const entrada = useRef<HTMLInputElement>(null)

  const cargarPersonas = useCallback(async () => {
    const { data } = await supabase
      .from('personas')
      .select('id, nombre, departamento_id, activo')
      .eq('activo', true)
    if (data) setPersonas(data)
  }, [])

  const cargarHoy = useCallback(async () => {
    const { data } = await supabase
      .from('compras')
      .select('id, descripcion, valor_pesos, anulada, creada_en, personas(nombre), departamentos(nombre)')
      .eq('fecha', hoyBogota())
      .order('creada_en', { ascending: false })
    if (data) setHoy(data as unknown as CompraDeHoy[])
  }, [])

  useEffect(() => {
    supabase
      .from('departamentos')
      .select('id, nombre, alias, activo')
      .eq('activo', true)
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setAviso({ tipo: 'error', texto: 'No se pudieron cargar los departamentos.' })
        else setDepartamentos(data)
      })
    cargarPersonas()
    cargarHoy()
  }, [cargarPersonas, cargarHoy])

  function leer(e: FormEvent) {
    e.preventDefault()
    const frase = texto.trim()
    if (!frase || !departamentos) return
    setAviso(null)
    const dictado = leerDictado(frase, departamentos)
    const resuelta = resolverPersona(dictado, personas)
    setBorrador({
      textoOriginal: frase,
      personaId: resuelta.persona?.id ?? null,
      candidatas: resuelta.candidatas,
      nombreNuevo: dictado.nombre,
      departamentoId: dictado.departamentoId,
      descripcion: resuelta.descripcion,
      valor: dictado.valor ? String(dictado.valor) : '',
    })
  }

  function cancelar() {
    setBorrador(null)
    entrada.current?.focus()
  }

  async function guardar(b: Borrador) {
    setAviso(null)
    const personaId = b.personaId ?? (await crearPersona(b.nombreNuevo.trim(), b.departamentoId!))
    if (personaId === null) {
      setAviso({ tipo: 'error', texto: 'No se pudo crear la persona. Revisa la conexión.' })
      return
    }
    const { error } = await supabase.from('compras').insert({
      persona_id: personaId,
      descripcion: b.descripcion.trim(),
      valor_pesos: Number(b.valor),
      texto_original: b.textoOriginal,
    })
    if (error) {
      setAviso({ tipo: 'error', texto: 'No se pudo guardar. Revisa la conexión e intenta de nuevo.' })
      return
    }
    const persona = personas.find((p) => p.id === personaId)
    const nombre = persona?.nombre ?? b.nombreNuevo.trim()
    setAviso({
      tipo: 'ok',
      texto: `Guardado: ${nombre}, ${b.descripcion.trim()}, ${formatearPesos(Number(b.valor))}`,
    })
    setBorrador(null)
    setTexto('')
    cargarPersonas()
    cargarHoy()
    entrada.current?.focus()
  }

  /** Crea la persona; si ya existía con ese nombre en el departamento, usa esa. */
  async function crearPersona(nombre: string, departamentoId: number): Promise<number | null> {
    const { data, error } = await supabase
      .from('personas')
      .insert({ nombre, departamento_id: departamentoId })
      .select('id')
      .single()
    if (data) return data.id
    if (error?.code !== '23505') return null
    const { data: existentes } = await supabase
      .from('personas')
      .select('id, nombre')
      .eq('departamento_id', departamentoId)
      .eq('activo', true)
    const clave = normalizarNombre(nombre)
    return existentes?.find((p) => normalizarNombre(p.nombre) === clave)?.id ?? null
  }

  async function anular(id: number) {
    const { error } = await supabase.from('compras').update({ anulada: true }).eq('id', id)
    if (error) setAviso({ tipo: 'error', texto: 'No se pudo anular. Revisa la conexión.' })
    cargarHoy()
  }

  if (departamentos === null) {
    return <p className="text-lg text-stone-500">{aviso?.texto ?? 'Cargando...'}</p>
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Registrar</h1>

      {departamentos.length === 0 && (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900">
          Primero hay que crear los departamentos en Ajustes.
        </p>
      )}

      {borrador ? (
        <Confirmacion
          borrador={borrador}
          departamentos={departamentos}
          personas={personas}
          onCambiar={setBorrador}
          onGuardar={guardar}
          onCancelar={cancelar}
        />
      ) : (
        <form onSubmit={leer} className="flex flex-col gap-3">
          <label htmlFor="frase" className="text-lg text-stone-600">
            Quién, departamento, qué y cuánto. Por ejemplo: Juan TDH almuerzo a 10 mil
          </label>
          <div className="flex gap-3">
            <input
              id="frase"
              ref={entrada}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoComplete="off"
              enterKeyHint="go"
              className={`${campo} flex-1 text-xl`}
            />
            <button
              type="submit"
              disabled={!texto.trim()}
              className="min-h-14 rounded-2xl bg-amber-800 px-6 font-semibold text-white active:bg-amber-900 disabled:bg-stone-400"
            >
              Seguir
            </button>
          </div>
        </form>
      )}

      {aviso && (
        <p
          role="status"
          className={`rounded-2xl p-4 text-lg ${
            aviso.tipo === 'ok' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <ComprasDeHoy
        compras={hoy}
        puedeAnular={perfil.rol === 'admin' || perfil.rol === 'operador'}
        onAnular={anular}
      />
    </section>
  )
}

// Tarjeta de confirmación -----------------------------------------------------

function Confirmacion({
  borrador: b,
  departamentos,
  personas,
  onCambiar,
  onGuardar,
  onCancelar,
}: {
  borrador: Borrador
  departamentos: Departamento[]
  personas: Persona[]
  onCambiar: (b: Borrador) => void
  onGuardar: (b: Borrador) => Promise<void>
  onCancelar: () => void
}) {
  const [guardando, setGuardando] = useState(false)
  const cambiar = (cambios: Partial<Borrador>) => onCambiar({ ...b, ...cambios })
  const nombreDepto = (id: number) => departamentos.find((d) => d.id === id)?.nombre ?? ''
  const elegida = personas.find((p) => p.id === b.personaId) ?? null

  const personaLista = elegida !== null || (b.nombreNuevo.trim() !== '' && b.departamentoId !== null)
  const valor = Number(b.valor)
  const listo = personaLista && b.descripcion.trim() !== '' && valor > 0

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!listo || guardando) return
    setGuardando(true)
    await onGuardar(b)
    setGuardando(false)
  }

  return (
    <form
      onSubmit={guardar}
      className="flex flex-col gap-6 rounded-3xl border-2 border-amber-700 bg-white p-5"
    >
      <p className="text-base text-stone-500">Se entendió: «{b.textoOriginal}»</p>

      <div className="flex flex-col gap-3">
        <span className="text-lg font-semibold">Quién</span>
        {elegida ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-2xl font-bold">
              {elegida.nombre}{' '}
              <span className="font-normal text-stone-500">· {nombreDepto(elegida.departamento_id)}</span>
            </p>
            <Boton
              variante="secundario"
              onClick={() => {
                // Se ofrecen las que empiezan con el mismo nombre, además de crear una nueva.
                const primer = normalizarNombre(elegida.nombre).split(' ')[0]
                const parecidas = personas.filter((p) => normalizarNombre(p.nombre).split(' ')[0] === primer)
                cambiar({ personaId: null, candidatas: b.candidatas.length > 0 ? b.candidatas : parecidas })
              }}
            >
              Cambiar
            </Boton>
          </div>
        ) : (
          <>
            {b.candidatas.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-base text-stone-600">¿Es alguna de estas personas?</p>
                {b.candidatas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => cambiar({ personaId: p.id })}
                    className="min-h-14 rounded-2xl border-2 border-stone-300 px-4 text-left text-xl active:bg-stone-100"
                  >
                    <span className="font-semibold">{p.nombre}</span>{' '}
                    <span className="text-stone-500">· {nombreDepto(p.departamento_id)}</span>
                  </button>
                ))}
                <p className="pt-2 text-base text-stone-600">Si no es ninguna, es una persona nueva:</p>
              </div>
            )}
            {b.candidatas.length === 0 && (
              <p className="text-base text-stone-600">Persona nueva. Revisa el nombre y el departamento:</p>
            )}
            <input
              value={b.nombreNuevo}
              onChange={(e) => cambiar({ nombreNuevo: e.target.value })}
              placeholder="Nombre"
              aria-label="Nombre de la persona nueva"
              autoComplete="off"
              className={`${campo} text-xl`}
            />
            <select
              value={b.departamentoId ?? ''}
              onChange={(e) => cambiar({ departamentoId: e.target.value ? Number(e.target.value) : null })}
              aria-label="Departamento de la persona nueva"
              className={`${campo} text-xl`}
            >
              <option value="">Elegir departamento...</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-lg font-semibold">Qué</span>
        <input
          value={b.descripcion}
          onChange={(e) => cambiar({ descripcion: e.target.value })}
          autoComplete="off"
          className={`${campo} text-xl`}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-lg font-semibold">Cuánto</span>
        <input
          value={b.valor}
          onChange={(e) => cambiar({ valor: soloDigitos(e.target.value) })}
          inputMode="numeric"
          autoComplete="off"
          className={`${campo} text-xl`}
        />
        {valor > 0 && <span className="text-2xl font-bold">{formatearPesos(valor)}</span>}
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!listo || guardando}
          className="min-h-16 flex-1 rounded-2xl bg-amber-800 px-8 text-xl font-bold text-white active:bg-amber-900 disabled:bg-stone-400"
        >
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
        <Boton variante="secundario" className="min-h-16" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}

// Lo registrado hoy -----------------------------------------------------------

function ComprasDeHoy({
  compras,
  puedeAnular,
  onAnular,
}: {
  compras: CompraDeHoy[]
  puedeAnular: boolean
  onAnular: (id: number) => void
}) {
  const [confirmando, setConfirmando] = useState<number | null>(null)
  if (compras.length === 0) return null

  const total = compras.filter((c) => !c.anulada).reduce((suma, c) => suma + c.valor_pesos, 0)

  return (
    <div className="flex flex-col gap-3 border-t-2 border-stone-200 pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-2xl font-bold">Hoy</h2>
        <span className="text-xl font-semibold">{formatearPesos(total)}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {compras.map((c) => (
          <li
            key={c.id}
            className={`flex flex-wrap items-center gap-3 rounded-2xl border-2 border-stone-200 bg-white p-4 ${
              c.anulada ? 'opacity-50' : ''
            }`}
          >
            <div className={`min-w-0 flex-1 ${c.anulada ? 'line-through' : ''}`}>
              <p className="text-xl">
                <span className="font-semibold">{c.personas?.nombre}</span>{' '}
                <span className="text-stone-500">· {c.departamentos?.nombre}</span>
              </p>
              <p className="text-lg text-stone-600">
                {c.descripcion} · {hora(c.creada_en)}
              </p>
            </div>
            <span className="text-xl font-semibold">{formatearPesos(c.valor_pesos)}</span>
            {c.anulada && <span className="text-base text-stone-500">Anulada</span>}
            {puedeAnular && !c.anulada && confirmando !== c.id && (
              <Boton variante="peligro" onClick={() => setConfirmando(c.id)}>
                Anular
              </Boton>
            )}
            {confirmando === c.id && (
              <div className="flex w-full items-center justify-end gap-3">
                <span className="text-lg">¿Anular esta compra?</span>
                <Boton
                  variante="peligro"
                  onClick={() => {
                    setConfirmando(null)
                    onAnular(c.id)
                  }}
                >
                  Sí, anular
                </Boton>
                <Boton variante="secundario" onClick={() => setConfirmando(null)}>
                  No
                </Boton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
