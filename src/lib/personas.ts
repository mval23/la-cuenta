// Decide a qué persona se refiere una frase dictada. Si no hay duda, la elige;
// si hay varias posibles, las devuelve para que la usuaria toque la correcta;
// si no hay ninguna, la pantalla ofrece crearla.

import type { Dictado } from './dictado'
import type { Persona } from './tipos'

export interface PersonaResuelta {
  /** La persona elegida sin duda, o null si hay que preguntar. */
  persona: Persona | null
  /** Personas parecidas para elegir cuando no hay una sola. */
  candidatas: Persona[]
  /** La descripción puede perder palabras que resultaron ser parte del nombre. */
  descripcion: string
}

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

function palabras(texto: string): string[] {
  const n = normalizarNombre(texto)
  return n ? n.split(' ') : []
}

/** "juan" se parece a "juan perez" y "juan perez" a "juan": uno empieza con el otro. */
function seParecen(a: string[], b: string[]): boolean {
  const corto = a.length <= b.length ? a : b
  const largo = a.length <= b.length ? b : a
  return corto.length > 0 && corto.every((p, i) => p === largo[i])
}

function igual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i])
}

export function resolverPersona(dictado: Dictado, todas: Persona[]): PersonaResuelta {
  const activas = todas.filter((p) => p.activo)
  const dicho = palabras(dictado.nombre)
  let descripcion = dictado.descripcion

  if (dicho.length === 0) return { persona: null, candidatas: [], descripcion }

  // Sin departamento el lector solo toma la primera palabra como nombre. Si
  // una persona conocida se llama "María José" y la frase dice
  // "María José almuerzo", las palabras que siguen son parte del nombre.
  let nombre = dicho
  if (dictado.departamentoId === null && dicho.length === 1) {
    const siguientes = palabras(descripcion)
    const completa = [...dicho, ...siguientes]
    const larga = activas
      .map((p) => palabras(p.nombre))
      .filter((n) => n.length > 1 && n.length <= completa.length && igual(n, completa.slice(0, n.length)))
      .sort((a, b) => b.length - a.length)[0]
    if (larga) {
      nombre = larga
      // Se quitan de la descripción las palabras que resultaron ser del nombre.
      descripcion = descripcion
        .split(/\s+/)
        .slice(larga.length - 1)
        .join(' ')
    }
  }

  const enDepartamento =
    dictado.departamentoId === null
      ? activas
      : activas.filter((p) => p.departamento_id === dictado.departamentoId)

  const exactas = enDepartamento.filter((p) => igual(palabras(p.nombre), nombre))
  if (exactas.length === 1) return { persona: exactas[0], candidatas: [], descripcion }
  if (exactas.length > 1) return { persona: null, candidatas: exactas, descripcion }

  let parecidas = enDepartamento.filter((p) => seParecen(palabras(p.nombre), nombre))
  // Si en ese departamento no hay nadie parecido, puede que la persona se
  // haya cambiado de departamento: se buscan en todos.
  if (parecidas.length === 0 && dictado.departamentoId !== null) {
    parecidas = activas.filter((p) => seParecen(palabras(p.nombre), nombre))
  }
  return { persona: null, candidatas: parecidas.sort((a, b) => a.nombre.localeCompare(b.nombre)), descripcion }
}

/** Nombres y departamentos que el reconocimiento de voz debe esperar oír. */
export function vocabulario(personas: Persona[], departamentos: { nombre: string }[]): string {
  const nombres = new Set(personas.filter((p) => p.activo).map((p) => p.nombre.trim()))
  return [...departamentos.map((d) => d.nombre.trim()), ...nombres].join(', ')
}
