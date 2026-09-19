import { describe, expect, it } from 'vitest'
import { nombreDictado, normalizarNombre, vocabulario } from './personas'
import type { Persona } from './tipos'

const personas: Persona[] = [
  { id: 1, nombre: 'Juan', departamento_id: 1, activo: true },
  { id: 2, nombre: 'Juan', departamento_id: 2, activo: true },
  { id: 3, nombre: 'María José', departamento_id: 1, activo: true },
  { id: 4, nombre: 'Rosa', departamento_id: 1, activo: false },
  { id: 5, nombre: 'Ángela', departamento_id: 1, activo: true },
]

describe('normalizarNombre', () => {
  it('quita tildes, mayúsculas, puntuación y espacios de más', () => {
    expect(normalizarNombre('  Ángela   María, ')).toBe('angela maria')
  })
})

describe('vocabulario', () => {
  it('lista departamentos y nombres activos sin repetir', () => {
    expect(vocabulario(personas, [{ nombre: 'TDH' }])).toBe('TDH, Juan, María José, Ángela')
  })
})

describe('nombreDictado', () => {
  it('quita el punto final y lo que se dice antes del nombre', () => {
    expect(nombreDictado('Carlos Gómez.')).toBe('Carlos Gómez')
    expect(nombreDictado('Agrega a carlos gómez')).toBe('Carlos Gómez')
    expect(nombreDictado('Se llama Ana Ruiz')).toBe('Ana Ruiz')
  })

  it('pone mayúsculas, menos en de, del, los...', () => {
    expect(nombreDictado('MARÍA DE LOS ÁNGELES pérez')).toBe('María de los Ángeles Pérez')
  })

  it('si solo dijo una palabra, esa es el nombre', () => {
    expect(nombreDictado('Nueva')).toBe('Nueva')
  })
})
