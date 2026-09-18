import { describe, expect, it } from 'vitest'
import type { Dictado } from './dictado'
import { resolverPersona, vocabulario } from './personas'
import type { Persona } from './tipos'

const TDH = 1
const BODEGA = 2

const personas: Persona[] = [
  { id: 1, nombre: 'Juan', departamento_id: TDH, activo: true },
  { id: 2, nombre: 'Juan', departamento_id: BODEGA, activo: true },
  { id: 3, nombre: 'María José', departamento_id: TDH, activo: true },
  { id: 4, nombre: 'Pedro Gómez', departamento_id: BODEGA, activo: true },
  { id: 5, nombre: 'Pedro Ruiz', departamento_id: BODEGA, activo: true },
  { id: 6, nombre: 'Rosa', departamento_id: TDH, activo: false },
  { id: 7, nombre: 'Ángela', departamento_id: TDH, activo: true },
]

function dictado(cambios: Partial<Dictado>): Dictado {
  return {
    nombre: '',
    departamentoId: null,
    departamento: null,
    descripcion: 'almuerzo',
    valor: 10000,
    ...cambios,
  }
}

const ids = (lista: Persona[]) => lista.map((p) => p.id)

describe('resolverPersona', () => {
  it('elige a la persona cuando el nombre y el departamento coinciden', () => {
    const r = resolverPersona(dictado({ nombre: 'Juan', departamentoId: TDH }), personas)
    expect(r.persona?.id).toBe(1)
  })

  it('no distingue tildes ni mayúsculas', () => {
    const r = resolverPersona(dictado({ nombre: 'angela', departamentoId: TDH }), personas)
    expect(r.persona?.id).toBe(7)
  })

  it('sin departamento y con el nombre repetido, pregunta', () => {
    const r = resolverPersona(dictado({ nombre: 'Juan' }), personas)
    expect(r.persona).toBeNull()
    expect(ids(r.candidatas)).toEqual([1, 2])
  })

  it('con solo el primer nombre ofrece a las que empiezan así', () => {
    const r = resolverPersona(dictado({ nombre: 'Pedro', departamentoId: BODEGA }), personas)
    expect(r.persona).toBeNull()
    expect(ids(r.candidatas)).toEqual([4, 5])
  })

  it('sin departamento reconoce nombres de dos palabras y los quita de la descripción', () => {
    const r = resolverPersona(
      dictado({ nombre: 'María', descripcion: 'José almuerzo' }),
      personas,
    )
    expect(r.persona?.id).toBe(3)
    expect(r.descripcion).toBe('almuerzo')
  })

  it('si en ese departamento no hay nadie parecido, busca en los demás', () => {
    const r = resolverPersona(dictado({ nombre: 'María José', departamentoId: BODEGA }), personas)
    expect(r.persona).toBeNull()
    expect(ids(r.candidatas)).toEqual([3])
  })

  it('ignora a las personas archivadas', () => {
    const r = resolverPersona(dictado({ nombre: 'Rosa', departamentoId: TDH }), personas)
    expect(r.persona).toBeNull()
    expect(r.candidatas).toEqual([])
  })

  it('persona nueva: sin elegida ni candidatas', () => {
    const r = resolverPersona(dictado({ nombre: 'Carlos', departamentoId: TDH }), personas)
    expect(r).toEqual({ persona: null, candidatas: [], descripcion: 'almuerzo' })
  })

  it('sin nombre no busca', () => {
    const r = resolverPersona(dictado({ nombre: '' }), personas)
    expect(r.candidatas).toEqual([])
  })
})

describe('vocabulario', () => {
  it('lista departamentos y nombres activos sin repetir', () => {
    expect(vocabulario(personas, [{ nombre: 'TDH' }])).toBe(
      'TDH, Juan, María José, Pedro Gómez, Pedro Ruiz, Ángela',
    )
  })
})
