const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })

/** La fecha de hoy en Colombia como "2026-09-17", igual que `hoy_bogota()` en la base. */
export function hoyBogota(ahora = new Date()): string {
  return formatoDia.format(ahora)
}

const formatoHora = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  hour: 'numeric',
  minute: '2-digit',
})

/** "2:05 p. m." */
export function hora(instante: string): string {
  return formatoHora.format(new Date(instante))
}

// Días como "2026-09-17" ------------------------------------------------------
// Se calculan a mediodía UTC para que ningún cambio de hora mueva el día.

function mediodia(dia: string): Date {
  return new Date(`${dia}T12:00:00Z`)
}

/** sumarDias("2026-09-18", -1) = "2026-09-17" */
export function sumarDias(dia: string, dias: number): string {
  const fecha = mediodia(dia)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** 0 = domingo, 1 = lunes... 6 = sábado. */
export function diaDeLaSemana(dia: string): number {
  return mediodia(dia).getUTCDay()
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((mediodia(hasta).getTime() - mediodia(desde).getTime()) / 86_400_000)
}

// Hasta dónde se pueden registrar cuentas atrasadas. La base pone el mismo límite.
export const DIAS_ATRAS_PERMITIDOS = 60

const formatoLargo = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** "martes 15 de septiembre" */
export function fechaLarga(dia: string): string {
  // Sin la coma que pone Intl: "viernes, 18 de septiembre".
  return formatoLargo.format(mediodia(dia)).replace(',', '')
}

/** "Hoy", "Ayer", "Antier" o "martes 15 de septiembre". */
export function nombreDelDia(dia: string, hoy = hoyBogota()): string {
  const atras = diasEntre(dia, hoy)
  if (atras === 0) return 'Hoy'
  if (atras === 1) return 'Ayer'
  if (atras === 2) return 'Antier'
  return fechaLarga(dia)
}

/** "Hoy, viernes 18 de septiembre" o "martes 15 de septiembre". */
export function nombreCompletoDelDia(dia: string, hoy = hoyBogota()): string {
  const nombre = nombreDelDia(dia, hoy)
  return diasEntre(dia, hoy) <= 2 ? `${nombre}, ${fechaLarga(dia)}` : nombre
}
