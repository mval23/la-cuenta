import { useState } from 'react'
import { campo } from './estilos'
import { DIAS_ATRAS_PERMITIDOS, fechaLarga, nombreCompletoDelDia, sumarDias } from '../lib/fechas'

const OTRO = 'otro'

/** Lista con los últimos 7 días por nombre ("Ayer, jueves 17 de septiembre") y "Otro día..." con calendario. */
export function ElegirDia({
  dia,
  hoy,
  onCambiar,
  etiqueta,
  resaltado = false,
  grande = false,
  className = '',
}: {
  dia: string
  hoy: string
  onCambiar: (dia: string) => void
  etiqueta: string
  /** Con el color de aviso: la compra no es de hoy. */
  resaltado?: boolean
  grande?: boolean
  className?: string
}) {
  const recientes = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, -i))
  const [calendario, setCalendario] = useState(!recientes.includes(dia))
  const minimo = sumarDias(hoy, -DIAS_ATRAS_PERMITIDOS)
  let estilo = campo
  if (resaltado) estilo = estilo.replace('border border-control bg-superficie', 'border-2 border-aviso bg-aviso-suave font-semibold')
  if (grande) estilo = estilo.replace('min-h-12', 'min-h-16')

  if (calendario) {
    return (
      <div className={`flex gap-2 ${className}`}>
        <input
          type="date"
          value={dia}
          min={minimo}
          max={hoy}
          onChange={(e) => {
            const elegido = e.target.value
            if (elegido && elegido >= minimo && elegido <= hoy) onCambiar(elegido)
          }}
          aria-label={etiqueta}
          className={`${estilo} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={() => {
            setCalendario(false)
            if (!recientes.includes(dia)) onCambiar(hoy)
          }}
          className="min-h-12 shrink-0 rounded-xl px-3 text-lg font-semibold text-marca active:bg-marca-suave"
        >
          Lista
        </button>
      </div>
    )
  }

  return (
    <select
      value={dia}
      onChange={(e) => (e.target.value === OTRO ? setCalendario(true) : onCambiar(e.target.value))}
      aria-label={etiqueta}
      className={`${estilo} ${className}`}
    >
      {recientes.map((d, i) => (
        <option key={d} value={d}>
          {i <= 2 ? nombreCompletoDelDia(d, hoy) : fechaLarga(d)}
        </option>
      ))}
      <option value={OTRO}>Otro día...</option>
    </select>
  )
}
