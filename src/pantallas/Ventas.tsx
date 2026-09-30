import { useCallback, useEffect, useState } from 'react'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { fechaLarga, hoyBogota, inicioDeQuincenas, nombreDeQuincena } from '../lib/fechas'
import { formatearPesos } from '../lib/pesos'
import { traerVentas } from '../lib/traerVentas'
import { resumirVentas, type Ventas as DatosVentas } from '../lib/ventas'

// Las quincenas de antes que se ven debajo de la de hoy (unos tres meses en total).
const QUINCENAS_ANTERIORES = 5

const formatoDia = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric' })

/** "2026-09-29" -> "mar 29" */
function diaCorto(dia: string): string {
  return formatoDia.format(new Date(`${dia}T12:00:00Z`)).replace(',', '')
}

function cuantasCompras(n: number): string {
  if (n === 0) return 'Todavía no hay compras'
  return n === 1 ? '1 compra' : `${n} compras`
}

export function Ventas({ activa }: { activa: boolean }) {
  const [ventas, setVentas] = useState<DatosVentas | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)

  const cargar = useCallback(async () => {
    const hoy = hoyBogota()
    const compras = await traerVentas(inicioDeQuincenas(hoy, QUINCENAS_ANTERIORES + 1))
    if (!compras) {
      setErrorDeCarga(true)
      return
    }
    setErrorDeCarga(false)
    setVentas(resumirVentas(compras, hoy, QUINCENAS_ANTERIORES))
  }, [])

  // De nuevo al volver a la pestaña: se pudo registrar algo mientras tanto.
  useEffect(() => {
    if (activa) cargar()
  }, [activa, cargar])

  if (errorDeCarga) return <ErrorDeCarga texto="No se pudieron traer las ventas." onReintentar={cargar} />
  if (!ventas) return <p className="text-lg text-tinta-suave">Cargando...</p>
  return <ResumenDeVentas ventas={ventas} />
}

function ResumenDeVentas({ ventas }: { ventas: DatosVentas }) {
  const mayor = Math.max(1, ...ventas.dias.map((d) => d.total))

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-linea bg-superficie px-5 py-4">
        <p className="text-lg text-tinta-suave">Hoy, {fechaLarga(ventas.hoy.fecha)}</p>
        <p className="text-5xl font-bold tabular-nums">{formatearPesos(ventas.hoy.total)}</p>
        <p className="text-lg text-tinta-suave">{cuantasCompras(ventas.hoy.compras)}</p>
      </div>

      <div className="rounded-xl border border-linea bg-superficie px-5 py-4">
        <p className="text-lg text-tinta-suave">Esta quincena, del {nombreDeQuincena(ventas.quincena)}</p>
        <p className="text-5xl font-bold tabular-nums">{formatearPesos(ventas.totalQuincena)}</p>
        <p className="text-lg text-tinta-suave">
          {ventas.dias.length === 1 ? '1 día con ventas' : `${ventas.dias.length} días con ventas`}
        </p>
      </div>

      {ventas.dias.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Cada día de esta quincena</h2>
          <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
            {ventas.dias.map((d) => (
              <li
                key={d.fecha}
                className={`grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2.5 text-lg ${
                  d.fecha === ventas.hoy.fecha ? 'bg-marca-suave' : ''
                }`}
              >
                <span className="font-semibold">{diaCorto(d.fecha)}</span>
                {/* Solo para comparar de un vistazo: el valor va escrito al lado. */}
                <span aria-hidden="true" className="h-3.5">
                  <span className="block h-full rounded-full bg-marca" style={{ width: `${(d.total / mayor) * 100}%` }} />
                </span>
                <span className="text-right font-semibold tabular-nums">{formatearPesos(d.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Quincenas anteriores</h2>
        <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
          {ventas.anteriores.map((a) => (
            <li key={a.quincena.desde} className="flex flex-wrap items-center justify-between gap-x-4 px-4 py-3 text-lg">
              <span>Del {nombreDeQuincena(a.quincena)}</span>
              <span className="text-2xl font-bold tabular-nums">{formatearPesos(a.total)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
