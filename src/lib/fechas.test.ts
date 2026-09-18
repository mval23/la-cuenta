import { describe, expect, it } from 'vitest'
import { hoyBogota } from './fechas'

describe('hoyBogota', () => {
  it('usa la hora de Colombia, no la del dispositivo ni UTC', () => {
    // 3 a. m. UTC del 18 es todavía el 17 a las 10 p. m. en Bogotá.
    expect(hoyBogota(new Date('2026-09-18T03:00:00Z'))).toBe('2026-09-17')
    expect(hoyBogota(new Date('2026-09-18T05:00:00Z'))).toBe('2026-09-18')
  })
})
