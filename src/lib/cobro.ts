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
 * por nombre de persona o de departamento, sin importar tildes. `mantener`
 * son las personas que siguen en la lista aunque ya estén al día.
 */
export function agruparParaCobro(
  saldos: Saldo[],
  busqueda = '',
  mantener: ReadonlySet<number> = new Set(),
): GrupoDeCobro[] {
  const buscado = normalizarNombre(busqueda)
  const grupos = new Map<number, GrupoDeCobro>()

  for (const s of saldos) {
    // Al buscar se muestra también a quien está al día, para poder abrir su
    // historial y anular un pago equivocado. Quien acaba de pagar se queda
    // en su sitio para que la lista no salte bajo el dedo.
    if (s.saldo === 0 && !buscado && !mantener.has(s.persona_id)) continue
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
