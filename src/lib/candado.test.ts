import { describe, expect, it } from 'vitest'
import {
  ESPERA_MS,
  esperaPendiente,
  estadoDelCandado,
  FALLOS_ANTES_DE_ESPERAR,
  FALLOS_MAXIMOS,
  guardarPin,
  marcarUso,
  olvidarPin,
  PEDIR_PIN_TRAS_MS,
  pinMuyFacil,
  probarPin,
  quedoBloqueado,
  type Almacen,
} from './candado'

function almacen(): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>()
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  }
}

const AMPARO = 'id-de-amparo'
const T = 1_000_000_000

describe('estadoDelCandado', () => {
  it('sin PIN guardado, pide elegir uno', () => {
    expect(estadoDelCandado(almacen(), AMPARO, T)).toBe('elegir')
  })

  it('recién elegido queda abierto, y se cierra tras un rato sin usar la app', async () => {
    const a = almacen()
    await guardarPin(a, AMPARO, '1234', T)
    expect(estadoDelCandado(a, AMPARO, T + PEDIR_PIN_TRAS_MS)).toBe('abierto')
    expect(estadoDelCandado(a, AMPARO, T + PEDIR_PIN_TRAS_MS + 1)).toBe('cerrado')
    marcarUso(a, T + PEDIR_PIN_TRAS_MS)
    expect(estadoDelCandado(a, AMPARO, T + PEDIR_PIN_TRAS_MS + 1)).toBe('abierto')
  })

  it('el PIN de otra usuaria no sirve: hay que elegir uno', async () => {
    const a = almacen()
    await guardarPin(a, AMPARO, '1234', T)
    expect(estadoDelCandado(a, 'id-de-mariana', T)).toBe('elegir')
  })

  it('no guarda el PIN, solo su huella', async () => {
    const a = almacen()
    await guardarPin(a, AMPARO, '1234', T)
    expect([...a.datos.values()].join()).not.toContain('1234')
  })
})

describe('probarPin', () => {
  it('abre con el PIN correcto y no con otro', async () => {
    const a = almacen()
    await guardarPin(a, AMPARO, '1234', T)
    expect(await probarPin(a, '4321', T)).toEqual({ tipo: 'no', quedan: FALLOS_MAXIMOS - 1 })
    expect(await probarPin(a, '1234', T)).toEqual({ tipo: 'ok' })
  })

  it('tras varios fallos hace esperar un minuto, aunque se recargue la app', async () => {
    const a = almacen()
    await guardarPin(a, AMPARO, '1234', T)
    for (let i = 1; i < FALLOS_ANTES_DE_ESPERAR; i++) await probarPin(a, '0000', T)
    expect(await probarPin(a, '0000', T)).toEqual({ tipo: 'esperar', hasta: T + ESPERA_MS })
    expect(esperaPendiente(a, T + 1)).toBe(T + ESPERA_MS)
    // Ni siquiera el correcto sirve mientras tanto.
    expect((await probarPin(a, '1234', T + 1)).tipo).toBe('esperar')
    expect(await probarPin(a, '1234', T + ESPERA_MS)).toEqual({ tipo: 'ok' })
  })

  it('acertar vuelve a contar los fallos desde cero', async () => {
    const a = almacen()
    await guardarPin(a, AMPARO, '1234', T)
    for (let i = 1; i < FALLOS_ANTES_DE_ESPERAR; i++) await probarPin(a, '0000', T)
    await probarPin(a, '1234', T)
    expect(await probarPin(a, '0000', T)).toEqual({ tipo: 'no', quedan: FALLOS_MAXIMOS - 1 })
  })

  it('con demasiados fallos queda bloqueada hasta configurar el iPad otra vez', async () => {
    const a = almacen()
    await guardarPin(a, AMPARO, '1234', T)
    let ahora = T
    let ultimo
    for (let i = 0; i < FALLOS_MAXIMOS; i++) {
      ultimo = await probarPin(a, '0000', ahora)
      ahora += ESPERA_MS
    }
    expect(ultimo).toEqual({ tipo: 'bloqueado' })
    expect(await probarPin(a, '1234', ahora)).toEqual({ tipo: 'bloqueado' })
    // Recargar la app no deja elegir un PIN nuevo.
    expect(estadoDelCandado(a, AMPARO, ahora)).toBe('bloqueado')
    olvidarPin(a)
    expect(estadoDelCandado(a, AMPARO, ahora)).toBe('elegir')
  })
})

describe('pinMuyFacil', () => {
  it('rechaza repetidos y seguidos', () => {
    for (const pin of ['0000', '1111', '1234', '6789', '4321', '9876']) expect(pinMuyFacil(pin)).toBe(true)
  })

  it('acepta los demás', () => {
    for (const pin of ['1357', '2580', '1122', '0912', '1235']) expect(pinMuyFacil(pin)).toBe(false)
  })
})

describe('quedoBloqueado', () => {
  it('solo tras demasiados fallos', async () => {
    const a = almacen()
    await guardarPin(a, AMPARO, '1357', T)
    expect(quedoBloqueado(a)).toBe(false)
    for (let i = 0; i < FALLOS_MAXIMOS; i++) await probarPin(a, '0000', T + i * ESPERA_MS)
    expect(quedoBloqueado(a)).toBe(true)
  })
})
