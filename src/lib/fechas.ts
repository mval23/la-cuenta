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
