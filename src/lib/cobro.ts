import { normalizarNombre } from './personas'
import type { Saldo } from './tipos'

export interface GrupoDeCobro {
  departamentoId: number
  departamento: string
  total: number
  personas: Saldo[]
}

/**
 * La lista de cobro: quien debe o tiene saldo a favor, agrupada por el
 * departamento actual de cada persona, en orden alfabético. `busqueda` filtra
 * por nombre de persona o de departamento, sin importar tildes. Con
 * `conAlDia` también va quien está al día (en Cobrar se ve como "Al día");
 * sin eso, como en el PDF, solo quien debe o tiene a favor.
 */
export function agruparParaCobro(saldos: Saldo[], busqueda = '', conAlDia = false): GrupoDeCobro[] {
  const buscado = normalizarNombre(busqueda)
  const grupos = new Map<number, GrupoDeCobro>()

  for (const s of saldos) {
    // Quien se archivó o se unió con otra persona y no debe nada ya no existe
    // para el cobro, ni siquiera al buscar.
    if (!s.activo && s.saldo === 0) continue
    // Al buscar se muestra también a quien está al día, para poder abrir su
    // historial y anular un pago equivocado.
    if (s.saldo === 0 && !buscado && !conAlDia) continue
    if (
      buscado &&
      !normalizarNombre(s.nombre).includes(buscado) &&
      !normalizarNombre(s.departamento).includes(buscado)
    ) {
      continue
    }
    let grupo = grupos.get(s.departamento_id)
    if (!grupo) {
      grupo = { departamentoId: s.departamento_id, departamento: s.departamento, total: 0, personas: [] }
      grupos.set(s.departamento_id, grupo)
    }
    grupo.total += s.saldo
    grupo.personas.push(s)
  }

  const orden = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' })
  const lista = [...grupos.values()].sort((a, b) => orden(a.departamento, b.departamento))
  lista.forEach((g) => g.personas.sort((a, b) => orden(a.nombre, b.nombre)))
  return lista
}

/** Una compra o un pago, con lo justo para sumar la cuenta de la quincena. */
export interface MovimientoDeCuenta {
  tabla: 'compras' | 'pagos'
  fecha: string
  valor: number
  anulado: boolean
  especial: boolean
}

export interface CuentaDeQuincena {
  /** Lo que debía antes de empezar la quincena (negativo: tenía a favor). */
  venia: number
  normales: number
  especiales: number
  pago: number
  /** venia + normales + especiales - pago: lo que debe hoy. */
  total: number
}

/**
 * La cuenta de una persona en la quincena, como en el cuaderno: lo que venía
 * debiendo, más lo que compró, menos lo que pagó. `saldo` es lo que debe hoy;
 * lo que venía debiendo sale de restarle lo de la quincena.
 */
export function cuentaDeQuincena(
  movimientos: MovimientoDeCuenta[],
  saldo: number,
  desde: string,
  hasta: string,
): CuentaDeQuincena {
  const vigentes = movimientos.filter((m) => !m.anulado && m.fecha >= desde && m.fecha <= hasta)
  const sumar = (lista: MovimientoDeCuenta[]) => lista.reduce((total, m) => total + m.valor, 0)
  const compras = vigentes.filter((m) => m.tabla === 'compras')
  const normales = sumar(compras.filter((m) => !m.especial))
  const especiales = sumar(compras.filter((m) => m.especial))
  const pago = sumar(vigentes.filter((m) => m.tabla === 'pagos'))
  return { venia: saldo - (normales + especiales - pago), normales, especiales, pago, total: saldo }
}
