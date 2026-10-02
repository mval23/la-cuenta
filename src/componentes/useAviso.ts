import { useCallback, useState } from 'react'

export interface DatosAviso {
  tipo: 'ok' | 'error'
  texto: string
  /** Si está, el aviso ofrece "Deshacer". */
  deshacer?: () => Promise<void>
}

/**
 * Solo se muestran los avisos de error, y se quedan hasta cerrarlos. Los de
 * éxito ("Guardado: ...") no salen: se pidió quitarlos (2026-10-01). Lo
 * guardado se ve en la lista, y para corregir está "Anular" en el historial.
 * Para volver a mostrarlos (con su "Deshacer"), basta con dejar pasar los 'ok'
 * aquí; quien llama los sigue mandando.
 */
export function useAviso() {
  const [aviso, setAviso] = useState<DatosAviso | null>(null)

  const cerrar = useCallback(() => setAviso(null), [])

  // Un éxito también quita el error que hubiera: ya no aplica.
  const mostrar = useCallback((nuevo: DatosAviso) => setAviso(nuevo.tipo === 'error' ? nuevo : null), [])

  return { aviso, mostrar, cerrar }
}
