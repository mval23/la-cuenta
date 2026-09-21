// Números en letras, como se escriben en una cuenta de cobro:
// 343000 -> "Trescientos cuarenta y tres mil pesos M/cte."

const UNIDADES = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve',
]
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
]

/** 0 a 999. */
function hastaMil(n: number): string {
  if (n === 100) return 'cien'
  const partes: string[] = []
  const c = Math.floor(n / 100)
  const resto = n % 100
  if (c) partes.push(CENTENAS[c])
  if (resto < 30) {
    if (resto) partes.push(UNIDADES[resto])
  } else {
    const d = Math.floor(resto / 10)
    const u = resto % 10
    partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d])
  }
  return partes.join(' ')
}

/** Delante de "mil" o "millones", "uno" se dice "un": "veintiún mil". */
function apocopar(texto: string): string {
  return texto.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')
}

/** 343000 -> "trescientos cuarenta y tres mil". Pesos enteros, hasta 999.999.999.999. */
export function numeroEnLetras(n: number): string {
  n = Math.trunc(Math.abs(n))
  if (n === 0) return 'cero'
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (millones === 1) partes.push('un millón')
  else if (millones > 1) partes.push(`${apocopar(numeroEnLetras(millones))} millones`)
  if (miles === 1) partes.push('mil')
  else if (miles > 1) partes.push(`${apocopar(hastaMil(miles))} mil`)
  if (resto) partes.push(hastaMil(resto))
  return partes.join(' ')
}

/** "Trescientos cuarenta y tres mil pesos M/cte."; con millones exactos, "Un millón de pesos M/cte." */
export function sumaEnLetras(pesos: number): string {
  const letras = numeroEnLetras(pesos)
  const de = pesos % 1_000_000 === 0 && pesos >= 1_000_000 ? 'de ' : ''
  return `${letras.charAt(0).toUpperCase()}${letras.slice(1)} ${de}pesos M/cte.`
}
