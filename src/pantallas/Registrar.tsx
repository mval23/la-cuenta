import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Aviso } from '../componentes/Aviso'
import { useAviso } from '../componentes/useAviso'
import { Boton } from '../componentes/Boton'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { campo } from '../componentes/estilos'
import { Microfono } from '../componentes/Microfono'
import { leerDictado } from '../lib/dictado'
import { hora, hoyBogota } from '../lib/fechas'
import { normalizarNombre, resolverPersona, vocabulario } from '../lib/personas'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Departamento, Perfil, Persona } from '../lib/tipos'

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

export function Registrar({ perfil, activa }: { perfil: Perfil; activa: boolean }) {
  const [departamentos, setDepartamentos] = useState<Departamento[] | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [texto, setTexto] = useState('')
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [hoy, setHoy] = useState<CompraDeHoy[]>([])
  const { aviso, mostrar, cerrar } = useAviso()
  const entrada = useRef<HTMLInputElement>(null)
  const puedeAnular = perfil.rol === 'admin' || perfil.rol === 'operador'

  const cargarDepartamentos = useCallback(async () => {
    const { data, error } = await supabase
      .from('departamentos')
      .select('id, nombre, alias, activo')
      .eq('activo', true)
      .order('nombre')
    setErrorDeCarga(error !== null)
    if (data) setDepartamentos(data)
  }, [])

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

  // Se recarga al volver a la pestaña: en Ajustes o en Cobrar pudo cambiar algo.
  useEffect(() => {
    if (!activa) return
    cargarDepartamentos()
    cargarPersonas()
    cargarHoy()
  }, [activa, cargarDepartamentos, cargarPersonas, cargarHoy])

  function alEnviar(e: FormEvent) {
    e.preventDefault()
    leer(texto)
  }

  function leer(texto: string) {
    const frase = texto.trim()
    if (!frase || !departamentos) return
    cerrar()
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
    cerrar()
    const personaId = b.personaId ?? (await crearPersona(b.nombreNuevo.trim(), b.departamentoId!))
    if (personaId === null) {
      mostrar({ tipo: 'error', texto: 'No se pudo crear la persona. Revisa el internet e intenta otra vez.' })
      return
    }
    const { data, error } = await supabase
      .from('compras')
      .insert({
        persona_id: personaId,
        descripcion: b.descripcion.trim(),
        valor_pesos: Number(b.valor),
        texto_original: b.textoOriginal,
      })
      .select('id')
      .single()
    if (error) {
      mostrar({ tipo: 'error', texto: 'No se pudo guardar. Revisa el internet e intenta otra vez.' })
      return
    }
    const persona = personas.find((p) => p.id === personaId)
    const nombre = persona?.nombre ?? b.nombreNuevo.trim()
    mostrar({
      tipo: 'ok',
      texto: `Guardado: ${nombre}, ${b.descripcion.trim()}, ${formatearPesos(Number(b.valor))}`,
      deshacer: puedeAnular ? () => cambiarAnulada(data.id, true, 'Se deshizo la compra.') : undefined,
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

  async function cambiarAnulada(id: number, anulada: boolean, textoOk: string) {
    const { error } = await supabase.from('compras').update({ anulada }).eq('id', id)
    if (error) mostrar({ tipo: 'error', texto: 'No se pudo hacer el cambio. Revisa el internet.' })
    else mostrar({ tipo: 'ok', texto: textoOk })
    await cargarHoy()
  }

  async function anular(c: CompraDeHoy) {
    const { error } = await supabase.from('compras').update({ anulada: true }).eq('id', c.id)
    await cargarHoy()
    if (error) {
      mostrar({ tipo: 'error', texto: 'No se pudo anular. Revisa el internet.' })
      return
    }
    mostrar({
      tipo: 'ok',
      texto: `Se anuló: ${c.personas?.nombre ?? ''}, ${c.descripcion}, ${formatearPesos(c.valor_pesos)}`,
      deshacer: () => cambiarAnulada(c.id, false, 'Se recuperó la compra.'),
    })
  }

  if (departamentos === null) {
    return errorDeCarga ? (
      <ErrorDeCarga texto="No se pudieron cargar los departamentos." onReintentar={cargarDepartamentos} />
    ) : (
      <p className="text-lg text-stone-600">Cargando...</p>
    )
  }

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-titulo font-bold">Registrar</h1>

      {departamentos.length === 0 && (
        <p className="rounded-xl bg-amber-50 p-4 text-lg text-amber-900">
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
        <form onSubmit={alEnviar} className="flex flex-col gap-3">
          {/* Solo en la pestaña visible, para que el micrófono no quede encendido. */}
          {activa && (
            <Microfono
              vocabulario={() => vocabulario(personas, departamentos)}
              onTexto={(dicho) => {
                setTexto(dicho)
                leer(dicho)
              }}
              onError={(mensaje) => mostrar({ tipo: 'error', texto: mensaje })}
              onEmpezar={cerrar}
            />
          )}
          <label htmlFor="frase" className="pt-1 text-base text-stone-600">
            O escríbelo. Por ejemplo: Juan TDH almuerzo a 10 mil
          </label>
          <div className="flex gap-3">
            <input
              id="frase"
              ref={entrada}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoComplete="off"
              enterKeyHint="go"
              className={`${campo} flex-1`}
            />
            <Boton type="submit" disabled={!texto.trim()}>
              Seguir
            </Boton>
          </div>
        </form>
      )}

      <ComprasDeHoy compras={hoy} puedeAnular={puedeAnular} onAnular={anular} />

      <Aviso aviso={aviso} onCerrar={cerrar} />
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
  // Con sugerencias, primero se muestran solo ellas; la persona nueva, si se pide.
  const [otraPersona, setOtraPersona] = useState(false)
  const cambiar = (cambios: Partial<Borrador>) => onCambiar({ ...b, ...cambios })
  const nombreDepto = (id: number) => departamentos.find((d) => d.id === id)?.nombre ?? ''
  const elegida = personas.find((p) => p.id === b.personaId) ?? null
  const personaNueva = elegida === null && (b.candidatas.length === 0 || otraPersona)

  const valor = Number(b.valor)
  const faltan = [
    !(elegida !== null || (personaNueva && b.nombreNuevo.trim() !== '' && b.departamentoId !== null)) &&
      (personaNueva ? 'nombre y departamento' : 'elegir quién'),
    b.descripcion.trim() === '' && 'qué compró',
    !(valor > 0) && 'cuánto',
  ].filter((f): f is string => typeof f === 'string')
  const listo = faltan.length === 0

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!listo || guardando) return
    setGuardando(true)
    await onGuardar(b)
    setGuardando(false)
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-base text-stone-600">Se entendió: «{b.textoOriginal}»</p>

      <div className="flex flex-col gap-2">
        <span className="text-base font-semibold text-stone-600">Quién</span>
        {elegida ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-xl font-semibold">
              {elegida.nombre}{' '}
              <span className="font-normal text-stone-600">· {nombreDepto(elegida.departamento_id)}</span>
            </p>
            <Boton
              variante="secundario"
              compacto
              onClick={() => {
                // Se ofrecen las que empiezan con el mismo nombre, además de crear una nueva.
                const primer = normalizarNombre(elegida.nombre).split(' ')[0]
                const parecidas = personas.filter((p) => normalizarNombre(p.nombre).split(' ')[0] === primer)
                setOtraPersona(false)
                cambiar({ personaId: null, candidatas: b.candidatas.length > 0 ? b.candidatas : parecidas })
              }}
            >
              Cambiar
            </Boton>
          </div>
        ) : personaNueva ? (
          <>
            <p className="text-base text-stone-600">Persona nueva. Revisa el nombre y el departamento:</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={b.nombreNuevo}
                onChange={(e) => cambiar({ nombreNuevo: e.target.value })}
                placeholder="Nombre"
                aria-label="Nombre de la persona nueva"
                autoComplete="off"
                className={campo}
              />
              <select
                value={b.departamentoId ?? ''}
                onChange={(e) => cambiar({ departamentoId: e.target.value ? Number(e.target.value) : null })}
                aria-label="Departamento de la persona nueva"
                className={campo}
              >
                <option value="">Elegir departamento...</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
            {b.candidatas.length > 0 && (
              <Boton variante="texto" compacto className="-ml-4 self-start" onClick={() => setOtraPersona(false)}>
                Volver a las personas sugeridas
              </Boton>
            )}
          </>
        ) : (
          <>
            <p className="text-base text-stone-600">¿Es alguna de estas personas?</p>
            <div className="flex flex-col gap-2">
              {b.candidatas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => cambiar({ personaId: p.id })}
                  className="min-h-12 rounded-xl border border-stone-300 px-4 text-left text-lg active:bg-stone-100"
                >
                  <span className="font-semibold">{p.nombre}</span>{' '}
                  <span className="text-stone-600">· {nombreDepto(p.departamento_id)}</span>
                </button>
              ))}
            </div>
            <Boton variante="texto" compacto className="-ml-4 self-start" onClick={() => setOtraPersona(true)}>
              No es ninguna: es una persona nueva
            </Boton>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[3fr_2fr]">
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-stone-600">Qué</span>
          <input
            value={b.descripcion}
            onChange={(e) => cambiar({ descripcion: e.target.value })}
            autoComplete="off"
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-stone-600">Cuánto</span>
          <input
            value={b.valor}
            onChange={(e) => cambiar({ valor: soloDigitos(e.target.value) })}
            inputMode="numeric"
            autoComplete="off"
            className={`${campo} tabular-nums`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
        <div className="mr-auto">
          <p className="text-3xl font-bold tabular-nums">{valor > 0 ? formatearPesos(valor) : '$ —'}</p>
          {!listo && <p className="text-base text-amber-900">Falta: {faltan.join(', ')}.</p>}
        </div>
        <Boton variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" className="min-w-40" disabled={!listo || guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
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
  onAnular: (c: CompraDeHoy) => Promise<void>
}) {
  const [confirmando, setConfirmando] = useState<number | null>(null)
  if (compras.length === 0) return null

  const vigentes = compras.filter((c) => !c.anulada)
  const total = vigentes.reduce((suma, c) => suma + c.valor_pesos, 0)

  return (
    <div className="flex flex-col gap-2 pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">
          Hoy <span className="text-base font-normal text-stone-600">
            · {vigentes.length} {vigentes.length === 1 ? 'compra' : 'compras'}
          </span>
        </h2>
        <span className="text-lg font-semibold tabular-nums">{formatearPesos(total)}</span>
      </div>
      <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {compras.map((c) => (
          <li key={c.id}>
            <div className="flex items-center gap-3 py-2 pr-3 pl-4">
              <div className={`min-w-0 flex-1 ${c.anulada ? 'text-stone-500 line-through' : ''}`}>
                <p className="text-lg">
                  <span className="font-semibold">{c.personas?.nombre}</span>{' '}
                  <span className={c.anulada ? '' : 'text-stone-600'}>· {c.departamentos?.nombre}</span>
                </p>
                <p className={`text-base ${c.anulada ? '' : 'text-stone-600'}`}>
                  {c.descripcion} · {hora(c.creada_en)}
                </p>
              </div>
              <span className={`text-lg font-semibold tabular-nums ${c.anulada ? 'text-stone-500 line-through' : ''}`}>
                {formatearPesos(c.valor_pesos)}
              </span>
              {c.anulada ? (
                <span className="w-24 text-center text-base text-stone-600">Anulada</span>
              ) : (
                puedeAnular && (
                  <Boton
                    variante="peligro"
                    compacto
                    className="w-24"
                    disabled={confirmando === c.id}
                    onClick={() => setConfirmando(c.id)}
                  >
                    Anular
                  </Boton>
                )
              )}
            </div>
            {confirmando === c.id && (
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-red-50 px-4 py-3">
                <span className="mr-auto text-lg">¿Anular esta compra?</span>
                <Boton variante="secundario" compacto onClick={() => setConfirmando(null)}>
                  No
                </Boton>
                <Boton
                  variante="peligro"
                  compacto
                  onClick={() => {
                    setConfirmando(null)
                    onAnular(c)
                  }}
                >
                  Sí, anular
                </Boton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
