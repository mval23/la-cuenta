import { describe, expect, it } from 'vitest'
import { agruparParaCobro } from './cobro'
import type { Saldo } from './tipos'

function saldo(persona_id: number, nombre: string, departamento_id: number, departamento: string, valor: number): Saldo {
  return { persona_id, nombre, departamento_id, departamento, activo: true, comprado: 0, pagado: 0, saldo: valor }
}

const saldos: Saldo[] = [
  saldo(1, 'Pedro', 2, 'TDH', 20000),
  saldo(2, 'Ángela', 2, 'TDH', 15000),
  saldo(3, 'Juan', 1, 'Bodega', 8000),
  saldo(4, 'Rosa', 1, 'Bodega', 0),
  saldo(5, 'Luis', 1, 'Bodega', -2000),
]

describe('agruparParaCobro', () => {
  it('agrupa por departamento, ordena y suma; deja fuera a quien está al día', () => {
    const grupos = agruparParaCobro(saldos)
    expect(grupos.map((g) => [g.departamento, g.total, g.personas.map((p) => p.nombre)])).toEqual([
      ['Bodega', 6000, ['Juan', 'Luis']],
      ['TDH', 35000, ['Ángela', 'Pedro']],
    ])
  })

  it('busca por nombre sin importar tildes', () => {
    const grupos = agruparParaCobro(saldos, 'angela')
    expect(grupos).toHaveLength(1)
    expect(grupos[0].personas.map((p) => p.nombre)).toEqual(['Ángela'])
  })

  it('busca por departamento', () => {
    expect(agruparParaCobro(saldos, 'bod').map((g) => g.departamento)).toEqual(['Bodega'])
  })
})

describe('agruparParaCobro al buscar', () => {
  it('incluye a quien está al día para poder abrir su historial', () => {
    const grupos = agruparParaCobro(saldos, 'rosa')
    expect(grupos[0].personas.map((p) => [p.nombre, p.saldo])).toEqual([['Rosa', 0]])
  })

  it('no muestra a las archivadas o unidas que no deben nada, ni al buscar', () => {
    const conArchivadas = [
      ...saldos,
      { ...saldo(6, 'María Espinosa', 1, 'Bodega', 0), activo: false },
      { ...saldo(7, 'María Pérez', 1, 'Bodega', 3000), activo: false },
    ]
    const grupos = agruparParaCobro(conArchivadas, 'maria')
    // Si todavía debe, sigue apareciendo: hay que cobrarle.
    expect(grupos.flatMap((g) => g.personas.map((p) => p.nombre))).toEqual(['María Pérez'])
  })
})

describe('agruparParaCobro después de pagar', () => {
  it('mantiene en la lista a quien acaba de quedar al día, para que no salte', () => {
    const grupos = agruparParaCobro(saldos, '', new Set([4]))
    expect(grupos[0].personas.map((p) => p.nombre)).toEqual(['Juan', 'Luis', 'Rosa'])
  })
})
