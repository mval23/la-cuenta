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

// Nombres que suenan igual o parecido --------------------------------------
// El reconocimiento de voz escribe un nombre como lo oye: "Reibi" por Raybin,
// "Fernay" por Ferney. Antes de crear a alguien nuevo se busca por cómo suena.

/**
 * Cómo suena una palabra en español, para comparar: "Raybin" y "Reibin" dan
 * lo mismo, igual que "Ferney" y "Fernay", "Yohan" y "Johan" no.
 */
export function sonido(palabra: string): string {
  return (
    normalizarNombre(palabra)
      .replace(/[^a-z]/g, '')
      .replace(/(ch|sh)/g, 'C')
      .replace(/ph/g, 'f')
      .replace(/th/g, 't')
      .replace(/ll/g, 'y')
      // "gue", "gui" suenan con g; "ge", "gi" con j.
      .replace(/gu(?=[ei])/g, 'G')
      .replace(/g(?=[ei])/g, 'j')
      .replace(/G/g, 'g')
      .replace(/qu/g, 'k')
      .replace(/c(?=[ei])/g, 's')
      .replace(/c/g, 'k')
      .replace(/z/g, 's')
      .replace(/x/g, 'ks')
      .replace(/h/g, '')
      .replace(/v/g, 'b')
      .replace(/w/g, 'u')
      // La "y" que no va antes de vocal suena "i": "Raybin", "Ferney".
      .replace(/y(?![aeiou])/g, 'i')
      // "ai", "ei" y "e" se confunden al oído: "Fernay" y "Ferney"; y los
      // nombres en inglés se escriben de mil formas: "Jaison" y "Jason".
      .replace(/[ae]i/g, 'e')
      .replace(/(.)\1+/g, '$1')
  )
}

/** Dos palabras que al oído son la misma: "Ferney" y "Fernay". */
export function suenanIgual(a: string, b: string): boolean {
  const sa = sonido(a)
  return sa !== '' && sa === sonido(b)
}

/** Distancia de edición entre dos textos. */
export function distancia(a: string, b: string): number {
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

/** Suenan igual o casi: "Reibi" y "Raybin". En nombres cortos, solo si suenan igual. */
export function suenanParecido(a: string, b: string): boolean {
  const sa = sonido(a)
  const sb = sonido(b)
  if (sa === '' || sb === '') return false
  if (sa === sb) return true
  return Math.min(sa.length, sb.length) >= 4 && distancia(sa, sb) <= 1
}

/** Las personas activas cuyo primer nombre suena como el de `nombre`. */
export function parecidas(nombre: string, personas: Persona[]): Persona[] {
  const primero = normalizarNombre(nombre).split(' ')[0]
  if (!primero) return []
  return personas
    .filter((p) => p.activo && suenanParecido(primero, normalizarNombre(p.nombre).split(' ')[0] ?? ''))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
