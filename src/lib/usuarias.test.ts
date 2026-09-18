import { describe, expect, it } from 'vitest'
import { claveDesdePin, leerUsuarias } from './usuarias'

describe('leerUsuarias', () => {
  it('lee nombre y correo de cada usuaria', () => {
    expect(leerUsuarias('Amparo:amparo@correo.com, Mariana : mariana@correo.com')).toEqual([
      { nombre: 'Amparo', correo: 'amparo@correo.com' },
      { nombre: 'Mariana', correo: 'mariana@correo.com' },
    ])
  })

  it('ignora partes vacías o mal escritas', () => {
    expect(leerUsuarias('Amparo:a@b.co,,sin-correo,:x@y.co')).toEqual([
      { nombre: 'Amparo', correo: 'a@b.co' },
    ])
  })

  it('sin variable no hay usuarias', () => {
    expect(leerUsuarias(undefined)).toEqual([])
    expect(leerUsuarias('')).toEqual([])
  })
})

describe('claveDesdePin', () => {
  it('cumple el mínimo de 6 caracteres de Supabase', () => {
    expect(claveDesdePin('0000')).toBe('cuenta-0000')
    expect(claveDesdePin('1234').length).toBeGreaterThanOrEqual(6)
  })
})
