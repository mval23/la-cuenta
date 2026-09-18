const formato = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

/** 10000 -> "$10.000". Los valores siempre son pesos enteros. */
export function formatearPesos(valor: number): string {
  const signo = valor < 0 ? '-' : ''
  return `${signo}$${formato.format(Math.abs(valor))}`
}

// Una compra de la cocina casi siempre está entre un tinto y un almuerzo con
// extras. Fuera de este rango se pregunta antes de guardar: lo más común es
// que el dictado haya perdido el "mil" ("10" en vez de "10 mil").
export const COMPRA_MINIMA_HABITUAL = 1_000
export const COMPRA_MAXIMA_HABITUAL = 200_000

/** Si el valor de una compra es raro, dice por qué; si no, null. */
export function valorInusual(valor: number): 'bajo' | 'alto' | null {
  if (valor < COMPRA_MINIMA_HABITUAL) return 'bajo'
  if (valor > COMPRA_MAXIMA_HABITUAL) return 'alto'
  return null
}
