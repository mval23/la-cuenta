export interface Usuaria {
  nombre: string
  correo: string
}

/**
 * Lee la lista de usuarias que aparecen en la pantalla de entrada.
 * Formato: "Amparo:correo1,Mariana:correo2".
 */
export function leerUsuarias(texto: string | undefined): Usuaria[] {
  if (!texto) return []
  return texto
    .split(',')
    .map((parte) => {
      const i = parte.indexOf(':')
      if (i === -1) return null
      const nombre = parte.slice(0, i).trim()
      const correo = parte.slice(i + 1).trim()
      return nombre && correo ? { nombre, correo } : null
    })
    .filter((u): u is Usuaria => u !== null)
}

export const LARGO_PIN = 4

/**
 * Supabase exige contraseñas de al menos 6 caracteres, así que el PIN de
 * 4 dígitos se convierte en la contraseña real: el PIN 1234 es "cuenta-1234".
 * Al crear la usuaria en Supabase se le pone esa contraseña.
 */
export function claveDesdePin(pin: string): string {
  return `cuenta-${pin}`
}
