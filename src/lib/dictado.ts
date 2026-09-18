// Convierte una frase dictada ("Juan TDH almuerzo a 10 mil", "Carlos 12",
// "ayer Pedro 15") en los datos de una compra. Es determinístico: no usa IA,
// solo reglas, para que se pueda probar y para que se equivoque siempre igual.
//
// El orden de lectura es: primero lo que se reconoce con seguridad (el día, el
// departamento, el precio, una persona conocida) y lo que sobra se reparte
// entre el nombre de una persona nueva y lo que compró.

import { diaDeLaSemana, diasEntre, DIAS_ATRAS_PERMITIDOS, hoyBogota, sumarDias } from './fechas'
import { normalizarNombre } from './personas'
import type { Persona } from './tipos'

export interface DepartamentoDictado {
  id: number
  nombre: string
  alias: string[]
}

export interface Compra {
  tipo: 'compra'
  /** La persona elegida sin duda, o null si hay que preguntar o crearla. */
  persona: Persona | null
  /** Personas posibles para que la usuaria toque la correcta. */
  candidatas: Persona[]
  /** Nombre para crear una persona nueva si no es ninguna de las conocidas. */
  nombre: string
  departamentoId: number | null
  departamento: string | null
  descripcion: string
  valor: number | null
  /** El día que se dijo ("ayer", "el martes"), o null si no se dijo. */
  fecha: string | null
}

/** "Bórrala", "anula la última": deshacer la última compra. */
export interface Anular {
  tipo: 'anular'
}

export type Lectura = Compra | Anular

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
      .map((p) => p.replace(/^[.,;:!?¿¡"'«»()$]+|[.,;:!?¿¡"'«»()]+$/g, ''))
      .filter((p) => p !== '')
      .map((original) => ({ original, norma: normalizar(original) }))
  )
}

/** Distancia de edición, para "Pruebas" = "Prueba" o un departamento mal oído. */
function distancia(a: string, b: string): number {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const actual = [i]
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previa = actual
  }
  return previa[b.length]
}

// Palabras que no son ni nombre ni lo que se compró ---------------------------

/** Lo que se dice antes de la frase: "Anota que...", "Ponle a...". */
const MULETILLAS = new Set([
  'anota', 'anotar', 'anote', 'anotale', 'anotele', 'apunta', 'apuntar', 'apunte', 'apuntale',
  'apuntele', 'registra', 'registrar', 'registre', 'registrale', 'pon', 'ponle', 'ponga', 'pongale',
  'poner', 'carga', 'cargale', 'cargar', 'cargue', 'carguele', 'fia', 'fiale', 'fiar', 'que', 'a',
  'al', 'para', 'le', 'la', 'el', 'lo', 'me', 'porfa', 'por', 'favor', 'oye', 'bueno', 'listo',
  'entonces', 'y', 'yo', 'ya', 'otra', 'otro', 'vez', 'tambien', 'mira', 'mijo', 'mija',
])

/** Verbos entre el nombre y lo que compró: "se llevó", "debe". */
const VERBOS = new Set([
  'se', 'le', 'llevo', 'lleva', 'compro', 'compra', 'pidio', 'pide', 'debe', 'quedo', 'queda',
  'comio', 'tomo', 'saco', 'fio', 'fiaron', 'pago', 'es', 'son', 'fue',
])

/** Lo que se compra en la cocina: marca dónde termina el nombre de una persona nueva. */
const COMIDAS = new Set([
  'almuerzo', 'almuerzos', 'desayuno', 'desayunos', 'tinto', 'tintos', 'cafe', 'cafes', 'perico',
  'empanada', 'empanadas', 'jugo', 'jugos', 'gaseosa', 'gaseosas', 'bandeja', 'arepa', 'arepas',
  'pan', 'panes', 'sopa', 'fruta', 'frutas', 'agua', 'aguas', 'chocolate', 'huevo', 'huevos',
  'galleta', 'galletas', 'mecato', 'onces', 'cena', 'comida', 'porcion', 'pastel', 'pasteles',
  'torta', 'dulce', 'dulces', 'paquete', 'papas', 'chicharron', 'buñuelo', 'bunuelo', 'bunuelos',
  'pandebono', 'pandebonos', 'pandeyuca', 'avena', 'aromatica', 'milo', 'leche', 'salchipapa',
  'hamburguesa', 'perro', 'sandwich', 'yogur', 'yogurt', 'colombiana', 'cerveza', 'corrientazo',
  'ejecutivo', 'menu', 'postre', 'sancocho', 'caldo', 'changua', 'tamal', 'tamales',
])

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
// "12 y medio" = 12.500
const MEDIO = new Set(['medio', 'media'])

function esNumero(norma: string): boolean {
  return /^\d[\d.,]*$/.test(norma) || norma in UNIDADES || MILES.has(norma) || MILLONES.has(norma)
}

/** "10.000" -> 10000; "2.5" o "2,5" -> 2.5 */
function leerCifra(texto: string): number {
  if (/^\d+[.,]\d{1,2}$/.test(texto)) return Number(texto.replace(',', '.'))
  return Number(texto.replace(/[.,]/g, ''))
}

function valorDeNumeros(palabras: Palabra[]): number {
  let total = 0
  let actual = 0
  let conMiles = false
  for (const p of palabras) {
    if (MILLONES.has(p.norma)) {
      total += (actual || 1) * 1_000_000
      actual = 0
      conMiles = true
    } else if (MILES.has(p.norma)) {
      total += (actual || 1) * 1000
      actual = 0
      conMiles = true
    } else if (MEDIO.has(p.norma)) {
      actual += 0.5
    } else if (p.norma in UNIDADES) {
      actual += UNIDADES[p.norma]
    } else {
      actual += leerCifra(p.norma)
    }
  }
  const valor = total + actual
  // Nada de la cocina cuesta menos de 100 pesos: "Carlos 12" es 12 mil.
  return Math.round(!conMiles && valor < 100 ? valor * 1000 : valor)
}

/** "dos almuerzos", "un tinto": es cuántos, no cuánto cuesta. */
function esCantidad(grupo: Palabra[], siguiente: Palabra | undefined): boolean {
  return (
    grupo.length === 1 &&
    (UNIDADES[grupo[0].norma] ?? 99) < 10 &&
    siguiente !== undefined &&
    !esNumero(siguiente.norma) &&
    !MEDIO.has(siguiente.norma) &&
    siguiente.norma !== 'pesos'
  )
}

// Lectura por partes ---------------------------------------------------------
// Cada parte marca las palabras que usó; las demás quedan para las siguientes.

class Frase {
  readonly palabras: Palabra[]
  private readonly usada: boolean[]

  constructor(texto: string) {
    this.palabras = separar(texto)
    this.usada = this.palabras.map(() => false)
  }

  /** Posiciones de las palabras que todavía no se usaron, en orden. */
  libres(): number[] {
    return this.palabras.map((_, i) => i).filter((i) => !this.usada[i])
  }

  norma(i: number): string {
    return this.palabras[i].norma
  }

  /** Marca las palabras y, antes de ellas, conectores como "de" o "a". */
  usar(posiciones: number[], conectoresAntes: Set<string> = new Set()) {
    for (const i of posiciones) this.usada[i] = true
    const libres = this.libres()
    let k = libres.filter((i) => i < posiciones[0]).length - 1
    while (k >= 0 && conectoresAntes.has(this.norma(libres[k]))) {
      this.usada[libres[k]] = true
      k--
    }
  }
}

// Día ------------------------------------------------------------------------

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
}
const ANTES_DE_DIA = new Set(['el', 'del', 'de', 'lo', 'este', 'ese', 'en', 'para', 'fue', 'es'])

/** "ayer", "antier", "el martes", "el día 15". */
function leerDia(frase: Frase, hoy: string): string | null {
  const libres = frase.libres()
  for (let k = 0; k < libres.length; k++) {
    const w = frase.norma(libres[k])
    const anterior = k > 0 ? frase.norma(libres[k - 1]) : ''
    const siguiente = k + 1 < libres.length ? frase.norma(libres[k + 1]) : ''
    let atras: number | null = null
    let usadas = [libres[k]]

    if (w === 'hoy') atras = 0
    else if (w === 'antier' || w === 'anteayer' || w === 'antiayer') atras = 2
    else if (w === 'ayer') {
      // "antes de ayer"
      if (anterior === 'de' && k > 1 && frase.norma(libres[k - 2]) === 'antes') {
        atras = 2
        usadas = [libres[k - 2], libres[k - 1], libres[k]]
      } else atras = 1
    } else if (w in DIAS_SEMANA) {
      // "Domingo" también es un nombre: el día se dice "el domingo".
      const esDia = ANTES_DE_DIA.has(anterior) || siguiente === 'pasado' || (k === 0 && w !== 'domingo')
      if (esDia) {
        // "el viernes" dicho un viernes es el de la semana pasada.
        atras = (diaDeLaSemana(hoy) - DIAS_SEMANA[w] + 7) % 7 || 7
        if (siguiente === 'pasado') usadas.push(libres[k + 1])
      }
    } else if (w === 'dia' && /^\d{1,2}$/.test(siguiente)) {
      // "el día 15": el 15 más reciente.
      const numero = Number(siguiente)
      const hoyNumero = Number(hoy.slice(8, 10))
      let fecha = `${hoy.slice(0, 8)}${siguiente.padStart(2, '0')}`
      if (numero > hoyNumero) {
        const mesAnterior = sumarDias(`${hoy.slice(0, 8)}01`, -1)
        fecha = `${mesAnterior.slice(0, 8)}${siguiente.padStart(2, '0')}`
      }
      // sumarDias(x, 0) convierte un "31 de septiembre", que no existe, en otro día.
      if (numero >= 1 && sumarDias(fecha, 0) === fecha) {
        atras = diasEntre(fecha, hoy)
        usadas.push(libres[k + 1])
      }
    }

    if (atras !== null && atras >= 0 && atras <= DIAS_ATRAS_PERMITIDOS) {
      frase.usar(usadas, ANTES_DE_DIA)
      return sumarDias(hoy, -atras)
    }
  }
  return null
}

// Departamento ---------------------------------------------------------------

function seParecenDepartamentos(dicho: string, forma: string): boolean {
  if (dicho === forma) return true
  // "compra" es un verbo, no el departamento "Compras".
  if (!puedeSerNombre(dicho)) return false
  // "Pruebas" por "Prueba", "Bodegas" por "Bodega".
  if (forma.length >= 4 && dicho.replace(/e?s$/, '') === forma.replace(/e?s$/, '')) return true
  // Una letra mal oída en nombres largos: "Mantenimento".
  return forma.length >= 6 && dicho.length >= 6 && distancia(dicho, forma) <= 1
}

function leerDepartamento(
  frase: Frase,
  departamentos: DepartamentoDictado[],
): { departamento: DepartamentoDictado; posicion: number } | null {
  const formas = departamentos.flatMap((d) =>
    [d.nombre, ...d.alias].map((f) => ({ clave: compacto(f), departamento: d })).filter((f) => f.clave),
  )
  const libres = frase.libres()
  for (const exacto of [true, false]) {
    let mejor: { inicio: number; fin: number; departamento: DepartamentoDictado } | null = null
    for (let inicio = 0; inicio < libres.length && !mejor; inicio++) {
      // Hasta 5 palabras: "te de hache", "recursos humanos", "t d h".
      for (let fin = inicio + 1; fin <= Math.min(libres.length, inicio + 5); fin++) {
        const junto = libres.slice(inicio, fin).map((i) => compacto(frase.palabras[i].original)).join('')
        const forma = formas.find((f) => (exacto ? f.clave === junto : seParecenDepartamentos(junto, f.clave)))
        if (forma && (!mejor || fin - inicio > mejor.fin - mejor.inicio)) {
          mejor = { inicio, fin, departamento: forma.departamento }
        }
      }
    }
    if (mejor) {
      const posiciones = libres.slice(mejor.inicio, mejor.fin)
      frase.usar(posiciones, new Set(['de', 'del', 'en']))
      return { departamento: mejor.departamento, posicion: posiciones[0] }
    }
  }
  return null
}

// Valor ----------------------------------------------------------------------

const ANTES_DE_VALOR = new Set(['a', 'por', 'en', 'de', 'vale', 'valor', 'son', 'x', 'y', 'debe', 'queda', 'quedo', 'fue', 'es'])

/** El último grupo de palabras que forma un precio. */
function buscarValor(frase: Frase): { posiciones: number[]; valor: number } | null {
  const libres = frase.libres()
  let encontrado: { posiciones: number[]; valor: number } | null = null
  let k = 0
  while (k < libres.length) {
    if (!esNumero(frase.norma(libres[k]))) {
      k++
      continue
    }
    let fin = k + 1
    // "treinta y cinco mil", "12 y medio": la "y" solo cuenta si sigue un número.
    // "20 dos almuerzos": el "dos" ya es de otro grupo.
    const empiezaCantidad = (j: number) =>
      esCantidad([frase.palabras[libres[j]]], j + 1 < libres.length ? frase.palabras[libres[j + 1]] : undefined)
    while (
      fin < libres.length &&
      !empiezaCantidad(fin) &&
      (esNumero(frase.norma(libres[fin])) ||
        (frase.norma(libres[fin]) === 'y' &&
          fin + 1 < libres.length &&
          (esNumero(frase.norma(libres[fin + 1])) || MEDIO.has(frase.norma(libres[fin + 1])))) ||
        (MEDIO.has(frase.norma(libres[fin])) && frase.norma(libres[fin - 1]) === 'y'))
    ) {
      fin++
    }
    const posiciones = libres.slice(k, fin)
    const numeros = posiciones.map((i) => frase.palabras[i]).filter((p) => p.norma !== 'y')
    const siguiente = fin < libres.length ? frase.palabras[libres[fin]] : undefined
    if (!esCantidad(numeros, siguiente)) {
      const valor = valorDeNumeros(numeros)
      if (valor > 0) encontrado = { posiciones, valor }
    }
    k = fin
  }
  return encontrado
}

function leerValor(frase: Frase): number | null {
  const encontrado = buscarValor(frase)
  if (!encontrado) return null
  const { posiciones } = encontrado
  // "12 mil pesos"
  const libres = frase.libres()
  const despues = libres[libres.indexOf(posiciones[posiciones.length - 1]) + 1]
  if (despues !== undefined && /^pesos?$/.test(frase.norma(despues))) posiciones.push(despues)
  frase.usar(posiciones, ANTES_DE_VALOR)
  return encontrado.valor
}

// Persona --------------------------------------------------------------------

interface Encontradas {
  candidatas: Persona[]
  /** Las que coinciden con el nombre completo. */
  completas: Persona[]
  posiciones: number[]
}

/** Busca en la frase el nombre (o el comienzo del nombre) de personas conocidas. */
function buscarConocidas(frase: Frase, personas: Persona[]): Encontradas | null {
  const libres = frase.libres()
  const dichas = libres.map((i) => normalizarNombre(frase.palabras[i].original))
  let mejor = 0
  let resultado: Encontradas | null = null

  for (const persona of personas) {
    const nombre = normalizarNombre(persona.nombre).split(' ').filter(Boolean)
    for (let inicio = 0; inicio < dichas.length; inicio++) {
      let largo = 0
      while (largo < nombre.length && dichas[inicio + largo] === nombre[largo]) largo++
      if (largo === 0 || largo < mejor) continue
      const completa = largo === nombre.length
      if (largo > mejor) {
        mejor = largo
        resultado = { candidatas: [], completas: [], posiciones: libres.slice(inicio, inicio + largo) }
      }
      if (!resultado!.candidatas.includes(persona)) {
        resultado!.candidatas.push(persona)
        if (completa) resultado!.completas.push(persona)
      }
      break
    }
  }
  return resultado
}

/** Una palabra que podría ser parte de un nombre: no es muletilla, verbo, comida ni número. */
function puedeSerNombre(w: string): boolean {
  return !MULETILLAS.has(w) && !VERBOS.has(w) && !COMIDAS.has(w) && !esNumero(w) && w !== 'de' && w !== 'del'
}

function leerPersona(
  frase: Frase,
  personas: Persona[],
  departamentoId: number | null,
): { persona: Persona | null; candidatas: Persona[] } | null {
  const activas = personas.filter((p) => p.activo)
  // Primero en el departamento dicho; si ahí no hay nadie parecido, puede que
  // la persona se haya cambiado de departamento: se busca en todos.
  const grupos = departamentoId === null ? [activas] : [activas.filter((p) => p.departamento_id === departamentoId), activas]
  for (const grupo of grupos) {
    const encontradas = buscarConocidas(frase, grupo)
    if (!encontradas) continue
    const { candidatas, completas, posiciones } = encontradas
    const orden = (a: Persona, b: Persona) => a.nombre.localeCompare(b.nombre, 'es')

    // Encontrada en otro departamento del que se dijo: mejor preguntar.
    const otroDepartamento = departamentoId !== null && grupo === activas
    let persona: Persona | null = null
    if (otroDepartamento) persona = null
    // "Juan" cuando existen "Juan" y "Juan Pérez": es Juan.
    else if (completas.length === 1) persona = completas[0]
    else if (candidatas.length === 1) {
      // Solo el primer nombre ("Carlos 12") y hay un solo Carlos. Si después
      // viene otra palabra que podría ser un apellido ("Carlos Ruiz"), mejor
      // preguntar: puede ser alguien nuevo.
      const libres = frase.libres()
      const siguiente = libres[libres.indexOf(posiciones[posiciones.length - 1]) + 1]
      if (siguiente === undefined || !puedeSerNombre(frase.norma(siguiente))) persona = candidatas[0]
    }

    // Si hay que preguntar, las palabras se dejan: pueden ser el nombre de alguien nuevo.
    if (persona) frase.usar(posiciones, new Set(['a', 'para', 'al']))
    return { persona, candidatas: persona ? [] : [...candidatas].sort(orden) }
  }
  return null
}

/** Dónde termina el nombre de una persona nueva. */
function terminaNombre(w: string): boolean {
  return VERBOS.has(w) || COMIDAS.has(w) || w in UNIDADES || w === 'para' || w === 'y' || w === 'con'
}

/** El nombre de alguien que no está en la lista, según dónde está en la frase. */
function leerNombreNuevo(frase: Frase, posicionDepartamento: number | null): number[] {
  const libres = frase.libres()
  let inicio = 0
  while (inicio < libres.length && MULETILLAS.has(frase.norma(libres[inicio]))) inicio++

  // "un tinto para Carlos Gómez"
  const para = libres.findIndex((i, k) => k >= inicio && frase.norma(i) === 'para')
  if (para >= 0) inicio = para + 1
  else if (posicionDepartamento !== null) {
    // "Carlos Gómez de Bodega un almuerzo": lo de antes del departamento.
    const antes = libres.filter((i, k) => k >= inicio && i < posicionDepartamento)
    if (antes.length > 0) return antes
  }

  const nombre: number[] = []
  for (let k = inicio; k < libres.length && nombre.length < 4; k++) {
    const w = frase.norma(libres[k])
    if (terminaNombre(w) || (nombre.length > 0 && w === 'de')) break
    if (nombre.length === 0 && (w === 'el' || w === 'la' || w === 'don' || w === 'dona' || w === 'a')) continue
    nombre.push(libres[k])
  }
  return nombre
}

// Lo que compró --------------------------------------------------------------

const SOBRA_AL_INICIO = new Set([...MULETILLAS, ...VERBOS, 'de', 'del', 'con'])
const SOBRA_AL_FINAL = new Set([...ANTES_DE_VALOR, 'para', 'que', 'le', 'se', 'con', 'el', 'la'])

/** Lo que quedó sin usar, sin muletillas ni conectores en los extremos. */
function trozo(palabras: Palabra[]): string {
  let a = 0
  let b = palabras.length
  while (a < b && SOBRA_AL_INICIO.has(palabras[a].norma)) a++
  while (b > a && SOBRA_AL_FINAL.has(palabras[b - 1].norma)) b--
  return palabras
    .slice(a, b)
    .map((p) => p.original)
    .join(' ')
}

// Anular ---------------------------------------------------------------------

function pideAnular(frase: Frase): boolean {
  return frase.palabras.some(
    (p) =>
      /^(borr|anul|elimin)/.test(p.norma) ||
      ['quita', 'quitala', 'quitalo', 'quitar', 'cancela', 'cancelala', 'cancelalo', 'cancelar'].includes(p.norma),
  )
}

// Principal ------------------------------------------------------------------

export function leerDictado(
  texto: string,
  departamentos: DepartamentoDictado[],
  personas: Persona[] = [],
  hoy: string = hoyBogota(),
): Lectura {
  const frase = new Frase(texto)

  // "Te equivocaste en la última, bórrala". Si dice un precio, es una compra.
  if (pideAnular(frase) && !buscarValor(frase)) return { tipo: 'anular' }

  const fecha = leerDia(frase, hoy)
  const depto = leerDepartamento(frase, departamentos)
  const valor = leerValor(frase)
  const encontrada = leerPersona(frase, personas, depto?.departamento.id ?? null)

  let nombre = encontrada?.persona?.nombre ?? ''
  if (!encontrada?.persona) {
    const posiciones = leerNombreNuevo(frase, depto?.posicion ?? null)
    nombre = posiciones.map((i) => frase.palabras[i].original).join(' ')
    frase.usar(posiciones)
  }

  // Lo que sobra es lo que compró. Si el nombre estaba en medio ("un tinto
  // para Carlos, con pan"), los dos lados se limpian por separado.
  const sobra: Palabra[][] = [[]]
  let anterior = -1
  for (const i of frase.libres()) {
    if (anterior >= 0 && i !== anterior + 1) sobra.push([])
    sobra[sobra.length - 1].push(frase.palabras[i])
    anterior = i
  }
  const descripcion = sobra.map(trozo).filter(Boolean).join(' ')

  return {
    tipo: 'compra',
    persona: encontrada?.persona ?? null,
    candidatas: encontrada?.candidatas ?? [],
    nombre,
    departamentoId: depto?.departamento.id ?? null,
    departamento: depto?.departamento.nombre ?? null,
    descripcion,
    valor,
    fecha,
  }
}
