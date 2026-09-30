import { describe, expect, it } from 'vitest'
import { resumirVentas } from './ventas'

describe('resumirVentas', () => {
  const compras = [
    { fecha: '2026-09-29', valor_pesos: 10_000 },
    { fecha: '2026-09-29', valor_pesos: 4_400 },
    { fecha: '2026-09-25', valor_pesos: 7_000 },
    { fecha: '2026-09-16', valor_pesos: 3_000 },
    // Quincenas anteriores
    { fecha: '2026-09-15', valor_pesos: 12_000 },
    { fecha: '2026-09-01', valor_pesos: 1_000 },
    { fecha: '2026-08-31', valor_pesos: 5_000 },
  ]

  it('suma lo de hoy con cuántas compras fueron', () => {
    expect(resumirVentas(compras, '2026-09-29', 3).hoy).toEqual({ fecha: '2026-09-29', total: 14_400, compras: 2 })
  })

  it('hoy sin ventas da $0', () => {
    expect(resumirVentas(compras, '2026-09-30', 3).hoy).toEqual({ fecha: '2026-09-30', total: 0, compras: 0 })
  })

  it('lista solo los días de esta quincena con ventas, el más reciente primero', () => {
    const v = resumirVentas(compras, '2026-09-29', 3)
    expect(v.quincena).toEqual({ desde: '2026-09-16', hasta: '2026-09-30' })
    expect(v.dias.map((d) => d.fecha)).toEqual(['2026-09-29', '2026-09-25', '2026-09-16'])
    expect(v.totalQuincena).toBe(24_400)
  })

  it('suma cada quincena anterior, también las que no tuvieron ventas', () => {
    expect(resumirVentas(compras, '2026-09-29', 3).anteriores).toEqual([
      { quincena: { desde: '2026-09-01', hasta: '2026-09-15' }, total: 13_000 },
      { quincena: { desde: '2026-08-16', hasta: '2026-08-31' }, total: 5_000 },
      { quincena: { desde: '2026-08-01', hasta: '2026-08-15' }, total: 0 },
    ])
  })
})
