import { useEffect, useRef, useState } from 'react'
import {
  DIAS_ATRAS_PERMITIDOS,
  fechaLarga,
  mesDe,
  nombreCompletoDelDia,
  nombreDelMes,
  semanasDelMes,
  sumarDias,
  sumarMeses,
} from '../lib/fechas'

const SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const RAPIDOS = ['Hoy', 'Ayer', 'Antier']

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Botón con el día elegido que abre un calendario propio, con letra grande: el
 * selector del iPad sale con letra muy pequeña. Solo deja elegir entre hoy y
 * `diasAtras` días atrás; por defecto DIAS_ATRAS_PERMITIDOS, lo mismo que la
 * base acepta para una compra.
 */
export function ElegirDia({
  dia,
  hoy,
  onCambiar,
  etiqueta,
  resaltado = false,
  grande = false,
  diasAtras = DIAS_ATRAS_PERMITIDOS,
  className = '',
}: {
  dia: string
  hoy: string
  onCambiar: (dia: string) => void
  /** Título del calendario, p. ej. "Día de la compra". */
  etiqueta: string
  /** Con el color de aviso: la compra no es de hoy. */
  resaltado?: boolean
  grande?: boolean
  diasAtras?: number
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)

  function elegir(nuevo: string) {
    setAbierto(false)
    onCambiar(nuevo)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-label={`${etiqueta}: ${nombreCompletoDelDia(dia, hoy)}. Cambiar`}
        className={`flex w-full items-center gap-3 rounded-xl px-4 py-2 text-left text-xl font-semibold ${
          grande ? 'min-h-16' : 'min-h-14'
        } ${resaltado ? 'border-2 border-aviso bg-aviso-suave' : 'border border-control bg-superficie'} ${className}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 shrink-0 fill-none stroke-marca stroke-2">
          <rect x="3" y="4.5" width="18" height="17" rx="2" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" strokeLinecap="round" />
        </svg>
        <span className="min-w-0 flex-1 leading-tight">{mayuscula(nombreCompletoDelDia(dia, hoy))}</span>
      </button>
      {abierto && <Calendario dia={dia} hoy={hoy} diasAtras={diasAtras} titulo={etiqueta} onElegir={elegir} onCerrar={() => setAbierto(false)} />}
    </>
  )
}

/** El calendario solo, para abrirlo desde otro botón. */
export function Calendario({
  dia,
  hoy,
  diasAtras,
  titulo,
  onElegir,
  onCerrar,
}: {
  dia: string
  hoy: string
  diasAtras: number
  titulo: string
  onElegir: (dia: string) => void
  onCerrar: () => void
}) {
  const minimo = sumarDias(hoy, -diasAtras)
  const [mes, setMes] = useState(mesDe(dia))
  const hayAnterior = sumarMeses(mes, -1) >= mesDe(minimo)
  const haySiguiente = sumarMeses(mes, 1) <= mesDe(hoy)

  // Al abrir, el foco entra al calendario; al cerrar, vuelve al botón que lo abrió.
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const antes = document.activeElement instanceof HTMLElement ? document.activeElement : null
    caja.current?.focus()
    return () => antes?.focus()
  }, [])

  // Escape cierra, y con Tab no se sale del calendario mientras está abierto.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
      if (e.key !== 'Tab' || !caja.current) return
      const botones = [...caja.current.querySelectorAll<HTMLElement>('button:not(:disabled)')]
      const primero = botones[0]
      const ultimo = botones.at(-1)
      if (!primero || !ultimo) return
      const actual = document.activeElement
      if (e.shiftKey && (actual === primero || actual === caja.current)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && actual === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const flecha =
    'flex h-14 w-14 items-center justify-center rounded-xl text-marca active:bg-marca-suave disabled:text-linea'

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-superficie p-5 shadow-xl focus:outline-none"
      >
        <p className="text-2xl font-bold">{titulo}</p>

        {/* Lo más común, a un toque. */}
        <div className="grid grid-cols-3 gap-3">
          {RAPIDOS.map((nombre, i) => {
            const d = sumarDias(hoy, -i)
            const elegido = d === dia
            return (
              <button
                key={d}
                type="button"
                onClick={() => onElegir(d)}
                aria-pressed={elegido}
                className={`flex min-h-16 flex-col items-center justify-center rounded-xl px-2 ${
                  elegido ? 'bg-marca text-white' : 'bg-marca-suave text-marca-oscura active:bg-marca-suave-oscura'
                }`}
              >
                <span className="text-xl font-bold">{nombre}</span>
                <span className="text-base">{fechaLarga(d).split(' ').slice(0, 2).join(' ')}</span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMes(sumarMeses(mes, -1))}
            disabled={!hayAnterior}
            aria-label="Mes anterior"
            className={flecha}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 fill-none stroke-current stroke-[2.5]">
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className="text-xl font-semibold" aria-live="polite">
            {nombreDelMes(mes)}
          </p>
          <button
            type="button"
            onClick={() => setMes(sumarMeses(mes, 1))}
            disabled={!haySiguiente}
            aria-label="Mes siguiente"
            className={flecha}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 fill-none stroke-current stroke-[2.5]">
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {SEMANA.map((d) => (
            <span key={d} className="pb-1 text-base text-tinta-suave">
              {d}
            </span>
          ))}
          {semanasDelMes(mes)
            .flat()
            .map((d, i) => {
              if (d === null) return <span key={`hueco-${i}`} />
              const permitido = d >= minimo && d <= hoy
              const elegido = d === dia
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onElegir(d)}
                  disabled={!permitido}
                  aria-pressed={elegido}
                  aria-label={mayuscula(fechaLarga(d))}
                  className={`min-h-14 rounded-xl text-xl font-semibold tabular-nums ${
                    elegido
                      ? 'bg-marca text-white'
                      : d === hoy
                        ? 'border-2 border-marca text-marca active:bg-marca-suave'
                        : 'active:bg-hundido disabled:font-normal disabled:text-linea'
                  }`}
                >
                  {Number(d.slice(8))}
                </button>
              )
            })}
        </div>

        <button
          type="button"
          onClick={onCerrar}
          className="min-h-12 rounded-xl border border-control px-5 text-lg font-semibold active:bg-hundido"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
