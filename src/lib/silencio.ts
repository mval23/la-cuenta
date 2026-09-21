// Decide cuándo dejar de escuchar sin que haya que tocar el botón.
// Recibe el volumen del micrófono (RMS entre 0 y 1) cada pocos milisegundos
// y compara contra el ruido de fondo, que se va ajustando solo (la cocina
// puede ser ruidosa o silenciosa).

/** Después de hablar, este silencio significa que terminó la frase. */
export const SILENCIO_FINAL_MS = 1_600
/** Si en este tiempo no se oye voz, se deja de escuchar. */
export const ESPERA_SIN_VOZ_MS = 8_000
/** Voz sostenida necesaria para contar como habla (no un golpe o un ruido). */
const VOZ_MINIMA_MS = 250
/** Volumen mínimo que cuenta como voz, aunque el lugar esté muy callado. */
const UMBRAL_MINIMO = 0.012
/** La voz debe sonar esta cantidad de veces más fuerte que el ruido de fondo. */
const VECES_SOBRE_RUIDO = 2.5
/** Tope para el ruido inicial, por si la usuaria empieza a hablar de una vez. */
const RUIDO_INICIAL_MAXIMO = 0.02

export type Decision = 'sigue' | 'termino' | 'sin-voz'

export interface Detector {
  /** Nuevo volumen medido `ms` milisegundos después del anterior. */
  paso: (volumen: number, ms: number) => Decision
  huboVoz: () => boolean
}

/** `silencioFinalMs`: más largo cuando se explica algo con pausas para pensar. */
export function crearDetector(silencioFinalMs = SILENCIO_FINAL_MS): Detector {
  let ruido: number | null = null
  let transcurrido = 0
  let vozSeguida = 0
  let silencio = 0
  let huboVoz = false

  return {
    paso(volumen, ms) {
      transcurrido += ms
      if (ruido === null) ruido = Math.min(volumen, RUIDO_INICIAL_MAXIMO)
      const umbral = Math.max(UMBRAL_MINIMO, ruido * VECES_SOBRE_RUIDO)

      if (volumen >= umbral) {
        vozSeguida += ms
        silencio = 0
        if (vozSeguida >= VOZ_MINIMA_MS) huboVoz = true
      } else {
        vozSeguida = 0
        silencio += ms
        // Solo se aprende el ruido de fondo cuando no hay voz.
        ruido += (volumen - ruido) * 0.05
      }

      if (huboVoz) return silencio >= silencioFinalMs ? 'termino' : 'sigue'
      return transcurrido >= ESPERA_SIN_VOZ_MS ? 'sin-voz' : 'sigue'
    },
    huboVoz: () => huboVoz,
  }
}

export function volumen(muestras: Float32Array): number {
  let suma = 0
  for (const m of muestras) suma += m * m
  return Math.sqrt(suma / muestras.length)
}
