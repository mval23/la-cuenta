const formato = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

/** 10000 -> "$10.000". Los valores siempre son pesos enteros. */
export function formatearPesos(valor: number): string {
  const signo = valor < 0 ? '-' : ''
  return `${signo}$${formato.format(Math.abs(valor))}`
}
