/*
 * El tamaño de la letra sigue el de Ajustes del iPad (Pantalla y brillo >
 * Tamaño del texto), pero dentro de un rango. Todo en la app se mide en rem,
 * así que basta con cambiar la letra de la raíz.
 *
 * Por qué con tope: la app ya viene con letra grande (17px de raíz, el texto
 * normal de iPadOS). Sumarle todo lo que agranda el iPad no cabía en su
 * pantalla, pero ignorarlo desconoce lo que Amparo eligió.
 */

/** Lo que usa el iPad con el tamaño de texto de fábrica. */
export const LETRA_MINIMA = 17
/** Hasta dónde se agranda. Subirlo solo después de probar en el iPad de Amparo que todo cabe. */
export const LETRA_MAXIMA = 19

/** La letra de la raíz para el texto normal que usa el sistema, en px. */
export function tamanoDeLetra(delSistema: number): number {
  if (!Number.isFinite(delSistema)) return LETRA_MINIMA
  return Math.min(LETRA_MAXIMA, Math.max(LETRA_MINIMA, Math.round(delSistema)))
}

/**
 * Lee el tamaño del texto del iPad y lo aplica. Fuera de Safari (que no conoce
 * la letra `-apple-system-body`) no hace nada y se queda la de index.css.
 */
export function aplicarTamanoDeLetra(): void {
  const prueba = document.createElement('span')
  prueba.style.font = '-apple-system-body'
  // El navegador que no la conoce la descarta y deja el estilo vacío.
  if (!prueba.style.font) return
  prueba.style.position = 'absolute'
  prueba.style.visibility = 'hidden'
  prueba.textContent = 'A'
  document.documentElement.appendChild(prueba)
  const delSistema = parseFloat(getComputedStyle(prueba).fontSize)
  prueba.remove()
  document.documentElement.style.fontSize = `${tamanoDeLetra(delSistema)}px`
}
