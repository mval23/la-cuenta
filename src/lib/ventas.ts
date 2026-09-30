import { quincenaDe, quincenaVecina, type Quincena } from './fechas'

/** Lo que hace falta de cada compra (no anulada) para sumar las ventas. */
export interface CompraVendida {
  fecha: string
  valor_pesos: number
}

export interface VentaDelDia {
  fecha: string
  total: number
  compras: number
}

export interface Ventas {
  hoy: VentaDelDia
  /** La quincena de hoy. */
  quincena: Quincena
  totalQuincena: number
  /** Los días de esta quincena que tuvieron ventas, el más reciente primero. */
  dias: VentaDelDia[]
  /** Las quincenas antes de esta, la más reciente primero. */
  anteriores: { quincena: Quincena; total: number }[]
}

/**
 * Suma las ventas de hoy, de cada día de esta quincena y de las `anteriores`
 * quincenas. Los días sin ventas no salen; las quincenas sin ventas sí, en $0.
 */
export function resumirVentas(compras: CompraVendida[], hoy: string, anteriores: number): Ventas {
  const porDia = new Map<string, VentaDelDia>()
  for (const c of compras) {
    const dia = porDia.get(c.fecha) ?? { fecha: c.fecha, total: 0, compras: 0 }
    dia.total += c.valor_pesos
    dia.compras += 1
    porDia.set(c.fecha, dia)
  }

  const quincena = quincenaDe(hoy)
  const entre = (q: Quincena) => [...porDia.values()].filter((d) => d.fecha >= q.desde && d.fecha <= q.hasta)
  const sumar = (dias: VentaDelDia[]) => dias.reduce((total, d) => total + d.total, 0)

  const dias = entre(quincena).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const lista: Ventas['anteriores'] = []
  let q = quincena
  for (let i = 0; i < anteriores; i++) {
    q = quincenaVecina(q, -1)
    lista.push({ quincena: q, total: sumar(entre(q)) })
  }

  return {
    hoy: porDia.get(hoy) ?? { fecha: hoy, total: 0, compras: 0 },
    quincena,
    totalQuincena: sumar(dias),
    dias,
    anteriores: lista,
  }
}
