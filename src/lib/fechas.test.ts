import { describe, expect, it } from 'vitest'
import {
  fechaDeDocumento,
  fechaDeTabla,
  hoyBogota,
  nombreDeQuincena,
  nombreDelMes,
  quincenaDe,
  quincenaVecina,
  semanasDelMes,
  sumarMeses,
} from './fechas'

describe('hoyBogota', () => {
  it('usa la hora de Colombia, no la del dispositivo ni UTC', () => {
    // 3 a. m. UTC del 18 es todavía el 17 a las 10 p. m. en Bogotá.
    expect(hoyBogota(new Date('2026-09-18T03:00:00Z'))).toBe('2026-09-17')
    expect(hoyBogota(new Date('2026-09-18T05:00:00Z'))).toBe('2026-09-18')
  })
})

describe('calendario', () => {
  it('arma las semanas de lunes a domingo', () => {
    // El 1 de septiembre de 2026 es martes; el 30, miércoles.
    const semanas = semanasDelMes('2026-09')
    expect(semanas).toHaveLength(5)
    expect(semanas[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])
    expect(semanas[4]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null])
  })

  it('cuenta bien febrero y los cambios de año', () => {
    expect(semanasDelMes('2028-02').flat().filter(Boolean)).toHaveLength(29)
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
    expect(sumarMeses('2025-12', 1)).toBe('2026-01')
  })

  it('nombra el mes', () => {
    expect(nombreDelMes('2026-09')).toBe('Septiembre de 2026')
  })
})

describe('quincenas', () => {
  it('del 1 al 15 y del 16 al fin de mes', () => {
    expect(quincenaDe('2026-09-15')).toEqual({ desde: '2026-09-01', hasta: '2026-09-15' })
    expect(quincenaDe('2026-09-16')).toEqual({ desde: '2026-09-16', hasta: '2026-09-30' })
    expect(quincenaDe('2026-08-31')).toEqual({ desde: '2026-08-16', hasta: '2026-08-31' })
    expect(quincenaDe('2028-02-20')).toEqual({ desde: '2028-02-16', hasta: '2028-02-29' })
  })

  it('pasa a la anterior y a la siguiente, también entre años', () => {
    const q = quincenaDe('2026-01-10')
    expect(quincenaVecina(q, -1)).toEqual({ desde: '2025-12-16', hasta: '2025-12-31' })
    expect(quincenaVecina(q, 1)).toEqual({ desde: '2026-01-16', hasta: '2026-01-31' })
  })

  it('se nombra con sus días', () => {
    expect(nombreDeQuincena(quincenaDe('2026-09-18'))).toBe('16 al 30 de septiembre de 2026')
  })
})

describe('fechas de documentos', () => {
  it('como en la cuenta de cobro', () => {
    expect(fechaDeDocumento('2026-09-14')).toBe('14 de Septiembre de 2026')
    expect(fechaDeTabla('2026-08-02')).toBe('Ago-02')
    expect(fechaDeTabla('2026-09-01')).toBe('Sept-01')
  })
})
