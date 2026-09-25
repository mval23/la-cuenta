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

// Calendario ------------------------------------------------------------------

/** El mes de un día: "2026-09-17" -> "2026-09". */
export function mesDe(dia: string): string {
  return dia.slice(0, 7)
}

/** sumarMeses("2026-01", -1) = "2025-12" */
export function sumarMeses(mes: string, meses: number): string {
  const [anio, numero] = mes.split('-').map(Number)
  const total = anio * 12 + (numero - 1) + meses
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/**
 * Las semanas del mes para dibujar el calendario, de lunes a domingo. Los
 * huecos antes del 1 y después del último día son null.
 */
export function semanasDelMes(mes: string): (string | null)[][] {
  const primero = `${mes}-01`
  const dias: (string | null)[] = Array((diaDeLaSemana(primero) + 6) % 7).fill(null)
  for (let d = primero; mesDe(d) === mes; d = sumarDias(d, 1)) dias.push(d)
  while (dias.length % 7 !== 0) dias.push(null)
  return Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7))
}

const formatoMes = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', month: 'long', year: 'numeric' })

/** "Septiembre de 2026" */
export function nombreDelMes(mes: string): string {
  const texto = formatoMes.format(mediodia(`${mes}-01`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// Quincenas --------------------------------------------------------------------
// Se cobra el 15 y el último día del mes: del 1 al 15 y del 16 al fin de mes.

export interface Quincena {
  desde: string
  hasta: string
}

/** La quincena a la que pertenece un día. */
export function quincenaDe(dia: string): Quincena {
  const mes = mesDe(dia)
  if (Number(dia.slice(8, 10)) <= 15) return { desde: `${mes}-01`, hasta: `${mes}-15` }
  return { desde: `${mes}-16`, hasta: sumarDias(`${sumarMeses(mes, 1)}-01`, -1) }
}

/** La quincena anterior (-1) o la siguiente (1). */
export function quincenaVecina(q: Quincena, paso: -1 | 1): Quincena {
  return quincenaDe(paso === 1 ? sumarDias(q.hasta, 1) : sumarDias(q.desde, -1))
}

/** El primer día de las últimas `cuantas` quincenas, contando la de `dia`. */
export function inicioDeQuincenas(dia: string, cuantas: number): string {
  let q = quincenaDe(dia)
  for (let i = 1; i < cuantas; i++) q = quincenaVecina(q, -1)
  return q.desde
}

const formatoMesSolo = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', month: 'long' })

/** "1 al 15 de septiembre de 2026" */
export function nombreDeQuincena(q: Quincena): string {
  const dia = (d: string) => Number(d.slice(8, 10))
  return `${dia(q.desde)} al ${dia(q.hasta)} de ${formatoMesSolo.format(mediodia(q.desde))} de ${q.desde.slice(0, 4)}`
}

/** "14 de Septiembre de 2026", como en el encabezado de una cuenta de cobro. */
export function fechaDeDocumento(dia: string): string {
  const mes = formatoMesSolo.format(mediodia(dia))
  return `${Number(dia.slice(8, 10))} de ${mes.charAt(0).toUpperCase()}${mes.slice(1)} de ${dia.slice(0, 4)}`
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic']

/** "Ago-02", como en la tabla de una cuenta de cobro. */
export function fechaDeTabla(dia: string): string {
  return `${MESES_CORTOS[Number(dia.slice(5, 7)) - 1]}-${dia.slice(8, 10)}`
}
