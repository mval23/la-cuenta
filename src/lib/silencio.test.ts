import { describe, expect, it } from 'vitest'
import { crearDetector, ESPERA_SIN_VOZ_MS, SILENCIO_FINAL_MS, volumen, type Decision } from './silencio'

const PASO = 50

/** Alimenta el detector con `ms` milisegundos a un volumen fijo. */
function durante(detector: ReturnType<typeof crearDetector>, nivel: number, ms: number): Decision {
  let ultima: Decision = 'sigue'
  for (let t = 0; t < ms; t += PASO) {
    ultima = detector.paso(nivel, PASO)
    if (ultima !== 'sigue') return ultima
  }
  return ultima
}

describe('crearDetector', () => {
  it('termina tras un silencio después de hablar', () => {
    const d = crearDetector()
    expect(durante(d, 0.003, 500)).toBe('sigue')
    expect(durante(d, 0.1, 1200)).toBe('sigue')
    expect(durante(d, 0.003, SILENCIO_FINAL_MS - PASO)).toBe('sigue')
    expect(durante(d, 0.003, PASO)).toBe('termino')
    expect(d.huboVoz()).toBe(true)
  })

  it('aguanta pausas cortas entre el nombre y el número', () => {
    const d = crearDetector()
    durante(d, 0.003, 300)
    durante(d, 0.1, 600)
    expect(durante(d, 0.003, 1000)).toBe('sigue')
    expect(durante(d, 0.1, 500)).toBe('sigue')
    expect(durante(d, 0.003, SILENCIO_FINAL_MS)).toBe('termino')
  })

  it('se rinde si nadie habla', () => {
    const d = crearDetector()
    expect(durante(d, 0.003, ESPERA_SIN_VOZ_MS - PASO)).toBe('sigue')
    expect(durante(d, 0.003, PASO)).toBe('sin-voz')
    expect(d.huboVoz()).toBe(false)
  })

  it('un golpe corto no cuenta como voz', () => {
    const d = crearDetector()
    durante(d, 0.003, 300)
    durante(d, 0.3, 100)
    expect(durante(d, 0.003, SILENCIO_FINAL_MS)).toBe('sigue')
    expect(d.huboVoz()).toBe(false)
  })

  it('en una cocina ruidosa solo cuenta la voz por encima del ruido', () => {
    const d = crearDetector()
    // Ruido de fondo constante que ya pasaría el umbral mínimo.
    expect(durante(d, 0.02, 2000)).toBe('sigue')
    expect(d.huboVoz()).toBe(false)
    durante(d, 0.15, 800)
    expect(d.huboVoz()).toBe(true)
    expect(durante(d, 0.02, SILENCIO_FINAL_MS)).toBe('termino')
  })

  it('funciona aunque empiece a hablar de una vez', () => {
    const d = crearDetector()
    expect(durante(d, 0.1, 1000)).toBe('sigue')
    expect(d.huboVoz()).toBe(true)
    expect(durante(d, 0.003, SILENCIO_FINAL_MS)).toBe('termino')
  })
})

describe('volumen', () => {
  it('mide el RMS de las muestras', () => {
    expect(volumen(new Float32Array([0, 0, 0, 0]))).toBe(0)
    expect(volumen(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5)
  })
})
