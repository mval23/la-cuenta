// Pasa la explicación de una cuenta de cobro ("el 2 de agosto dos almuerzos
// para la doctora Lucy, 62 mil...") a filas, en el servidor (api/cuenta-de-cobro.ts).

import type { FilaDeCobro } from './pdf'
import { supabase } from './supabase'
import { ErrorDeVoz } from './voz'

export interface CuentaDictada {
  cliente: { nombre: string | null; nit: string | null }
  concepto: string | null
  filas: FilaDeCobro[]
}

/** `contexto`: lo que ya se había dictado, para entender "el 26" o "lo mismo". */
export async function entenderCuenta(texto: string, contexto: string): Promise<CuentaDictada> {
  const { data } = await supabase.auth.getSession()
  const r = await fetch('/api/cuenta-de-cobro', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${data.session?.access_token ?? ''}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ texto, contexto }),
  }).catch(() => null)

  if (!r) throw new ErrorDeVoz('Sin conexión. Revisa el internet e intenta otra vez.')
  if (r.status === 429) throw new ErrorDeVoz('Se usó mucho la voz por hoy. Agrega las filas a mano.')
  if (r.status === 413) throw new ErrorDeVoz('Es mucho para una sola vez. Explica la cuenta en partes más cortas.')
  if (!r.ok) throw new ErrorDeVoz('No se pudo entender la cuenta. Intenta de nuevo o agrega las filas a mano.')
  return (await r.json()) as CuentaDictada
}
