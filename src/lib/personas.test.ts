import { describe, expect, it } from 'vitest'
import { normalizarNombre, vocabulario } from './personas'
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
