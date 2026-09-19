// El candado de la app en este dispositivo.
//
// La cuenta de Supabase tiene una contraseña larga que se escribe una sola vez
// al configurar el iPad; la sesión queda guardada. El PIN de 4 números solo
// abre la app en este dispositivo: desde otro lado no sirve para nada, así que
// para adivinarlo hay que tener el iPad en la mano, y con muchos intentos
// fallidos se cierra la sesión.
//
// Se guarda la huella del PIN (PBKDF2 con sal), no el PIN.

export const LARGO_PIN = 4
/** Tiempo sin usar la app tras el cual se vuelve a pedir el PIN. */
export const PEDIR_PIN_TRAS_MS = 30 * 60_000
/** Cada tantos fallos seguidos hay que esperar un minuto. */
export const FALLOS_ANTES_DE_ESPERAR = 5
export const ESPERA_MS = 60_000
/** Con tantos fallos seguidos se cierra la sesión. */
export const FALLOS_MAXIMOS = 10

const ITERACIONES = 100_000

/** localStorage, o uno de mentiras en las pruebas. */
export interface Almacen {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
  removeItem(clave: string): void
}

interface Registro {
  usuario: string
  sal: string
  huella: string
  /** Se falló el PIN demasiadas veces: hay que configurar el iPad otra vez. */
  bloqueado?: boolean
}

interface Fallos {
  seguidos: number
  esperarHasta: number
}

const CLAVE_PIN = 'la-cuenta:pin'
const CLAVE_FALLOS = 'la-cuenta:fallos'
const CLAVE_USO = 'la-cuenta:ultimo-uso'

function leer<T>(almacen: Almacen, clave: string): T | null {
  try {
    const texto = almacen.getItem(clave)
    return texto ? (JSON.parse(texto) as T) : null
  } catch {
    return null
  }
}

function aBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function deBase64(texto: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))
}

async function huella(pin: string, sal: Uint8Array<ArrayBuffer>): Promise<string> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES },
    clave,
    256,
  )
  return aBase64(new Uint8Array(bits))
}

export type EstadoCandado =
  /** Todavía no hay PIN para esta usuaria en este dispositivo. */
  | 'elegir'
  /** Hay que escribir el PIN. */
  | 'cerrado'
  | 'abierto'
  /** Se falló demasiadas veces: solo queda configurar el iPad otra vez. */
  | 'bloqueado'

/** Cómo debe estar el candado al abrir la app o al volver a ella. */
export function estadoDelCandado(almacen: Almacen, usuario: string, ahora = Date.now()): EstadoCandado {
  const registro = leer<Registro>(almacen, CLAVE_PIN)
  if (registro?.bloqueado) return 'bloqueado'
  if (!registro || registro.usuario !== usuario) return 'elegir'
  const uso = leer<number>(almacen, CLAVE_USO)
  return uso === null || ahora - uso > PEDIR_PIN_TRAS_MS ? 'cerrado' : 'abierto'
}

/** Anota que la app se está usando: el PIN se pide cuando pasa un rato sin usarla. */
export function marcarUso(almacen: Almacen, ahora = Date.now()) {
  almacen.setItem(CLAVE_USO, JSON.stringify(ahora))
}

export async function guardarPin(almacen: Almacen, usuario: string, pin: string, ahora = Date.now()) {
  const sal = crypto.getRandomValues(new Uint8Array(16))
  const registro: Registro = { usuario, sal: aBase64(sal), huella: await huella(pin, sal) }
  almacen.setItem(CLAVE_PIN, JSON.stringify(registro))
  almacen.removeItem(CLAVE_FALLOS)
  marcarUso(almacen, ahora)
}

export type ResultadoPin =
  | { tipo: 'ok' }
  /** PIN equivocado; `quedan` intentos antes de que se cierre la sesión. */
  | { tipo: 'no'; quedan: number }
  /** Hay que esperar hasta ese momento para volver a intentar. */
  | { tipo: 'esperar'; hasta: number }
  /** Demasiados fallos: la app queda bloqueada en este dispositivo. */
  | { tipo: 'bloqueado' }

/** Si hay que esperar antes de volver a intentar, hasta cuándo. */
export function esperaPendiente(almacen: Almacen, ahora = Date.now()): number | null {
  const fallos = leer<Fallos>(almacen, CLAVE_FALLOS)
  return fallos && fallos.esperarHasta > ahora ? fallos.esperarHasta : null
}

export async function probarPin(almacen: Almacen, pin: string, ahora = Date.now()): Promise<ResultadoPin> {
  const registro = leer<Registro>(almacen, CLAVE_PIN)
  if (!registro || registro.bloqueado) return { tipo: 'bloqueado' }
  const fallos = leer<Fallos>(almacen, CLAVE_FALLOS) ?? { seguidos: 0, esperarHasta: 0 }
  if (fallos.esperarHasta > ahora) return { tipo: 'esperar', hasta: fallos.esperarHasta }

  if ((await huella(pin, deBase64(registro.sal))) === registro.huella) {
    almacen.removeItem(CLAVE_FALLOS)
    marcarUso(almacen, ahora)
    return { tipo: 'ok' }
  }

  const seguidos = fallos.seguidos + 1
  if (seguidos >= FALLOS_MAXIMOS) {
    // Queda anotado aunque no haya internet para cerrar la sesión: sin esto,
    // recargar la app ofrecería elegir un PIN nuevo.
    almacen.setItem(CLAVE_PIN, JSON.stringify({ ...registro, bloqueado: true }))
    almacen.removeItem(CLAVE_FALLOS)
    return { tipo: 'bloqueado' }
  }
  const esperarHasta = seguidos % FALLOS_ANTES_DE_ESPERAR === 0 ? ahora + ESPERA_MS : 0
  almacen.setItem(CLAVE_FALLOS, JSON.stringify({ seguidos, esperarHasta }))
  return esperarHasta ? { tipo: 'esperar', hasta: esperarHasta } : { tipo: 'no', quedan: FALLOS_MAXIMOS - seguidos }
}

/** Borra el PIN y los intentos, para configurar el dispositivo de nuevo. */
export function olvidarPin(almacen: Almacen) {
  almacen.removeItem(CLAVE_PIN)
  almacen.removeItem(CLAVE_FALLOS)
  almacen.removeItem(CLAVE_USO)
}

/** Si el dispositivo quedó bloqueado por fallar el PIN demasiadas veces. */
export function quedoBloqueado(almacen: Almacen): boolean {
  return leer<Registro>(almacen, CLAVE_PIN)?.bloqueado === true
}

/** 1111, 1234, 9876: lo primero que probaría alguien que agarre el iPad. */
export function pinMuyFacil(pin: string): boolean {
  const pasos = new Set([...pin].slice(1).map((d, i) => Number(d) - Number(pin[i])))
  return pasos.size === 1 && [0, 1, -1].includes([...pasos][0])
}
