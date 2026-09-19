// Nombres de personas: cómo se comparan y qué nombres debe esperar oír el
// reconocimiento de voz. Quién es quién en una frase dictada lo decide
// leerDictado, en dictado.ts.

import type { Persona } from './tipos'

/** Minúsculas, sin tildes y con espacios simples. */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nombres y departamentos que el reconocimiento de voz debe esperar oír. */
export function vocabulario(personas: Persona[], departamentos: { nombre: string }[]): string {
  const nombres = new Set(personas.filter((p) => p.activo).map((p) => p.nombre.trim()))
  return [...departamentos.map((d) => d.nombre.trim()), ...nombres].join(', ')
}

// Lo que se dice antes del nombre: "Agrega a...", "Se llama...".
const ANTES_DEL_NOMBRE = new Set([
  'agrega', 'agregar', 'agregue', 'agregale', 'anota', 'anotar', 'anote', 'apunta', 'apuntar', 'registra',
  'registrar', 'pon', 'ponga', 'crea', 'crear', 'se', 'llama', 'es', 'a', 'al', 'la', 'el', 'nueva', 'nuevo',
  'persona', 'ella', 'bueno', 'listo', 'entonces',
])
// Van en minúscula dentro de un nombre: "María de los Ángeles".
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y'])

/** El nombre de una persona nueva a partir de lo dictado: "agrega a carlos gómez." -> "Carlos Gómez". */
export function nombreDictado(texto: string): string {
  const palabras = texto
    .replace(/[.,;:!?¿¡"«»()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  let inicio = 0
  while (inicio < palabras.length - 1 && ANTES_DEL_NOMBRE.has(normalizarNombre(palabras[inicio]))) inicio++
  return palabras
    .slice(inicio)
    .map((p, i) => {
      const minuscula = p.toLocaleLowerCase('es')
      if (i > 0 && PARTICULAS.has(minuscula)) return minuscula
      return minuscula.charAt(0).toLocaleUpperCase('es') + minuscula.slice(1)
    })
    .join(' ')
}
