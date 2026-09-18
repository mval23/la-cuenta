import { describe, expect, it } from 'vitest'
import { leerDictado, type DepartamentoDictado } from './dictado'

const departamentos: DepartamentoDictado[] = [
  { id: 1, nombre: 'TDH', alias: ['te de hache'] },
  { id: 2, nombre: 'Recursos Humanos', alias: ['gestión humana'] },
  { id: 3, nombre: 'Bodega 2', alias: [] },
  { id: 4, nombre: 'Mantenimiento', alias: ['manto'] },
]

function leer(texto: string) {
  return leerDictado(texto, departamentos)
}

describe('frase completa', () => {
  it('el ejemplo base', () => {
    expect(leer('Juan TDH almuerzo a 10 mil')).toEqual({
      nombre: 'Juan',
      departamentoId: 1,
      departamento: 'TDH',
      descripcion: 'almuerzo',
      valor: 10000,
    })
  })

  it('con puntuación y signo de pesos, como lo escribe el reconocimiento de voz', () => {
    expect(leer('Juan, TDH, almuerzo a $10.000.')).toMatchObject({
      nombre: 'Juan',
      departamento: 'TDH',
      descripcion: 'almuerzo',
      valor: 10000,
    })
  })

  it('nombre de dos palabras y descripción de varias', () => {
    expect(leer('María José Recursos Humanos bandeja paisa y jugo por 18 mil pesos')).toMatchObject({
      nombre: 'María José',
      departamento: 'Recursos Humanos',
      descripcion: 'bandeja paisa y jugo',
      valor: 18000,
    })
  })

  it('"de" entre nombre y departamento', () => {
    expect(leer('Pedro de mantenimiento un tinto a mil quinientos')).toMatchObject({
      nombre: 'Pedro',
      departamento: 'Mantenimiento',
      descripcion: 'un tinto',
      valor: 1500,
    })
  })

  it('verbo antes de lo que compró', () => {
    expect(leer('Carlos TDH se llevó dos empanadas a 5 mil')).toMatchObject({
      nombre: 'Carlos',
      descripcion: 'dos empanadas',
      valor: 5000,
    })
  })
})

describe('departamento', () => {
  it('por alias', () => {
    expect(leer('Ana te de hache almuerzo 12 mil')).toMatchObject({
      nombre: 'Ana',
      departamentoId: 1,
      descripcion: 'almuerzo',
      valor: 12000,
    })
    expect(leer('Luis gestión humana desayuno 8 mil').departamento).toBe('Recursos Humanos')
  })

  it('sin importar mayúsculas, tildes ni puntos', () => {
    expect(leer('Ana t.d.h. almuerzo 12 mil').departamentoId).toBe(1)
    expect(leer('Ana T D H almuerzo 12 mil').departamentoId).toBe(1)
    expect(leer('Ana MANTENIMIENTO almuerzo 12 mil').departamentoId).toBe(4)
  })

  it('con número en el nombre no se confunde con el precio', () => {
    expect(leer('Rosa bodega 2 almuerzo a 10 mil')).toMatchObject({
      nombre: 'Rosa',
      departamentoId: 3,
      descripcion: 'almuerzo',
      valor: 10000,
    })
  })

  it('si no se reconoce, queda vacío y se toma la primera palabra como nombre', () => {
    expect(leer('Juan Contabilidad almuerzo a 10 mil')).toEqual({
      nombre: 'Juan',
      departamentoId: null,
      departamento: null,
      descripcion: 'Contabilidad almuerzo',
      valor: 10000,
    })
  })
})

describe('valor', () => {
  const casos: [string, number][] = [
    ['10 mil', 10000],
    ['10mil', 10000],
    ['diez mil', 10000],
    ['10.000', 10000],
    ['10,000', 10000],
    ['10000', 10000],
    ['$10.000', 10000],
    ['mil', 1000],
    ['mil quinientos', 1500],
    ['quince mil quinientos', 15500],
    ['2 mil 500', 2500],
    ['2.5 mil', 2500],
    ['treinta y cinco mil', 35000],
    ['veintidós mil', 22000],
    ['ciento veinte mil', 120000],
    ['quinientos', 500],
    ['10 lucas', 10000],
    ['un millón doscientos mil', 1200000],
  ]

  it.each(casos)('"%s" = %i', (dicho, valor) => {
    expect(leer(`Juan TDH almuerzo a ${dicho}`).valor).toBe(valor)
  })

  it('"dos almuerzos" no es un precio', () => {
    expect(leer('Juan TDH dos almuerzos a 20 mil')).toMatchObject({
      descripcion: 'dos almuerzos',
      valor: 20000,
    })
  })

  it('sin precio queda vacío', () => {
    expect(leer('Juan TDH un almuerzo')).toMatchObject({
      descripcion: 'un almuerzo',
      valor: null,
    })
  })

  it('lo que se dice después del precio va a la descripción', () => {
    expect(leer('Juan TDH 10 mil de almuerzo')).toMatchObject({
      descripcion: 'almuerzo',
      valor: 10000,
    })
  })
})
