import { useEffect, useRef, useState } from 'react'
import {
  DURACION_MAXIMA_MS,
  empezarGrabacion,
  ErrorDeVoz,
  hayMicrofono,
  transcribir,
  type Corte,
  type Grabacion,
} from '../lib/voz'

type Estado = 'lista' | 'grabando' | 'procesando'

/** Botón grande: se toca para hablar y deja de escuchar solo cuando ella se calla
 *  (también se puede tocar otra vez para terminar antes). */
export function Microfono({
  vocabulario,
  onTexto,
  onError,
  onEmpezar,
  texto = 'Tocar para hablar',
}: {
  vocabulario: () => string
  onTexto: (texto: string) => void
  onError: (mensaje: string) => void
  onEmpezar: () => void
  /** Lo que dice el botón antes de tocarlo. */
  texto?: string
}) {
  const [estado, setEstado] = useState<Estado>('lista')
  const grabacion = useRef<Grabacion | null>(null)

  // Si se cambia de pestaña mientras graba, se apaga el micrófono.
  useEffect(() => () => grabacion.current?.cancelar(), [])

  // Reloj de la grabación, para avisar antes de que se corte sola.
  const [inicio, setInicio] = useState(0)
  const [ahora, setAhora] = useState(0)
  useEffect(() => {
    if (estado !== 'grabando') return
    const reloj = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(reloj)
  }, [estado])
  const quedan = Math.max(0, Math.round((DURACION_MAXIMA_MS - (ahora - inicio)) / 1000))

  if (!hayMicrofono()) return null

  async function empezar() {
    onEmpezar()
    try {
      grabacion.current = await empezarGrabacion((motivo) => terminar(motivo))
      const momento = Date.now()
      setInicio(momento)
      setAhora(momento)
      setEstado('grabando')
    } catch {
      onError('No se pudo usar el micrófono. Revisa que La Cuenta tenga permiso en Ajustes del iPad.')
    }
  }

  async function terminar(motivo?: Corte) {
    const actual = grabacion.current
    if (!actual) return
    grabacion.current = null
    if (motivo === 'sin-voz') {
      actual.cancelar()
      setEstado('lista')
      onError('No se oyó nada. Intenta de nuevo, más cerca del iPad.')
      return
    }
    setEstado('procesando')
    try {
      const audio = await actual.terminar()
      const texto = await transcribir(audio, vocabulario())
      if (texto) onTexto(texto)
      else onError('No se oyó nada. Intenta de nuevo, más cerca del iPad.')
    } catch (e) {
      onError(e instanceof ErrorDeVoz ? e.message : 'No se pudo entender el audio. Intenta de nuevo.')
    }
    setEstado('lista')
  }

  const estilos: Record<Estado, string> = {
    lista: 'bg-marca text-white active:bg-marca-oscura',
    grabando: 'bg-peligro text-white active:bg-peligro-oscuro',
    procesando: 'bg-hundido text-tinta-suave',
  }
  const textos: Record<Estado, string> = {
    lista: texto,
    grabando: 'Te escucho... habla ahora',
    procesando: 'Entendiendo...',
  }

  return (
    <button
      type="button"
      disabled={estado === 'procesando'}
      onClick={estado === 'lista' ? empezar : () => terminar()}
      className={`flex min-h-24 w-full items-center justify-center gap-3 rounded-2xl px-5 text-xl font-semibold ${estilos[estado]}`}
    >
      {estado === 'grabando' ? (
        // Solo el punto late, no el botón entero.
        <span aria-hidden="true" className="h-4 w-4 rounded-full bg-white motion-safe:animate-pulse" />
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 fill-none stroke-current stroke-2">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" strokeLinecap="round" />
        </svg>
      )}
      <span className="flex flex-col items-start">
        {textos[estado]}
        {estado === 'grabando' && quedan <= 10 && (
          <span className="text-base font-normal">Se detiene sola en {quedan} s</span>
        )}
      </span>
    </button>
  )
}
