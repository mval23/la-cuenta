import { useCallback, useEffect, useRef, useState } from 'react'

export interface DatosAviso {
  tipo: 'ok' | 'error'
  texto: string
  /** Si está, el aviso ofrece "Deshacer". */
  deshacer?: () => Promise<void>
}

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
      temporizador.current = window.setTimeout(() => setAviso(null), nuevo.deshacer ? 8000 : 5000)
    }
  }, [])

  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  return { aviso, mostrar, cerrar }
}
