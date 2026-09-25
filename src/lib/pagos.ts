import type { DatosAviso } from '../componentes/useAviso'
import { formatearPesos } from './pesos'
import { supabase } from './supabase'
import type { Saldo } from './tipos'

export type TipoDePago = 'total' | 'abono'

/** Guarda el pago y avisa con Deshacer. Devuelve si se guardó. */
export async function guardarPago({
  saldo: s,
  valor,
  tipo,
  mostrar,
  alGuardar,
  recargar,
}: {
  saldo: Saldo
  valor: number
  tipo: TipoDePago
  mostrar: (aviso: DatosAviso) => void
  /** Antes de recargar: por ejemplo, dejar a la persona en la lista aunque quede al día. */
  alGuardar?: () => void
  /** Vuelve a traer lo que se ve, después de guardar y de deshacer. */
  recargar: () => Promise<unknown>
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('pagos')
    .insert({ persona_id: s.persona_id, valor_pesos: valor, tipo })
    .select('id')
    .single()
  if (error) {
    mostrar({ tipo: 'error', texto: 'No se pudo guardar el pago. Revisa el internet e intenta otra vez.' })
    return false
  }
  alGuardar?.()
  mostrar({
    tipo: 'ok',
    texto: `${tipo === 'total' ? 'Pago' : 'Abono'} guardado: ${s.nombre}, ${formatearPesos(valor)}`,
    deshacer: async () => {
      const { error } = await supabase.from('pagos').update({ anulado: true }).eq('id', data.id)
      if (error) mostrar({ tipo: 'error', texto: 'No se pudo deshacer. Revisa el internet.' })
      else mostrar({ tipo: 'ok', texto: `Se deshizo el ${tipo === 'total' ? 'pago' : 'abono'} de ${s.nombre}.` })
      await recargar()
    },
  })
  await recargar()
  return true
}
