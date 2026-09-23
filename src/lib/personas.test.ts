import { describe, expect, it } from 'vitest'
import {
  nombreDictado,
  normalizarNombre,
  parecidas,
  sonido,
  suenanIgual,
  suenanParecido,
  vocabulario,
} from './personas'
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

describe('nombres que suenan igual o parecido', () => {
  it('lo que la voz escribe distinto suena igual', () => {
    expect(sonido('Raybin')).toBe(sonido('Reibin'))
    expect(suenanIgual('Ferney', 'Fernay')).toBe(true)
    expect(suenanIgual('Yeison', 'Jeison')).toBe(false)
    expect(suenanIgual('Jhon', 'John')).toBe(true)
    expect(suenanIgual('Jeison', 'Jaison')).toBe(true)
    expect(suenanIgual('Óscar', 'oscar')).toBe(true)
    expect(suenanIgual('Valentina', 'Balentina')).toBe(true)
    expect(suenanIgual('Rodríguez', 'Rodrigues')).toBe(true)
    expect(suenanIgual('Cecilia', 'Secilia')).toBe(true)
  })

  it('una letra de diferencia en nombres no tan cortos suena parecido', () => {
    expect(suenanParecido('Reibi', 'Raybin')).toBe(true)
    expect(suenanParecido('Yohan', 'Johan')).toBe(true)
    expect(suenanParecido('Jaison Fondo', 'Jason Fondo')).toBe(true)
    expect(suenanParecido('Jaison', 'Jason')).toBe(true)
  })

  it('nombres distintos no se confunden', () => {
    expect(suenanParecido('Ana', 'Ada')).toBe(false)
    expect(suenanParecido('Daniel', 'Camilo')).toBe(false)
    expect(suenanParecido('Oscar', 'Fabián')).toBe(false)
  })

  it('parecidas compara el primer nombre y deja fuera a las archivadas', () => {
    const gente: Persona[] = [
      { id: 1, nombre: 'Raybin', departamento_id: 1, activo: true },
      { id: 2, nombre: 'Reibi Torres', departamento_id: 2, activo: true },
      { id: 3, nombre: 'Rubén', departamento_id: 1, activo: true },
      { id: 4, nombre: 'Reybin', departamento_id: 1, activo: false },
    ]
    expect(parecidas('Reibin Gómez', gente).map((p) => p.id)).toEqual([1, 2])
  })
})
