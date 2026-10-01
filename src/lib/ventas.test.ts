import { describe, expect, it } from 'vitest'
import { resumirVentas } from './ventas'

describe('resumirVentas', () => {
  const compra = (fecha: string, valor_pesos: number, especial = false) => ({ fecha, valor_pesos, especial })
  const compras = [
    compra('2026-09-29', 10_000),
    compra('2026-09-29', 4_400),
    compra('2026-09-29', 15_000, true),
    compra('2026-09-25', 7_000),
    compra('2026-09-16', 3_000),
    compra('2026-09-16', 18_000, true),
    // Quincenas anteriores
    compra('2026-09-15', 12_000),
    compra('2026-09-01', 1_000, true),
    compra('2026-08-31', 5_000),
  ]

  it('suma lo de hoy con cuántas compras fueron, y aparte los especiales', () => {
    expect(resumirVentas(compras, '2026-09-29', 3).hoy).toEqual({
      fecha: '2026-09-29',
      total: 29_400,
      compras: 3,
      especiales: 15_000,
      cuantosEspeciales: 1,
    })
  })

  it('hoy sin ventas da $0', () => {
    expect(resumirVentas(compras, '2026-09-30', 3).hoy).toEqual({
      fecha: '2026-09-30',
      total: 0,
      compras: 0,
      especiales: 0,
      cuantosEspeciales: 0,
    })
  })

  it('lista solo los días de esta quincena con ventas, el más reciente primero', () => {
    const v = resumirVentas(compras, '2026-09-29', 3)
    expect(v.quincena).toEqual({ desde: '2026-09-16', hasta: '2026-09-30' })
    expect(v.dias.map((d) => d.fecha)).toEqual(['2026-09-29', '2026-09-25', '2026-09-16'])
    expect(v.totalQuincena).toEqual({ total: 57_400, compras: 6, especiales: 33_000, cuantosEspeciales: 2 })
  })

  it('suma cada quincena anterior, también las que no tuvieron ventas', () => {
    expect(resumirVentas(compras, '2026-09-29', 3).anteriores).toEqual([
      { quincena: { desde: '2026-09-01', hasta: '2026-09-15' }, total: 13_000 },
      { quincena: { desde: '2026-08-16', hasta: '2026-08-31' }, total: 5_000 },
      { quincena: { desde: '2026-08-01', hasta: '2026-08-15' }, total: 0 },
    ])
  })
})
