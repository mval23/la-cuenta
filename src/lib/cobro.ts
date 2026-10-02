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
