import { useCallback, useEffect, useRef, useState } from 'react'

export interface DatosAviso {
  tipo: 'ok' | 'error'
  texto: string
  /** Si está, el aviso ofrece "Deshacer". */
  deshacer?: () => Promise<void>
}

// Cuánto se ve un aviso de éxito. Con Deshacer, más: hay que notarlo, leerlo y
// decidir, a veces mientras se atiende a alguien. Otra acción lo cambia antes.
const DURA_MS = 6_000
const DURA_CON_DESHACER_MS = 20_000

/** Los avisos de éxito se quitan solos; los de error se quedan hasta cerrarlos. */
export function useAviso() {
  const [aviso, setAviso] = useState<DatosAviso | null>(null)
  const temporizador = useRef<number | undefined>(undefined)

  const cerrar = useCallback(() => {
    window.clearTimeout(temporizador.current)
    setAviso(null)
  }, [])

  const mostrar = useCallback((nuevo: DatosAviso) => {
    window.clearTimeout(temporizador.current)
    setAviso(nuevo)
    if (nuevo.tipo === 'ok') {
      temporizador.current = window.setTimeout(() => setAviso(null), nuevo.deshacer ? DURA_CON_DESHACER_MS : DURA_MS)
    }
  }, [])

  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  return { aviso, mostrar, cerrar }
}
