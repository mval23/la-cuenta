import { useSyncExternalStore } from 'react'

/**
 * El mismo corte que la variante `ancha:` de index.css: el iPad en horizontal
 * (unos 1133-1376px). El de 13" en vertical mide 1024px y queda por debajo.
 */
const consulta = '(width >= 1100px)'

function suscribir(avisar: () => void) {
  const lista = window.matchMedia(consulta)
  lista.addEventListener('change', avisar)
  return () => lista.removeEventListener('change', avisar)
}

export function usePantallaAncha(): boolean {
  return useSyncExternalStore(suscribir, () => window.matchMedia(consulta).matches)
}
