/*
 * Estilos compartidos. Reglas de la app (ver también Boton.tsx e index.css):
 * - Todo campo lleva una etiqueta visible encima; el texto de ejemplo
 *   (placeholder) no la reemplaza, porque desaparece al escribir.
 * - Los errores de un campo van debajo de él (MensajeDeError), no en el aviso
 *   flotante, que queda para fallas de internet y para confirmar lo guardado.
 */

/** Campos de texto y listas desplegables: 51px de alto como mínimo. */
export const campo =
  'min-h-12 w-full rounded-xl border border-control bg-superficie px-4 text-lg placeholder:text-tinta-tenue'

/** La etiqueta encima de un campo: "Cuánto", "Nombre y apellido". */
export const etiqueta = 'text-base font-semibold text-tinta-suave'
