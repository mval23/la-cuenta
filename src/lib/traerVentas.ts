import { supabase } from './supabase'
import type { CompraVendida } from './ventas'

// La base entrega como mucho mil filas por consulta.
const POR_PAGINA = 1000

/** Las compras no anuladas desde `desde` (y hasta `hasta`, si se da), de mil en mil. */
export async function traerVentas(desde: string, hasta?: string): Promise<CompraVendida[] | null> {
  const todas: CompraVendida[] = []
  for (let pagina = 0; ; pagina++) {
    let consulta = supabase.from('compras').select('fecha, valor_pesos').eq('anulada', false).gte('fecha', desde)
    if (hasta) consulta = consulta.lte('fecha', hasta)
    const { data, error } = await consulta.order('id').range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)
    if (error) return null
    todas.push(...data)
    if (data.length < POR_PAGINA) return todas
  }
}
