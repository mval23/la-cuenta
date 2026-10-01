import { quincenaDe, quincenaVecina, type Quincena } from './fechas'

/** Lo que hace falta de cada compra (no anulada) para sumar las ventas. */
export interface CompraVendida {
  fecha: string
  valor_pesos: number
  especial: boolean
}

/** Lo vendido en un tiempo: el total, y de eso cuánto fue de almuerzos especiales. */
export interface Vendido {
  total: number
  compras: number
  especiales: number
  /** Cuántas compras fueron especiales. */
  cuantosEspeciales: number
}

export interface VentaDelDia extends Vendido {
  fecha: string
}

export interface Ventas {
  hoy: VentaDelDia
  /** La quincena de hoy. */
  quincena: Quincena
  totalQuincena: Vendido
  /** Los días de esta quincena que tuvieron ventas, el más reciente primero. */
  dias: VentaDelDia[]
  /** Las quincenas antes de esta, la más reciente primero. */
  anteriores: { quincena: Quincena; total: number }[]
}

const nada = (): Vendido => ({ total: 0, compras: 0, especiales: 0, cuantosEspeciales: 0 })

function sumar(dias: Vendido[]): Vendido {
  const suma = nada()
  for (const d of dias) {
    suma.total += d.total
    suma.compras += d.compras
    suma.especiales += d.especiales
    suma.cuantosEspeciales += d.cuantosEspeciales
  }
  return suma
}

/**
 * Suma las ventas de hoy, de cada día de esta quincena y de las `anteriores`
 * quincenas. Los días sin ventas no salen; las quincenas sin ventas sí, en $0.
 */
export function resumirVentas(compras: CompraVendida[], hoy: string, anteriores: number): Ventas {
  const porDia = new Map<string, VentaDelDia>()
  for (const c of compras) {
    const dia = porDia.get(c.fecha) ?? { fecha: c.fecha, ...nada() }
    dia.total += c.valor_pesos
    dia.compras += 1
    if (c.especial) {
      dia.especiales += c.valor_pesos
      dia.cuantosEspeciales += 1
    }
    porDia.set(c.fecha, dia)
  }

  const quincena = quincenaDe(hoy)
  const entre = (q: Quincena) => [...porDia.values()].filter((d) => d.fecha >= q.desde && d.fecha <= q.hasta)

  const dias = entre(quincena).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const lista: Ventas['anteriores'] = []
  let q = quincena
  for (let i = 0; i < anteriores; i++) {
    q = quincenaVecina(q, -1)
    lista.push({ quincena: q, total: sumar(entre(q)).total })
  }

  return {
    hoy: porDia.get(hoy) ?? { fecha: hoy, ...nada() },
    quincena,
    totalQuincena: sumar(dias),
    dias,
    anteriores: lista,
  }
}
