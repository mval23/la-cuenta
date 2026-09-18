import { useCallback, useEffect, useState } from 'react'
import type { DatosAviso } from '../componentes/useAviso'
import { Boton } from '../componentes/Boton'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Saldo } from '../lib/tipos'

// Cuánto historial se muestra: alcanza para revisar varias quincenas.
const DIAS_DE_HISTORIAL = 90

interface Movimiento {
  clave: string
  tabla: 'compras' | 'pagos'
  id: number
  fecha: string
  creado: string
  texto: string
  valor: number
  anulado: boolean
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

export function DetallePersona({
  saldo: s,
  onVolver,
  onCambio,
  mostrar,
}: {
  saldo: Saldo
  onVolver: () => void
  onCambio: () => Promise<void>
  mostrar: (aviso: DatosAviso) => void
}) {
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const desde = new Date(Date.now() - DIAS_DE_HISTORIAL * 86_400_000).toISOString().slice(0, 10)
    const [compras, pagos] = await Promise.all([
      supabase
        .from('compras')
        .select('id, fecha, creada_en, descripcion, valor_pesos, anulada')
        .eq('persona_id', s.persona_id)
        .gte('fecha', desde),
      supabase
        .from('pagos')
        .select('id, fecha, creado_en, tipo, valor_pesos, anulado')
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
        ...compras.data.map((c): Movimiento => ({
          clave: `c${c.id}`,
          tabla: 'compras',
          id: c.id,
          fecha: c.fecha,
          creado: c.creada_en,
          texto: c.descripcion,
          valor: c.valor_pesos,
          anulado: c.anulada,
        })),
        ...pagos.data.map((p): Movimiento => ({
          clave: `p${p.id}`,
          tabla: 'pagos',
          id: p.id,
          fecha: p.fecha,
          creado: p.creado_en,
          texto: p.tipo === 'total' ? 'Pagó todo' : 'Abono',
          valor: p.valor_pesos,
          anulado: p.anulado,
        })),
      ].sort((a, b) => b.creado.localeCompare(a.creado)),
    )
  }, [s.persona_id])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function cambiarAnulado(m: Movimiento, anulado: boolean): Promise<boolean> {
    const cambio = m.tabla === 'compras' ? { anulada: anulado } : { anulado }
    const { error } = await supabase.from(m.tabla).update(cambio).eq('id', m.id)
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

  const aFavor = s.saldo < 0

  return (
    <section className="flex flex-col gap-5">
      <Boton variante="texto" className="-ml-3 self-start" onClick={onVolver}>
        <span aria-hidden="true">‹ </span>Volver a Cobrar
      </Boton>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-titulo font-bold">{s.nombre}</h1>
          <p className="text-lg text-stone-600">{s.departamento}</p>
        </div>
        <p className={`text-3xl font-bold tabular-nums ${aFavor || s.saldo === 0 ? 'text-green-800' : ''}`}>
          {aFavor
            ? `A favor ${formatearPesos(-s.saldo)}`
            : s.saldo === 0
              ? 'Al día'
              : `Debe ${formatearPesos(s.saldo)}`}
        </p>
      </div>

      {errorDeCarga && <ErrorDeCarga texto="No se pudo cargar el historial." onReintentar={cargar} />}
      {movimientos === null && !errorDeCarga && <p className="text-lg text-stone-600">Cargando...</p>}
      {movimientos?.length === 0 && (
        <p className="text-lg text-stone-600">No hay movimientos en los últimos {DIAS_DE_HISTORIAL} días.</p>
      )}

      {movimientos && movimientos.length > 0 && (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {movimientos.map((m) => {
            const esPago = m.tabla === 'pagos'
            return (
              <li key={m.clave}>
                <div className="flex items-center gap-3 py-2 pr-3 pl-4">
                  <div className={`min-w-0 flex-1 ${m.anulado ? 'text-stone-500 line-through' : ''}`}>
                    <p className={`text-lg ${esPago && !m.anulado ? 'font-semibold text-green-800' : ''}`}>{m.texto}</p>
                    <p className="text-base text-stone-600">{fechaCorta(m.fecha)}</p>
                  </div>
                  <span
                    className={`text-lg font-semibold tabular-nums ${
                      m.anulado ? 'text-stone-500 line-through' : esPago ? 'text-green-800' : ''
                    }`}
                  >
                    {esPago ? '−' : ''}
                    {formatearPesos(m.valor)}
                  </span>
                  {m.anulado ? (
                    <span className="w-24 text-center text-base text-stone-600">Anulado</span>
                  ) : (
                    <Boton
                      variante="peligro"
                      compacto
                      className="w-24"
                      disabled={confirmando === m.clave}
                      onClick={() => setConfirmando(m.clave)}
                    >
                      Anular
                    </Boton>
                  )}
                </div>
                {confirmando === m.clave && (
                  <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-red-50 px-4 py-3">
                    <span className="mr-auto text-lg">¿Anular {esPago ? 'este pago' : 'esta compra'}?</span>
                    <Boton variante="secundario" compacto onClick={() => setConfirmando(null)}>
                      No
                    </Boton>
                    <Boton variante="peligro" compacto onClick={() => anular(m)}>
                      Sí, anular
                    </Boton>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
