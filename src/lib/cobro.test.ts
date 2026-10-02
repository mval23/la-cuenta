import { describe, expect, it } from 'vitest'
import { agruparParaCobro, cuentaDeQuincena } from './cobro'
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

describe('agruparParaCobro con quien está al día (Cobrar)', () => {
  it('pone a quien está al día en su departamento, en orden', () => {
    const grupos = agruparParaCobro(saldos, '', true)
    expect(grupos.map((g) => [g.departamento, g.total, g.personas.map((p) => p.nombre)])).toEqual([
      ['Bodega', 6000, ['Juan', 'Luis', 'Rosa']],
      ['TDH', 35000, ['Ángela', 'Pedro']],
    ])
  })

  it('un departamento donde todos están al día también sale', () => {
    const grupos = agruparParaCobro([saldo(8, 'Ana', 3, 'Gerencia', 0)], '', true)
    expect(grupos.map((g) => [g.departamento, g.total])).toEqual([['Gerencia', 0]])
  })

  it('las archivadas al día siguen sin salir', () => {
    const grupos = agruparParaCobro([{ ...saldo(6, 'María Espinosa', 1, 'Bodega', 0), activo: false }], '', true)
    expect(grupos).toEqual([])
  })
})

describe('cuentaDeQuincena', () => {
  const m = (tabla: 'compras' | 'pagos', fecha: string, valor: number, extra: { anulado?: boolean; especial?: boolean } = {}) => ({
    tabla,
    fecha,
    valor,
    anulado: extra.anulado ?? false,
    especial: extra.especial ?? false,
  })

  it('venía debiendo + normales + especiales - pagó = lo que debe', () => {
    const movimientos = [
      m('compras', '2026-09-30', 15000, { especial: true }),
      m('pagos', '2026-09-29', 4400),
      m('compras', '2026-09-28', 4400),
      m('compras', '2026-09-25', 4400),
      m('compras', '2026-09-18', 7000),
      // Lo anulado no cuenta, y lo de antes de la quincena va en "venía debiendo".
      m('compras', '2026-09-20', 9999, { anulado: true }),
      m('compras', '2026-09-10', 8000),
    ]
    expect(cuentaDeQuincena(movimientos, 34400, '2026-09-16', '2026-09-30')).toEqual({
      venia: 8000,
      normales: 15800,
      especiales: 15000,
      pago: 4400,
      total: 34400,
    })
  })

  it('sin nada en la quincena, venía debiendo es lo que debe', () => {
    expect(cuentaDeQuincena([], -2000, '2026-10-01', '2026-10-15')).toEqual({
      venia: -2000,
      normales: 0,
      especiales: 0,
      pago: 0,
      total: -2000,
    })
  })
})
