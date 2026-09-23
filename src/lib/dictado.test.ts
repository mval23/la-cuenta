import { describe, expect, it } from 'vitest'
import { leerDictado, type Compra, type DepartamentoDictado } from './dictado'
import type { Persona } from './tipos'

const TDH = 1
const RRHH = 2
const BODEGA = 3
const MANTENIMIENTO = 4
const PRUEBA = 5

const departamentos: DepartamentoDictado[] = [
  { id: TDH, nombre: 'TDH', alias: ['te de hache'] },
  { id: RRHH, nombre: 'Recursos Humanos', alias: ['gestión humana'] },
  { id: BODEGA, nombre: 'Bodega 2', alias: [] },
  { id: MANTENIMIENTO, nombre: 'Mantenimiento', alias: ['manto'] },
  { id: PRUEBA, nombre: 'Prueba', alias: [] },
]

const personas: Persona[] = [
  { id: 1, nombre: 'Juan', departamento_id: TDH, activo: true },
  { id: 2, nombre: 'Juan', departamento_id: BODEGA, activo: true },
  { id: 3, nombre: 'María José', departamento_id: TDH, activo: true },
  { id: 4, nombre: 'Pedro Gómez', departamento_id: BODEGA, activo: true },
  { id: 5, nombre: 'Pedro Ruiz', departamento_id: BODEGA, activo: true },
  { id: 6, nombre: 'Rosa', departamento_id: TDH, activo: false },
  { id: 7, nombre: 'Ángela', departamento_id: TDH, activo: true },
  { id: 8, nombre: 'Carlos Pérez', departamento_id: PRUEBA, activo: true },
  { id: 9, nombre: 'Carlos Gómez', departamento_id: PRUEBA, activo: true },
  { id: 10, nombre: 'Luisa Fernanda', departamento_id: MANTENIMIENTO, activo: true },
]

// Viernes.
const HOY = '2026-09-18'

function leer(texto: string, conocidas: Persona[] = []): Compra {
  const lectura = leerDictado(texto, departamentos, conocidas, HOY)
  if (lectura.tipo !== 'compra') throw new Error(`Se leyó "${texto}" como ${lectura.tipo}`)
  return lectura
}

const ids = (lista: Persona[]) => lista.map((p) => p.id)

describe('frase completa, persona nueva', () => {
  it('el ejemplo base', () => {
    expect(leer('Juan TDH almuerzo a 10 mil')).toEqual({
      tipo: 'compra',
      persona: null,
      candidatas: [],
      nombre: 'Juan',
      departamentoId: TDH,
      departamento: 'TDH',
      descripcion: 'almuerzo',
      valor: 10000,
      fecha: null,
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

  it('sin departamento, el nombre llega hasta lo que compró', () => {
    expect(leer('Carlos Gómez almuerzo a 10 mil')).toMatchObject({
      nombre: 'Carlos Gómez',
      departamentoId: null,
      descripcion: 'almuerzo',
      valor: 10000,
    })
  })

  it('solo nombre y número', () => {
    expect(leer('Carlos Gómez 12')).toMatchObject({ nombre: 'Carlos Gómez', descripcion: '', valor: 12000 })
  })
})

describe('frases que no se entendían (pruebas del 18 de septiembre)', () => {
  it('"Anota que..." no es parte del nombre', () => {
    expect(leer('Anota que Carlos Pérez de Prueba se llevó un almuerzo de 12 mil.', personas)).toMatchObject({
      persona: { id: 8 },
      departamentoId: PRUEBA,
      descripcion: 'un almuerzo',
      valor: 12000,
    })
  })

  it('"Pruebas" es el departamento "Prueba", y sobran palabras mal oídas', () => {
    expect(leer('Carlos Pérez de Pruebas y yo un almuerzo a 12 mil.', personas)).toMatchObject({
      persona: { id: 8 },
      departamentoId: PRUEBA,
      descripcion: 'un almuerzo',
      valor: 12000,
    })
  })

  it('"un tinto de 500 para Carlos Gómez": el nombre va al final', () => {
    expect(leer('Anotar un tinto de 500 para Carlos Gómez.', personas)).toMatchObject({
      persona: { id: 9 },
      descripcion: 'un tinto',
      valor: 500,
    })
  })

  it('lo mismo con una persona que todavía no existe', () => {
    expect(leer('Anotar un tinto de 500 para Carlos Gómez.')).toMatchObject({
      persona: null,
      nombre: 'Carlos Gómez',
      descripcion: 'un tinto',
      valor: 500,
    })
  })

  it('"Bórrala" pide anular la última compra', () => {
    expect(leerDictado('Te equivocaste en la última compra. Bórrala.', departamentos, personas, HOY)).toEqual({
      tipo: 'anular',
    })
    expect(leerDictado('anula la anterior', departamentos, personas, HOY).tipo).toBe('anular')
    expect(leerDictado('borra eso', departamentos, personas, HOY).tipo).toBe('anular')
  })

  it('con precio no es anular: es una compra', () => {
    expect(leerDictado('Juan Borrero 12', departamentos, [], HOY).tipo).toBe('compra')
  })
})

describe('persona conocida', () => {
  it('nombre y departamento coinciden', () => {
    expect(leer('Juan TDH 10', personas).persona?.id).toBe(1)
  })

  it('no distingue tildes ni mayúsculas', () => {
    expect(leer('angela tdh 10', personas).persona?.id).toBe(7)
  })

  it('el nombre puede estar en cualquier parte de la frase', () => {
    expect(leer('un almuerzo de 12 mil para Luisa Fernanda', personas)).toMatchObject({
      persona: { id: 10 },
      descripcion: 'un almuerzo',
    })
  })

  it('solo el primer nombre y hay una sola persona así', () => {
    expect(leer('Luisa 12', personas)).toMatchObject({ persona: { id: 10 }, valor: 12000 })
    expect(leer('María almuerzo 12', personas)).toMatchObject({ persona: { id: 3 }, descripcion: 'almuerzo' })
  })

  it('solo el primer nombre seguido de otra palabra: puede ser alguien nuevo', () => {
    const r = leer('Luisa Martínez 12', personas)
    expect(r.persona).toBeNull()
    expect(ids(r.candidatas)).toEqual([10])
    expect(r.nombre).toBe('Luisa Martínez')
  })

  it('sin departamento y con el nombre repetido, pregunta', () => {
    const r = leer('Juan 10', personas)
    expect(r.persona).toBeNull()
    expect(ids(r.candidatas)).toEqual([1, 2])
    expect(r.nombre).toBe('Juan')
  })

  it('con solo el primer nombre ofrece a las que empiezan así', () => {
    const r = leer('Carlos 12', personas)
    expect(r.persona).toBeNull()
    expect(ids(r.candidatas)).toEqual([9, 8])
  })

  it('el nombre completo gana sobre los parecidos', () => {
    expect(leer('Pedro Ruiz 8', personas).persona?.id).toBe(5)
  })

  it('reconoce nombres de dos palabras y los quita de la descripción', () => {
    expect(leer('María José almuerzo 10', personas)).toMatchObject({ persona: { id: 3 }, descripcion: 'almuerzo' })
  })

  it('si en ese departamento no está, la busca en los demás pero pregunta', () => {
    const r = leer('María José Bodega 2 almuerzo 10', personas)
    expect(r.persona).toBeNull()
    expect(ids(r.candidatas)).toEqual([3])
  })

  it('ignora a las personas archivadas', () => {
    const r = leer('Rosa TDH 10', personas)
    expect(r.persona).toBeNull()
    expect(r.candidatas).toEqual([])
    expect(r.nombre).toBe('Rosa')
  })
})

describe('departamento', () => {
  it('por alias', () => {
    expect(leer('Ana te de hache almuerzo 12 mil')).toMatchObject({
      nombre: 'Ana',
      departamentoId: TDH,
      descripcion: 'almuerzo',
      valor: 12000,
    })
    expect(leer('Luis gestión humana desayuno 8 mil').departamento).toBe('Recursos Humanos')
  })

  it('sin importar mayúsculas, tildes ni puntos', () => {
    expect(leer('Ana t.d.h. almuerzo 12 mil').departamentoId).toBe(TDH)
    expect(leer('Ana T D H almuerzo 12 mil').departamentoId).toBe(TDH)
    expect(leer('Ana MANTENIMIENTO almuerzo 12 mil').departamentoId).toBe(MANTENIMIENTO)
  })

  it('con una letra mal oída', () => {
    expect(leer('Ana mantenimento 12').departamentoId).toBe(MANTENIMIENTO)
  })

  it('con número en el nombre no se confunde con el precio', () => {
    expect(leer('Rosa bodega 2 almuerzo a 10 mil')).toMatchObject({
      nombre: 'Rosa',
      departamentoId: BODEGA,
      descripcion: 'almuerzo',
      valor: 10000,
    })
  })

  it('si no se reconoce, queda vacío', () => {
    expect(leer('Juan de Contabilidad almuerzo a 10 mil')).toMatchObject({
      nombre: 'Juan',
      departamentoId: null,
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
    // Sin "mil": nada de la cocina cuesta menos de 100 pesos.
    ['12', 12000],
    ['15', 15000],
    ['doce', 12000],
    ['2.5', 2500],
    ['12 y medio', 12500],
    ['doce y media', 12500],
    ['500', 500],
  ]

  it.each(casos)('"%s" = %i', (dicho, valor) => {
    expect(leer(`Juan TDH almuerzo a ${dicho}`).valor).toBe(valor)
  })

  it('"dos almuerzos" no es un precio', () => {
    expect(leer('Juan TDH dos almuerzos a 20 mil')).toMatchObject({ descripcion: 'dos almuerzos', valor: 20000 })
    expect(leer('Juan TDH 20 dos almuerzos')).toMatchObject({ descripcion: 'dos almuerzos', valor: 20000 })
  })

  it('sin precio queda vacío', () => {
    expect(leer('Juan TDH un almuerzo')).toMatchObject({ descripcion: 'un almuerzo', valor: null })
  })

  it('lo que se dice después del precio va a la descripción', () => {
    expect(leer('Juan TDH 10 mil de almuerzo')).toMatchObject({ descripcion: 'almuerzo', valor: 10000 })
  })

  it('"a 10" también es 10 mil', () => {
    expect(leer('Juan TDH almuerzo a 10').valor).toBe(10000)
  })
})

describe('día', () => {
  const casos: [string, string][] = [
    ['ayer Juan TDH 10', '2026-09-17'],
    ['Juan TDH 10 de ayer', '2026-09-17'],
    ['antier Juan TDH 10', '2026-09-16'],
    ['antes de ayer Juan TDH 10', '2026-09-16'],
    ['el martes Juan TDH 10', '2026-09-15'],
    ['Juan TDH 10 del martes', '2026-09-15'],
    ['martes, Juan TDH 10', '2026-09-15'],
    ['el lunes pasado Juan TDH 10', '2026-09-14'],
    // Un viernes, "el viernes" es el de la semana pasada.
    ['el viernes Juan TDH 10', '2026-09-11'],
    ['el día 15 Juan TDH 10', '2026-09-15'],
    ['el día 30 Juan TDH 10', '2026-08-30'],
    ['hoy Juan TDH 10', '2026-09-18'],
  ]

  it.each(casos)('"%s" es el %s', (dicho, fecha) => {
    expect(leer(dicho)).toMatchObject({ fecha, nombre: 'Juan', departamentoId: TDH, valor: 10000, descripcion: '' })
  })

  it('sin día queda vacío', () => {
    expect(leer('Juan TDH 10').fecha).toBeNull()
  })

  it('"Domingo" sin "el" es un nombre', () => {
    expect(leer('Domingo TDH 10')).toMatchObject({ nombre: 'Domingo', fecha: null })
    expect(leer('el domingo Juan TDH 10')).toMatchObject({ nombre: 'Juan', fecha: '2026-09-13' })
  })
})

describe('persona que suena parecido (la voz la escribe distinto)', () => {
  const SISTEMAS = 6
  const gente: Persona[] = [
    ...personas,
    { id: 20, nombre: 'Raybin', departamento_id: SISTEMAS, activo: true },
    { id: 21, nombre: 'Ferney', departamento_id: SISTEMAS, activo: true },
    { id: 22, nombre: 'Óscar', departamento_id: SISTEMAS, activo: true },
  ]

  it('ofrece a la que ya existe en vez de crear una nueva', () => {
    const r = leer('Reibi 10', gente)
    expect(r.persona).toBeNull()
    expect(ids(r.candidatas)).toEqual([20])
    // Si de verdad es alguien nuevo, se puede crear con lo que se dijo.
    expect(r.nombre).toBe('Reibi')
    expect(r.valor).toBe(10000)
  })

  it('lo que suena igual se toma como el mismo nombre', () => {
    expect(leer('Fernay 12', gente)).toMatchObject({ persona: { id: 21 }, valor: 12000 })
    expect(leer('Ferney 12', gente).persona?.id).toBe(21)
  })

  it('si dos personas suenan igual, pregunta cuál', () => {
    const conDos = [...gente, { id: 23, nombre: 'Fernay', departamento_id: SISTEMAS, activo: true }]
    const r = leer('Ferney 12', conDos)
    expect(r.persona).toBeNull()
    expect(ids(r.candidatas)).toEqual([23, 21])
  })

  it('no confunde lo que compró con un nombre', () => {
    const conTito = [...personas, { id: 24, nombre: 'Tito', departamento_id: TDH, activo: true }]
    const r = leer('Camilo un tinto 2', conTito)
    expect(r.candidatas).toEqual([])
    expect(r.nombre).toBe('Camilo')
  })

  it('si nada suena parecido, es una persona nueva', () => {
    const r = leer('Fabián 9', gente)
    expect(r.persona).toBeNull()
    expect(r.candidatas).toEqual([])
    expect(r.nombre).toBe('Fabián')
  })
})
