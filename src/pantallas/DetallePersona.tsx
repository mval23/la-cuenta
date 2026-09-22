import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { DatosAviso } from '../componentes/useAviso'
import { Boton } from '../componentes/Boton'
import { ElegirDia } from '../componentes/ElegirDia'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { campo } from '../componentes/estilos'
import { hoyBogota } from '../lib/fechas'
import { normalizarNombre } from '../lib/personas'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Saldo } from '../lib/tipos'

// Cuánto historial se muestra: alcanza para revisar varias quincenas.
const DIAS_DE_HISTORIAL = 90

/**
 * Compras y pagos no se editan en la base: corregir anota uno nuevo y anula el
 * viejo con este motivo. Los corregidos no se muestran.
 */
export const MOTIVO_CORREGIDA = 'corregida'

interface Movimiento {
  clave: string
  tabla: 'compras' | 'pagos'
  id: number
  fecha: string
  creado: string
  texto: string
  valor: number
  anulado: boolean
  /** Qué llevó; solo en compras, y puede faltar. */
  descripcion: string | null
  /** Lo que hace falta para anotarlo de nuevo al corregirlo. */
  copia: Record<string, unknown>
}

/** De quién es: al corregir se puede pasar a otra persona. */
interface Quien {
  id: number
  nombre: string
  departamento: string
}

/** Lo que se puede cambiar al corregir. */
interface Correccion {
  quien: Quien
  valor: number
  fecha: string
  descripcion: string | null
}

const formatoFecha = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** "2026-09-15" -> "mar, 15 sept" */
function fechaCorta(fecha: string): string {
  return formatoFecha.format(new Date(`${fecha}T00:00:00Z`))
}

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '').replace(/^0+/, '')
}

function anulacion(tabla: Movimiento['tabla'], anulado: boolean, motivo?: string) {
  return tabla === 'compras'
    ? { anulada: anulado, anulada_motivo: motivo ?? null }
    : { anulado, anulado_motivo: motivo ?? null }
}

export function DetallePersona({
  saldo: s,
  enPanel,
  volverA = 'Cobrar',
  onVolver,
  onCambio,
  mostrar,
}: {
  saldo: Saldo
  /** En horizontal va al lado de la lista en vez de reemplazarla. */
  enPanel: boolean
  /** La pantalla a la que lleva "Volver". */
  volverA?: string
  onVolver: () => void
  onCambio: () => Promise<void>
  mostrar: (aviso: DatosAviso) => void
}) {
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const desde = new Date(Date.now() - DIAS_DE_HISTORIAL * 86_400_000).toISOString().slice(0, 10)
    const [compras, pagos] = await Promise.all([
      supabase
        .from('compras')
        .select('id, fecha, creada_en, descripcion, texto_original, valor_pesos, anulada, anulada_motivo')
        .eq('persona_id', s.persona_id)
        .gte('fecha', desde),
      supabase
        .from('pagos')
        .select('id, fecha, creado_en, tipo, valor_pesos, anulado, anulado_motivo')
        .eq('persona_id', s.persona_id)
        .gte('fecha', desde),
    ])
    if (compras.error || pagos.error) {
      setErrorDeCarga(true)
      return
    }
    setErrorDeCarga(false)
    setMovimientos(
      [
        ...compras.data
          .filter((c) => c.anulada_motivo !== MOTIVO_CORREGIDA)
          .map((c): Movimiento => ({
            clave: `c${c.id}`,
            tabla: 'compras',
            id: c.id,
            fecha: c.fecha,
            creado: c.creada_en,
            texto: c.descripcion ?? 'Compra',
            valor: c.valor_pesos,
            anulado: c.anulada,
            descripcion: c.descripcion,
            copia: { descripcion: c.descripcion, texto_original: c.texto_original },
          })),
        ...pagos.data
          .filter((p) => p.anulado_motivo !== MOTIVO_CORREGIDA)
          .map((p): Movimiento => ({
            clave: `p${p.id}`,
            tabla: 'pagos',
            id: p.id,
            fecha: p.fecha,
            creado: p.creado_en,
            texto: p.tipo === 'total' ? 'Pagó todo' : 'Abono',
            valor: p.valor_pesos,
            anulado: p.anulado,
            descripcion: null,
            copia: { tipo: p.tipo },
          })),
        // Por día, y dentro del día lo último primero: lo corregido queda en su día.
      ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado)),
    )
  }, [s.persona_id])

  // También cuando cambia el saldo: en horizontal se puede pagar desde la lista
  // con el historial abierto al lado.
  useEffect(() => {
    cargar()
  }, [cargar, s.saldo])

  async function cambiarAnulado(m: Movimiento, anulado: boolean): Promise<boolean> {
    const { error } = await supabase.from(m.tabla).update(anulacion(m.tabla, anulado)).eq('id', m.id)
    await Promise.all([cargar(), onCambio()])
    return !error
  }

  async function anular(m: Movimiento) {
    setConfirmando(null)
    const que = m.tabla === 'pagos' ? 'el pago' : 'la compra'
    if (!(await cambiarAnulado(m, true))) {
      mostrar({ tipo: 'error', texto: 'No se pudo anular. Revisa el internet.' })
      return
    }
    mostrar({
      tipo: 'ok',
      texto: `Se anuló ${que}: ${m.texto}, ${formatearPesos(m.valor)}`,
      deshacer: async () => {
        if (await cambiarAnulado(m, false)) mostrar({ tipo: 'ok', texto: `Se recuperó ${que}.` })
        else mostrar({ tipo: 'error', texto: 'No se pudo deshacer. Revisa el internet.' })
      },
    })
  }

  /** Anota uno nuevo con lo corregido y anula el viejo. */
  async function corregir(m: Movimiento, { quien, valor, fecha, descripcion }: Correccion): Promise<boolean> {
    const que = m.tabla === 'pagos' ? 'el pago' : 'la compra'
    const aOtra = quien.id !== s.persona_id
    const { data: nuevo, error } = await supabase
      .from(m.tabla)
      .insert({
        ...m.copia,
        ...(m.tabla === 'compras' ? { descripcion } : {}),
        persona_id: quien.id,
        valor_pesos: valor,
        fecha,
      })
      .select('id')
      .single()
    if (error) {
      mostrar({ tipo: 'error', texto: 'No se pudo corregir. Revisa el internet e intenta otra vez.' })
      return false
    }
    const { error: errorViejo } = await supabase
      .from(m.tabla)
      .update(anulacion(m.tabla, true, MOTIVO_CORREGIDA))
      .eq('id', m.id)
    if (errorViejo) {
      // Sin anular el viejo quedaría contado dos veces: se quita el nuevo.
      await supabase.from(m.tabla).update(anulacion(m.tabla, true, MOTIVO_CORREGIDA)).eq('id', nuevo.id)
      await Promise.all([cargar(), onCambio()])
      mostrar({ tipo: 'error', texto: 'No se pudo corregir. Revisa el internet e intenta otra vez.' })
      return false
    }
    setEditando(null)
    await Promise.all([cargar(), onCambio()])
    mostrar({
      tipo: 'ok',
      texto: aOtra
        ? `Se pasó ${que} a ${quien.nombre}: ${formatearPesos(valor)}, ${fechaCorta(fecha)}`
        : `Se corrigió ${que}: ${formatearPesos(valor)}, ${fechaCorta(fecha)}`,
      deshacer: async () => {
        const [a, b] = await Promise.all([
          supabase.from(m.tabla).update(anulacion(m.tabla, true, MOTIVO_CORREGIDA)).eq('id', nuevo.id),
          supabase.from(m.tabla).update(anulacion(m.tabla, false)).eq('id', m.id),
        ])
        await Promise.all([cargar(), onCambio()])
        if (a.error || b.error) mostrar({ tipo: 'error', texto: 'No se pudo deshacer. Revisa el internet.' })
        else mostrar({ tipo: 'ok', texto: `Se deshizo la corrección.` })
      },
    })
    return true
  }

  const aFavor = s.saldo < 0
  const Titulo = enPanel ? 'h2' : 'h1'

  return (
    <section className="flex flex-col gap-5">
      {!enPanel && (
        <Boton variante="texto" className="-ml-3 self-start" onClick={onVolver}>
          <span aria-hidden="true">‹ </span>Volver a {volverA}
        </Boton>
      )}

      {/* En el panel, el saldo va debajo del nombre y "Cerrar" a la derecha. */}
      <div
        className={`flex justify-between gap-x-4 gap-y-2 ${enPanel ? 'flex-col' : 'flex-wrap items-end'}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Titulo className="text-titulo font-bold">{s.nombre}</Titulo>
            <p className="text-lg text-tinta-suave">{s.departamento}</p>
          </div>
          {enPanel && (
            <Boton variante="texto" compacto className="-mr-3" onClick={onVolver}>
              Cerrar
            </Boton>
          )}
        </div>
        <p className={`text-3xl font-bold tabular-nums ${aFavor || s.saldo === 0 ? 'text-exito' : ''}`}>
          {aFavor
            ? `A favor ${formatearPesos(-s.saldo)}`
            : s.saldo === 0
              ? 'Al día'
              : `Debe ${formatearPesos(s.saldo)}`}
        </p>
      </div>

      {errorDeCarga && <ErrorDeCarga texto="No se pudo cargar el historial." onReintentar={cargar} />}
      {movimientos === null && !errorDeCarga && <p className="text-lg text-tinta-suave">Cargando...</p>}
      {movimientos?.length === 0 && (
        <p className="text-lg text-tinta-suave">No hay movimientos en los últimos {DIAS_DE_HISTORIAL} días.</p>
      )}

      {movimientos && movimientos.length > 0 && (
        <>
          <p className="-mb-3 text-base text-tinta-suave">Toca uno para cambiarlo.</p>
          <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
            {movimientos.map((m) => {
              const esPago = m.tabla === 'pagos'
              const contenido = (
                <>
                  <div className={`min-w-0 flex-1 ${m.anulado ? 'text-tinta-tenue line-through' : ''}`}>
                    <p className={`text-lg ${esPago && !m.anulado ? 'font-semibold text-exito' : ''}`}>{m.texto}</p>
                    <p className="text-base text-tinta-suave">{fechaCorta(m.fecha)}</p>
                  </div>
                  <span
                    className={`text-lg font-semibold tabular-nums ${
                      m.anulado ? 'text-tinta-tenue line-through' : esPago ? 'text-exito' : ''
                    }`}
                  >
                    {esPago ? '−' : ''}
                    {formatearPesos(m.valor)}
                  </span>
                </>
              )
              const clasesRenglon = 'flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left'
              return (
                <li key={m.clave}>
                  <div className="flex items-center gap-3 pr-3">
                    {/* Lo anulado no se corrige: primero se recupera con Deshacer. */}
                    {m.anulado ? (
                      <div className={clasesRenglon}>{contenido}</div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmando(null)
                          setEditando(editando === m.clave ? null : m.clave)
                        }}
                        aria-expanded={editando === m.clave}
                        className={`${clasesRenglon} active:bg-hundido`}
                      >
                        {contenido}
                      </button>
                    )}
                    {m.anulado ? (
                      <span className="w-24 text-center text-base text-tinta-suave">Anulado</span>
                    ) : (
                      <Boton
                        variante="peligro"
                        compacto
                        className="w-24"
                        disabled={confirmando === m.clave}
                        onClick={() => {
                          setEditando(null)
                          setConfirmando(m.clave)
                        }}
                      >
                        Anular
                      </Boton>
                    )}
                  </div>
                  {confirmando === m.clave && (
                    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-peligro-suave px-4 py-3">
                      <span className="mr-auto text-lg">¿Anular {esPago ? 'este pago' : 'esta compra'}?</span>
                      <Boton variante="secundario" compacto onClick={() => setConfirmando(null)}>
                        No
                      </Boton>
                      <Boton variante="peligro" compacto onClick={() => anular(m)}>
                        Sí, anular
                      </Boton>
                    </div>
                  )}
                  {editando === m.clave && (
                    <Editar
                      movimiento={m}
                      persona={{ id: s.persona_id, nombre: s.nombre, departamento: s.departamento }}
                      onCancelar={() => setEditando(null)}
                      onGuardar={(correccion) => corregir(m, correccion)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

function Editar({
  movimiento: m,
  persona,
  onCancelar,
  onGuardar,
}: {
  movimiento: Movimiento
  persona: Quien
  onCancelar: () => void
  onGuardar: (correccion: Correccion) => Promise<boolean>
}) {
  const [valor, setValor] = useState(String(m.valor))
  const [fecha, setFecha] = useState(m.fecha)
  const [queLlevo, setQueLlevo] = useState(m.descripcion ?? '')
  const [quien, setQuien] = useState(persona)
  const [cambiandoQuien, setCambiandoQuien] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const hoy = hoyBogota()
  const numero = Number(valor)
  const descripcion = queLlevo.trim() || null
  const sinCambios = numero === m.valor && fecha === m.fecha && descripcion === m.descripcion && quien.id === persona.id

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!(numero > 0) || sinCambios || guardando) return
    setGuardando(true)
    // Si salió bien, este formulario se cierra solo.
    if (!(await onGuardar({ quien, valor: numero, fecha, descripcion }))) setGuardando(false)
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4 bg-hundido px-4 py-4">
      <div className="flex flex-col gap-2">
        <span className="text-base font-semibold text-tinta-suave">Quién</span>
        {cambiandoQuien ? (
          <BuscarPersona
            onElegir={(q) => {
              setQuien(q)
              setCambiandoQuien(false)
            }}
            onCancelar={() => setCambiandoQuien(false)}
          />
        ) : (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-xl font-bold">
              {quien.nombre} <span className="font-semibold text-tinta-suave">· {quien.departamento}</span>
            </p>
            <Boton variante="secundario" compacto onClick={() => setCambiandoQuien(true)}>
              Cambiar
            </Boton>
          </div>
        )}
      </div>
      {m.tabla === 'compras' && (
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-tinta-suave">Qué llevó (si quieres)</span>
          <input
            value={queLlevo}
            onChange={(e) => setQueLlevo(e.target.value)}
            autoComplete="off"
            placeholder="Almuerzo, tinto..."
            className="min-h-14 rounded-xl border border-control bg-superficie px-4 text-xl outline-none placeholder:text-tinta-tenue focus:outline-3 focus:outline-offset-2 focus:outline-marca"
          />
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-tinta-suave">Cuánto</span>
          <span className="flex min-h-14 items-center rounded-xl border border-control bg-superficie px-4 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-marca">
            <span aria-hidden="true" className="text-2xl font-bold text-tinta-suave">
              $
            </span>
            <input
              value={valor === '' ? '' : Number(valor).toLocaleString('es-CO')}
              onChange={(e) => setValor(soloDigitos(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              aria-label="Cuánto, en pesos"
              className="w-full min-w-0 bg-transparent pl-1 text-2xl font-bold tabular-nums outline-none placeholder:text-tinta-tenue"
            />
          </span>
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-base font-semibold text-tinta-suave">Día</span>
          <ElegirDia
            dia={fecha}
            hoy={hoy}
            etiqueta={m.tabla === 'pagos' ? 'Día del pago' : 'Día de la compra'}
            onCambiar={setFecha}
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Boton variante="secundario" compacto onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" compacto className="min-w-32" disabled={!(numero > 0) || sinCambios || guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </Boton>
      </div>
    </form>
  )
}

/** Buscar a quién pasarle una compra o un pago: por nombre, o nombre y departamento. */
function BuscarPersona({ onElegir, onCancelar }: { onElegir: (q: Quien) => void; onCancelar: () => void }) {
  const [personas, setPersonas] = useState<Quien[] | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('personas')
      .select('id, nombre, departamentos(nombre)')
      .eq('activo', true)
    if (error) {
      setErrorDeCarga(true)
      return
    }
    setErrorDeCarga(false)
    setPersonas(
      (data as unknown as { id: number; nombre: string; departamentos: { nombre: string } | null }[]).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        departamento: p.departamentos?.nombre ?? '',
      })),
    )
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const palabras = normalizarNombre(busqueda).split(' ').filter(Boolean)
  const encontradas =
    personas === null || palabras.length === 0
      ? []
      : personas
          .filter((p) => {
            const donde = normalizarNombre(`${p.nombre} ${p.departamento}`)
            return palabras.every((palabra) => donde.includes(palabra))
          })
          .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
  const MAXIMO = 8

  return (
    <div className="flex flex-col gap-2">
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre"
        aria-label="Buscar a quién pasarlo"
        autoComplete="off"
        autoCapitalize="words"
        autoFocus
        className={campo}
      />
      {errorDeCarga ? (
        <ErrorDeCarga texto="No se pudo cargar las personas." onReintentar={cargar} />
      ) : personas === null ? (
        <p className="text-base text-tinta-suave">Cargando...</p>
      ) : palabras.length === 0 ? (
        <p className="text-base text-tinta-suave">Escribe el nombre, o el nombre y el departamento.</p>
      ) : encontradas.length === 0 ? (
        <p className="text-base text-tinta-suave">No hay nadie con ese nombre.</p>
      ) : (
        <>
          {encontradas.slice(0, MAXIMO).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onElegir(p)}
              className="min-h-14 rounded-xl border border-control bg-superficie px-4 text-left text-xl active:bg-hundido"
            >
              <span className="font-semibold">{p.nombre}</span>{' '}
              <span className="font-semibold text-tinta-suave">· {p.departamento}</span>
            </button>
          ))}
          {encontradas.length > MAXIMO && (
            <p className="text-base text-tinta-suave">
              Hay {encontradas.length - MAXIMO} más. Escribe más del nombre o el departamento.
            </p>
          )}
        </>
      )}
      <Boton variante="texto" compacto className="-ml-4 self-start" onClick={onCancelar}>
        Dejarlo en la misma persona
      </Boton>
    </div>
  )
}
