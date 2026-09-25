import { describe, expect, it } from 'vitest'
import { LETRA_MAXIMA, LETRA_MINIMA, tamanoDeLetra } from './letra'

describe('tamanoDeLetra', () => {
  it('con el texto de fábrica del iPad deja los 17px de siempre', () => {
    expect(tamanoDeLetra(17)).toBe(17)
  })

  it('crece con el texto más grande del iPad, hasta el tope', () => {
    expect(tamanoDeLetra(18)).toBe(18)
    expect(tamanoDeLetra(19)).toBe(LETRA_MAXIMA)
    expect(tamanoDeLetra(21)).toBe(LETRA_MAXIMA)
    expect(tamanoDeLetra(53)).toBe(LETRA_MAXIMA)
  })

  it('no achica la letra si el iPad la tiene más pequeña', () => {
    expect(tamanoDeLetra(14)).toBe(LETRA_MINIMA)
  })

  it('usa la de fábrica si no se pudo leer', () => {
    expect(tamanoDeLetra(Number.NaN)).toBe(LETRA_MINIMA)
  })
})
