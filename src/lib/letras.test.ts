import { describe, expect, it } from 'vitest'
import { numeroEnLetras, sumaEnLetras } from './letras'

describe('numeroEnLetras', () => {
  it.each([
    [0, 'cero'],
    [1, 'uno'],
    [16, 'dieciséis'],
    [21, 'veintiuno'],
    [30, 'treinta'],
    [45, 'cuarenta y cinco'],
    [100, 'cien'],
    [101, 'ciento uno'],
    [500, 'quinientos'],
    [1000, 'mil'],
    [1500, 'mil quinientos'],
    [21_000, 'veintiún mil'],
    [31_000, 'treinta y un mil'],
    [62_000, 'sesenta y dos mil'],
    [100_000, 'cien mil'],
    [101_000, 'ciento un mil'],
    [144_000, 'ciento cuarenta y cuatro mil'],
    [343_000, 'trescientos cuarenta y tres mil'],
    [1_000_000, 'un millón'],
    [1_250_500, 'un millón doscientos cincuenta mil quinientos'],
    [2_000_000, 'dos millones'],
    [21_000_000, 'veintiún millones'],
    [345_678_901, 'trescientos cuarenta y cinco millones seiscientos setenta y ocho mil novecientos uno'],
  ])('%i', (n, letras) => {
    expect(numeroEnLetras(n)).toBe(letras)
  })
})

describe('sumaEnLetras', () => {
  it('como en la cuenta de cobro', () => {
    expect(sumaEnLetras(343_000)).toBe('Trescientos cuarenta y tres mil pesos M/cte.')
  })

  it('con millones exactos dice "de pesos"', () => {
    expect(sumaEnLetras(1_000_000)).toBe('Un millón de pesos M/cte.')
    expect(sumaEnLetras(3_000_000)).toBe('Tres millones de pesos M/cte.')
    expect(sumaEnLetras(3_100_000)).toBe('Tres millones cien mil pesos M/cte.')
  })
})
