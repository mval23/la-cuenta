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
