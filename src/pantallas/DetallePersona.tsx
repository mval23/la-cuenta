import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { DatosAviso } from '../componentes/useAviso'
import { Boton, BotonVolver } from '../componentes/Boton'
import { Confirmar } from '../componentes/Confirmar'
import { ElegirDia } from '../componentes/ElegirDia'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { BuscarPersona, type Quien } from '../componentes/BuscarPersona'
import { DatosDePersona } from '../componentes/DatosDePersona'
import { campo, etiqueta } from '../componentes/estilos'
import { PanelDePago } from '../componentes/Pago'
import { fechaLarga, hoyBogota, inicioDeQuincenas, nombreDeQuincena, quincenaDe, type Quincena } from '../lib/fechas'
import type { TipoDePago } from '../lib/pagos'
import { formatearPesos, valorInusual } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Saldo } from '../lib/tipos'

// Cuántas quincenas de historial se ven al abrir (unos tres meses); "Ver más
// atrás" agrega otras tantas.
const QUINCENAS_POR_VEZ = 6

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
  diaParaAgregar,
  onVolver,
  onCambio,
  onPago,
  onUnida,
  mostrar,
}: {
  saldo: Saldo
  /** En horizontal va al lado de la lista en vez de reemplazarla. */
  enPanel: boolean
  /** La pantalla a la que lleva "Volver". */
  volverA?: string
  /**
   * Desde Registrar se le pueden anotar más compras aquí mismo; empiezan en el
   * día que se está registrando. Sin esto no aparece el botón.
   */
  diaParaAgregar?: string
  onVolver: () => void
  onCambio: () => Promise<void>
  /**
   * Registrar que pagó o abonó sin volver a la lista: en el iPad de Amparo el
   * detalle tapa la lista. Devuelve si se guardó.
   */
  onPago: (valor: number, tipo: TipoDePago) => Promise<boolean>
  /** Tras unirla con otra persona (que queda archivada): abrir la otra. */
  onUnida: (personaId: number) => Promise<void>
  mostrar: (aviso: DatosAviso) => void
}) {
  // Con el día desde el que se trajeron: el saldo anterior se calcula con ese día.
  const [cargados, setCargados] = useState<{ desde: string; lista: Movimiento[] } | null>(null)
  const movimientos = cargados?.lista ?? null
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [pagando, setPagando] = useState<TipoDePago | null>(null)
  const [quincenas, setQuincenas] = useState(QUINCENAS_POR_VEZ)
  const desde = inicioDeQuincenas(hoyBogota(), quincenas)
  // Se pidió más atrás y todavía no llega.
  const trayendoMas = cargados !== null && cargados.desde !== desde

  const cargar = useCallback(async () => {
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
    setCargados({
      desde,
      lista: [
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
    })
  }, [s.persona_id, desde])

  // También cada vez que la pantalla de afuera vuelve a traer el saldo: se pudo
  // pagar desde la lista, o anotar algo en otra pestaña.
  useEffect(() => {
    cargar()
  }, [cargar, s])

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

  async function agregar(compra: Omit<Correccion, 'quien'>): Promise<boolean> {
    const { data, error } = await supabase
      .from('compras')
      .insert({
        persona_id: s.persona_id,
        descripcion: compra.descripcion,
        valor_pesos: compra.valor,
        fecha: compra.fecha,
      })
      .select('id')
      .single()
    if (error) {
      mostrar({ tipo: 'error', texto: 'No se pudo guardar. Revisa el internet e intenta otra vez.' })
      return false
    }
    setAgregando(false)
    await Promise.all([cargar(), onCambio()])
    mostrar({
      tipo: 'ok',
      texto:
        `Guardado: ${[s.nombre, compra.descripcion, formatearPesos(compra.valor)].filter(Boolean).join(', ')}` +
        (compra.fecha === hoyBogota() ? '' : `, ${fechaCorta(compra.fecha)}`),
      deshacer: async () => {
        const { error: errorDeshacer } = await supabase.from('compras').update({ anulada: true }).eq('id', data.id)
        await Promise.all([cargar(), onCambio()])
        if (errorDeshacer) mostrar({ tipo: 'error', texto: 'No se pudo deshacer. Revisa el internet.' })
        else mostrar({ tipo: 'ok', texto: 'Se deshizo la compra.' })
      },
    })
    return true
  }

  /** Abre un formulario de arriba y cierra lo que estuviera abierto en la lista. */
  function abrir(cual: () => void) {
    setEditando(null)
    setConfirmando(null)
    cual()
  }

  /** Una compra o un pago del historial: se toca para corregirlo. */
  function renglon(m: Movimiento) {
    const esPago = m.tabla === 'pagos'
    const contenido = (
      <>
        <div className={`min-w-0 flex-1 ${m.anulado ? 'text-tinta-tenue line-through' : ''}`}>
          {/* El día va primero y grande: así se busca en el historial. */}
          <p className="text-lg font-semibold">{fechaCorta(m.fecha)}</p>
          <p
            className={`text-base ${esPago && !m.anulado ? 'font-semibold text-exito' : m.anulado ? '' : 'text-tinta-suave'}`}
          >
            {m.texto}
          </p>
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
              variante="secundario"
              compacto
              className="w-24"
              aria-label={`Anular: ${m.texto}, ${fechaCorta(m.fecha)}, ${formatearPesos(m.valor)}`}
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
          <Confirmar
            pregunta={`¿Anular ${esPago ? 'este pago' : 'esta compra'}?`}
            textoSi="Sí, anular"
            onNo={() => setConfirmando(null)}
            onSi={() => anular(m)}
          />
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
  }

  const suma = (lista: Movimiento[], tabla: Movimiento['tabla']) =>
    lista.filter((m) => !m.anulado && m.tabla === tabla).reduce((total, m) => total + m.valor, 0)
  // Por quincena, de la más reciente a la más vieja (la lista ya viene así).
  const grupos: { quincena: Quincena; lista: Movimiento[] }[] = []
  for (const m of movimientos ?? []) {
    const quincena = quincenaDe(m.fecha)
    const ultimo = grupos.at(-1)
    if (ultimo?.quincena.desde === quincena.desde) ultimo.lista.push(m)
    else grupos.push({ quincena, lista: [m] })
  }
  // Lo que venía debiendo de antes de lo que se ve: así el saldo de arriba cuadra con la lista.
  const anterior = cargados && s.saldo - (suma(cargados.lista, 'compras') - suma(cargados.lista, 'pagos'))
  const Subtitulo = enPanel ? 'h3' : 'h2'

  const puedeAgregar = diaParaAgregar !== undefined && s.activo
  const aFavor = s.saldo < 0
  const Titulo = enPanel ? 'h2' : 'h1'

  return (
    <section className="flex flex-col gap-5">
      {!enPanel && (
        <BotonVolver texto={`Volver a ${volverA}`} onClick={onVolver} />
      )}

      {/* En el panel, el saldo va debajo del nombre y "Cerrar" a la derecha. */}
      <div
        className={`flex justify-between gap-x-4 gap-y-2 ${enPanel ? 'flex-col' : 'flex-wrap items-end'}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Titulo className="text-titulo font-bold">{s.nombre}</Titulo>
            <p className="text-lg text-tinta-suave">
              {s.departamento}
              {!s.activo && ' · Archivada'}
            </p>
          </div>
          {enPanel && (
            <Boton variante="secundario" compacto onClick={onVolver}>
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

      {/* Cobrarle aquí mismo; una archivada que debe también puede pagar, pero ya no compra.
          Desde Registrar lo principal es anotar otra compra; desde Cobrar, el pago. */}
      {pagando === null && !agregando && (s.saldo > 0 || puedeAgregar) && (
        <div className="flex flex-wrap gap-3">
          {puedeAgregar && (
            <Boton variante="tintado" onClick={() => abrir(() => setAgregando(true))}>
              <span aria-hidden="true" className="mr-1 text-2xl leading-none">
                +
              </span>
              Otra compra
            </Boton>
          )}
          {s.saldo > 0 && (
            <>
              <Boton
                variante={puedeAgregar ? 'secundario' : 'tintado'}
                onClick={() => abrir(() => setPagando('total'))}
              >
                Pagó todo
              </Boton>
              <Boton variante="secundario" onClick={() => abrir(() => setPagando('abono'))}>
                Abono
              </Boton>
            </>
          )}
        </div>
      )}
      {pagando !== null && (
        <PanelDePago
          saldo={s}
          tipo={pagando}
          onPago={onPago}
          onCerrar={() => setPagando(null)}
          className="rounded-xl"
        />
      )}
      {agregando && diaParaAgregar && (
        <AgregarCompra
          nombre={s.nombre}
          dia={diaParaAgregar}
          onCancelar={() => setAgregando(false)}
          onGuardar={agregar}
        />
      )}

      {errorDeCarga && <ErrorDeCarga texto="No se pudo cargar el historial." onReintentar={cargar} />}
      {cargados === null && !errorDeCarga && <p className="text-lg text-tinta-suave">Cargando...</p>}

      {cargados && (
        <div className="flex flex-col gap-4">
          {grupos.length === 0 ? (
            <p className="text-lg text-tinta-suave">No hay compras ni pagos desde el {fechaLarga(cargados.desde)}.</p>
          ) : (
            <p className="-mb-2 text-lg text-tinta-suave">Toca una compra o un pago para cambiarlo.</p>
          )}
          {grupos.map((g) => {
            const compro = suma(g.lista, 'compras')
            const pago = suma(g.lista, 'pagos')
            return (
              <div key={g.quincena.desde} className="flex flex-col gap-2">
                <Subtitulo className="flex flex-wrap items-baseline justify-between gap-x-4 text-lg font-semibold">
                  <span>Del {nombreDeQuincena(g.quincena)}</span>
                  <span className="text-lg font-normal text-tinta-suave tabular-nums">
                    {[compro > 0 && `Compró ${formatearPesos(compro)}`, pago > 0 && `Pagó ${formatearPesos(pago)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </Subtitulo>
                <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
                  {g.lista.map(renglon)}
                </ul>
              </div>
            )
          })}
          {anterior !== null && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-hundido px-4 py-3">
              <p className="mr-auto text-lg">
                Antes del {fechaLarga(cargados.desde)}:{' '}
                <span className="font-semibold tabular-nums">
                  {anterior > 0
                    ? `debía ${formatearPesos(anterior)}`
                    : anterior < 0
                      ? `tenía ${formatearPesos(-anterior)} a favor`
                      : 'estaba al día'}
                </span>
              </p>
              <Boton
                variante="secundario"
                compacto
                disabled={trayendoMas}
                onClick={() => setQuincenas((antes) => antes + QUINCENAS_POR_VEZ)}
              >
                {trayendoMas ? 'Cargando...' : 'Ver más atrás'}
              </Boton>
            </div>
          )}
        </div>
      )}

      <DatosDePersona saldo={s} enPanel={enPanel} mostrar={mostrar} onCambio={onCambio} onUnida={onUnida} />
    </section>
  )
}

function AgregarCompra({
  nombre,
  dia,
  onCancelar,
  onGuardar,
}: {
  nombre: string
  /** El día con que empieza: el que se está registrando. */
  dia: string
  onCancelar: () => void
  onGuardar: (compra: Omit<Correccion, 'quien'>) => Promise<boolean>
}) {
  const [valor, setValor] = useState('')
  const [fecha, setFecha] = useState(dia)
  const [queLlevo, setQueLlevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  // Un valor raro (casi siempre un "mil" que falta) se confirma antes de guardar.
  const [preguntando, setPreguntando] = useState(false)
  const campoValor = useRef<HTMLInputElement>(null)
  const hoy = hoyBogota()
  const numero = Number(valor)
  const inusual = valorInusual(numero)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!(numero > 0) || guardando) return
    if (inusual && !preguntando) {
      setPreguntando(true)
      return
    }
    setGuardando(true)
    // Si salió bien, este formulario se cierra solo.
    if (!(await onGuardar({ valor: numero, fecha, descripcion: queLlevo.trim() || null }))) setGuardando(false)
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4 rounded-xl border border-linea bg-superficie p-4 shadow-sm">
      <p className="text-xl font-semibold">Otra compra de {nombre}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={etiqueta}>Cuánto</span>
          <span className="flex min-h-14 items-center rounded-xl border border-control bg-superficie px-4 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-marca">
            <span aria-hidden="true" className="text-2xl font-bold text-tinta-suave">
              $
            </span>
            <input
              ref={campoValor}
              value={valor === '' ? '' : Number(valor).toLocaleString('es-CO')}
              onChange={(e) => {
                setPreguntando(false)
                setValor(soloDigitos(e.target.value))
              }}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="0"
              aria-label="Cuánto, en pesos"
              className="w-full min-w-0 bg-transparent pl-1 text-2xl font-bold tabular-nums outline-none placeholder:text-tinta-tenue"
            />
          </span>
        </label>
        <div className="flex flex-col gap-2">
          <span className={etiqueta}>Día</span>
          <ElegirDia dia={fecha} hoy={hoy} etiqueta="Día de la compra" resaltado={fecha !== hoy} onCambiar={setFecha} />
        </div>
      </div>
      <label className="flex flex-col gap-2">
        <span className={etiqueta}>
          Qué llevó <span className="font-normal">(opcional)</span>
        </span>
        <input
          value={queLlevo}
          onChange={(e) => setQueLlevo(e.target.value)}
          autoComplete="off"
          placeholder="Almuerzo, tinto..."
          className={`${campo} text-xl`}
        />
      </label>
      {preguntando ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-aviso-suave p-4">
          <div className="mr-auto">
            <p className="text-xl font-semibold">
              ¿Seguro que son <span className="tabular-nums">{formatearPesos(numero)}</span>?
            </p>
            <p className="text-lg text-aviso">
              {inusual === 'bajo' ? 'Parece poco para una compra. ¿Faltó poner "mil"?' : 'Parece mucho para una compra.'}
            </p>
          </div>
          <Boton
            variante="secundario"
            compacto
            onClick={() => {
              setPreguntando(false)
              campoValor.current?.focus()
              campoValor.current?.select()
            }}
          >
            Corregir
          </Boton>
          <Boton type="submit" compacto disabled={guardando}>
            {guardando ? 'Guardando...' : `Sí, son ${formatearPesos(numero)}`}
          </Boton>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-3">
          <Boton variante="secundario" compacto onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton type="submit" compacto className="min-w-32" disabled={!(numero > 0) || guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </Boton>
        </div>
      )}
    </form>
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
        <span className={etiqueta}>Quién</span>
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
          <span className={etiqueta}>Qué llevó (si quieres)</span>
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
          <span className={etiqueta}>Cuánto</span>
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
          <span className={etiqueta}>Día</span>
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
