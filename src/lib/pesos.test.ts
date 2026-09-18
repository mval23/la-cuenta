import { describe, expect, it } from 'vitest'
import { formatearPesos } from './pesos'

describe('formatearPesos', () => {
  it('usa punto como separador de miles', () => {
    expect(formatearPesos(10000)).toBe('$10.000')
    expect(formatearPesos(2200)).toBe('$2.200')
    expect(formatearPesos(5840000)).toBe('$5.840.000')
  })

  it('maneja cero y valores pequeños', () => {
    expect(formatearPesos(0)).toBe('$0')
    expect(formatearPesos(500)).toBe('$500')
  })

  it('pone el signo antes del símbolo en saldos a favor', () => {
    expect(formatearPesos(-3000)).toBe('-$3.000')
  })
})
