import { useEffect, useRef, useState } from 'react'
import { empezarGrabacion, ErrorDeVoz, hayMicrofono, transcribir, type Grabacion } from '../lib/voz'

type Estado = 'lista' | 'grabando' | 'procesando'

/** Botón grande: se toca para hablar y se toca otra vez para terminar. */
export function Microfono({
  vocabulario,
  onTexto,
  onError,
  onEmpezar,
}: {
  vocabulario: () => string
  onTexto: (texto: string) => void
  onError: (mensaje: string) => void
  onEmpezar: () => void
}) {
  const [estado, setEstado] = useState<Estado>('lista')
  const grabacion = useRef<Grabacion | null>(null)

  // Si se cambia de pestaña mientras graba, se apaga el micrófono.
  useEffect(() => () => grabacion.current?.cancelar(), [])

  if (!hayMicrofono()) return null

  async function empezar() {
    onEmpezar()
    try {
      grabacion.current = await empezarGrabacion(() => terminar())
      setEstado('grabando')
    } catch {
      onError('No se pudo usar el micrófono. Revisa que La Cuenta tenga permiso en Ajustes del iPad.')
    }
  }

  async function terminar() {
    const actual = grabacion.current
    if (!actual) return
    grabacion.current = null
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
    lista: 'bg-amber-800 text-white active:bg-amber-900',
    grabando: 'bg-red-700 text-white active:bg-red-800',
    procesando: 'bg-stone-200 text-stone-700',
  }
  const textos: Record<Estado, string> = {
    lista: 'Tocar para hablar',
    grabando: 'Escuchando... toca para terminar',
    procesando: 'Entendiendo...',
  }

  return (
    <button
      type="button"
      disabled={estado === 'procesando'}
      onClick={estado === 'lista' ? empezar : terminar}
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
      {textos[estado]}
    </button>
  )
}
