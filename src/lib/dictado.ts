// Convierte una frase dictada ("Juan TDH almuerzo a 10 mil") en los datos de
// una compra. Es determinístico: no usa IA, solo reglas, para que se pueda
// probar y para que se equivoque siempre igual.

export interface DepartamentoDictado {
  id: number
  nombre: string
  alias: string[]
}

export interface Dictado {
  nombre: string
  departamentoId: number | null
  departamento: string | null
  descripcion: string
  valor: number | null
}

interface Palabra {
  original: string
  norma: string
}

/** Minúsculas, sin tildes. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Solo letras y números, para comparar "T.D.H.", "t d h" y "TDH" como iguales. */
function compacto(texto: string): string {
  return normalizar(texto).replace(/[^a-z0-9]/g, '')
}

function separar(texto: string): Palabra[] {
  return (
    texto
      // "10mil" -> "10 mil", "5k" -> "5 k"
      .replace(/(\d)([a-zA-ZáéíóúÁÉÍÓÚ])/g, '$1 $2')
      .split(/\s+/)
      .map((p) => p.replace(/^[.,;:!?¿¡"'()$]+|[.,;:!?¿¡"'()]+$/g, ''))
      .filter((p) => p !== '')
      .map((original) => ({ original, norma: normalizar(original) }))
  )
}

// Números dichos con palabras ------------------------------------------------

const UNIDADES: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40,
  cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100,
  ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300,
  trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500,
  quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700,
  setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900,
  novecientas: 900,
}

// "10 lucas" y "10 k" también son 10 mil.
const MILES = new Set(['mil', 'luca', 'lucas', 'k'])
const MILLONES = new Set(['millon', 'millones'])

function esNumero(norma: string): boolean {
  return /^\d[\d.,]*$/.test(norma) || norma in UNIDADES || MILES.has(norma) || MILLONES.has(norma)
}

/** "10.000" -> 10000; "2.5" o "2,5" seguido de "mil" -> 2.5 */
function leerCifra(texto: string, siguienteEsMil: boolean): number {
  if (siguienteEsMil && /^\d+[.,]\d{1,2}$/.test(texto)) return Number(texto.replace(',', '.'))
  return Number(texto.replace(/[.,]/g, ''))
}

function valorDeNumeros(palabras: Palabra[]): number {
  let total = 0
  let actual = 0
  palabras.forEach((p, i) => {
    const siguiente = palabras[i + 1]?.norma ?? ''
    if (MILLONES.has(p.norma)) {
      total += (actual || 1) * 1_000_000
      actual = 0
    } else if (MILES.has(p.norma)) {
      total += (actual || 1) * 1000
      actual = 0
    } else if (p.norma in UNIDADES) {
      actual += UNIDADES[p.norma]
    } else {
      actual += leerCifra(p.norma, MILES.has(siguiente))
    }
  })
  return Math.round(total + actual)
}

// Nada de la cocina cuesta menos de esto: evita tomar "dos almuerzos" o
// "un tinto" como si fuera el precio.
const VALOR_MINIMO = 50

interface Tramo {
  inicio: number
  fin: number // exclusivo
  valor: number
}

/** Busca el último grupo de palabras que forma un precio. */
function buscarValor(palabras: Palabra[]): Tramo | null {
  let encontrado: Tramo | null = null
  let i = 0
  while (i < palabras.length) {
    if (!esNumero(palabras[i].norma)) {
      i++
      continue
    }
    let fin = i + 1
    // "treinta y cinco mil": la "y" solo cuenta si hay un número después.
    while (
      fin < palabras.length &&
      (esNumero(palabras[fin].norma) ||
        (palabras[fin].norma === 'y' && fin + 1 < palabras.length && esNumero(palabras[fin + 1].norma)))
    ) {
      fin++
    }
    const numeros = palabras.slice(i, fin).filter((p) => p.norma !== 'y')
    const valor = valorDeNumeros(numeros)
    if (valor >= VALOR_MINIMO) encontrado = { inicio: i, fin, valor }
    i = fin
  }
  return encontrado
}

// Departamento ---------------------------------------------------------------

interface Coincidencia {
  inicio: number
  fin: number
  departamento: DepartamentoDictado
}

function buscarDepartamento(
  palabras: Palabra[],
  departamentos: DepartamentoDictado[],
): Coincidencia | null {
  const formas = departamentos.flatMap((d) =>
    [d.nombre, ...d.alias].map((f) => ({ clave: compacto(f), departamento: d })).filter((f) => f.clave),
  )
  let mejor: Coincidencia | null = null
  for (let inicio = 0; inicio < palabras.length; inicio++) {
    // Hasta 5 palabras: "te de hache", "recursos humanos", "t d h".
    for (let fin = inicio + 1; fin <= Math.min(palabras.length, inicio + 5); fin++) {
      const junto = palabras.slice(inicio, fin).map((p) => compacto(p.original)).join('')
      const forma = formas.find((f) => f.clave === junto)
      if (forma && (!mejor || fin - inicio > mejor.fin - mejor.inicio)) {
        mejor = { inicio, fin, departamento: forma.departamento }
      }
    }
    if (mejor) break
  }
  return mejor
}

// Limpieza de palabras sueltas -----------------------------------------------

const ANTES_DE_DESCRIPCION = new Set(['de', 'del', 'compro', 'llevo', 'se', 'pidio', 'le'])
const ANTES_DE_VALOR = new Set(['a', 'por', 'en', 'de', 'vale', 'valor', 'son', 'x', 'y'])
const DESPUES_DE_VALOR = new Set(['pesos', 'peso'])

function recortar(palabras: Palabra[], inicio: Set<string>, final: Set<string>): Palabra[] {
  let a = 0
  let b = palabras.length
  while (a < b && inicio.has(palabras[a].norma)) a++
  while (b > a && final.has(palabras[b - 1].norma)) b--
  return palabras.slice(a, b)
}

function unir(palabras: Palabra[]): string {
  return palabras.map((p) => p.original).join(' ')
}

// Principal ------------------------------------------------------------------

export function leerDictado(texto: string, departamentos: DepartamentoDictado[]): Dictado {
  const palabras = separar(texto)
  const depto = buscarDepartamento(palabras, departamentos)

  // El departamento se quita antes de buscar el precio, por si su nombre
  // tiene números ("Bodega 2").
  const sinDepto = depto
    ? [...palabras.slice(0, depto.inicio), ...palabras.slice(depto.fin)]
    : palabras
  const tramo = buscarValor(sinDepto)

  const antesDelValor = tramo ? sinDepto.slice(0, tramo.inicio) : sinDepto
  const despuesDelValor = tramo
    ? recortar(sinDepto.slice(tramo.fin), DESPUES_DE_VALOR, DESPUES_DE_VALOR)
    : []

  let nombre: Palabra[]
  let resto: Palabra[]
  if (depto) {
    // Lo de antes del departamento es el nombre; lo de después, lo que compró.
    nombre = antesDelValor.slice(0, depto.inicio)
    resto = antesDelValor.slice(depto.inicio)
  } else {
    // Sin departamento no hay cómo saber dónde termina el nombre: se toma la
    // primera palabra y la pantalla de confirmación deja corregirlo.
    nombre = antesDelValor.slice(0, 1)
    resto = antesDelValor.slice(1)
  }

  nombre = recortar(nombre, new Set(['a', 'para']), new Set(['de', 'del']))
  const descripcion = [
    ...recortar(resto, ANTES_DE_DESCRIPCION, ANTES_DE_VALOR),
    ...despuesDelValor.filter((p) => !ANTES_DE_DESCRIPCION.has(p.norma)),
  ]

  return {
    nombre: unir(nombre),
    departamentoId: depto?.departamento.id ?? null,
    departamento: depto?.departamento.nombre ?? null,
    descripcion: unir(descripcion),
    valor: tramo?.valor ?? null,
  }
}
