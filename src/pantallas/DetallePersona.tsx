import { useCallback, useEffect, useState } from 'react'
import { Boton } from '../componentes/Boton'
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
}: {
  saldo: Saldo
  onVolver: () => void
  onCambio: () => void
}) {
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      setError('No se pudo cargar el historial.')
      return
    }
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

  async function anular(m: Movimiento) {
    setConfirmando(null)
    const cambio = m.tabla === 'compras' ? { anulada: true } : { anulado: true }
    const { error } = await supabase.from(m.tabla).update(cambio).eq('id', m.id)
    if (error) setError('No se pudo anular. Revisa la conexión.')
    await cargar()
    onCambio()
  }

  const aFavor = s.saldo < 0

  return (
    <section className="flex flex-col gap-6">
      <Boton variante="secundario" className="self-start" onClick={onVolver}>
        Volver a la lista
      </Boton>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{s.nombre}</h1>
          <p className="text-xl text-stone-500">{s.departamento}</p>
        </div>
        <p className={`text-3xl font-bold ${aFavor ? 'text-green-800' : ''}`}>
          {aFavor
            ? `A favor ${formatearPesos(-s.saldo)}`
            : s.saldo === 0
              ? 'Al día'
              : `Debe ${formatearPesos(s.saldo)}`}
        </p>
      </div>

      {error && <p className="text-lg text-red-800">{error}</p>}
      {movimientos === null && !error && <p className="text-lg text-stone-500">Cargando...</p>}
      {movimientos?.length === 0 && (
        <p className="text-lg text-stone-600">No hay movimientos en los últimos {DIAS_DE_HISTORIAL} días.</p>
      )}

      <ul className="flex flex-col gap-2">
        {movimientos?.map((m) => (
          <li
            key={m.clave}
            className={`flex flex-wrap items-center gap-3 rounded-2xl border-2 bg-white p-4 ${
              m.tabla === 'pagos' ? 'border-green-200' : 'border-stone-200'
            } ${m.anulado ? 'opacity-50' : ''}`}
          >
            <div className={`min-w-0 flex-1 ${m.anulado ? 'line-through' : ''}`}>
              <p className={`text-xl ${m.tabla === 'pagos' ? 'font-semibold text-green-900' : ''}`}>{m.texto}</p>
              <p className="text-base text-stone-500">{fechaCorta(m.fecha)}</p>
            </div>
            <span className={`text-xl font-semibold ${m.tabla === 'pagos' ? 'text-green-900' : ''}`}>
              {m.tabla === 'pagos' ? '-' : ''}
              {formatearPesos(m.valor)}
            </span>
            {m.anulado && <span className="text-base text-stone-500">Anulado</span>}
            {!m.anulado && confirmando !== m.clave && (
              <Boton variante="peligro" onClick={() => setConfirmando(m.clave)}>
                Anular
              </Boton>
            )}
            {confirmando === m.clave && (
              <div className="flex w-full items-center justify-end gap-3">
                <span className="text-lg">¿Anular {m.tabla === 'pagos' ? 'este pago' : 'esta compra'}?</span>
                <Boton variante="peligro" onClick={() => anular(m)}>
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
    </section>
  )
}
