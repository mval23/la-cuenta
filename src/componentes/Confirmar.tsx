import type { ReactNode } from 'react'
import { Boton } from './Boton'

type Tono = 'peligro' | 'aviso' | 'marca'

const fondos: Record<Tono, string> = {
  peligro: 'bg-peligro-suave',
  aviso: 'bg-aviso-suave',
  marca: 'bg-marca-suave',
}

/**
 * La pregunta antes de algo que cuesta deshacer o que mueve plata:
 * "¿Anular esta compra? [No] [Sí, anular]". Siempre igual en toda la app:
 * - El "sí" dice el verbo ("Sí, anular", "Sí, pagó"); el "no" va a la izquierda.
 * - Rojo (`peligro`) solo para anular o archivar; `aviso` para lo que no se
 *   puede deshacer o hace perder algo; `marca` para plata que entra.
 * - `renglon` va pegada a un renglón de una lista; `tarjeta`, suelta.
 * - Con `detalle` o `children`, la pregunta hace de título y lo demás explica.
 */
export function Confirmar({
  pregunta,
  detalle,
  children,
  textoSi,
  textoNo = 'No',
  onSi,
  onNo,
  tono = 'peligro',
  forma = 'renglon',
  ocupado = false,
  textoOcupado,
  className = '',
}: {
  pregunta: ReactNode
  detalle?: ReactNode
  children?: ReactNode
  textoSi: string
  textoNo?: string
  onSi: () => void
  onNo: () => void
  tono?: Tono
  forma?: 'renglon' | 'tarjeta'
  /** Mientras se guarda: los dos botones quietos y el "sí" dice `textoOcupado`. */
  ocupado?: boolean
  textoOcupado?: string
  className?: string
}) {
  const conExplicacion = detalle !== undefined || children !== undefined
  const botones = (
    <div className="flex flex-wrap justify-end gap-3">
      <Boton variante="secundario" compacto disabled={ocupado} onClick={onNo}>
        {textoNo}
      </Boton>
      <Boton variante={tono === 'peligro' ? 'peligro' : 'principal'} compacto disabled={ocupado} onClick={onSi}>
        {ocupado && textoOcupado ? textoOcupado : textoSi}
      </Boton>
    </div>
  )
  const marco = `${fondos[tono]} ${forma === 'tarjeta' ? 'rounded-xl p-4' : 'px-4 py-3'} ${className}`

  if (!conExplicacion) {
    return (
      <div role="alert" className={`flex flex-wrap items-center justify-end gap-x-4 gap-y-2 ${marco}`}>
        <p className="mr-auto text-lg">{pregunta}</p>
        {botones}
      </div>
    )
  }

  return (
    <div role="alert" className={`flex flex-col gap-3 ${marco}`}>
      <p className="text-xl font-semibold">{pregunta}</p>
      {detalle !== undefined && <p className="text-lg">{detalle}</p>}
      {children}
      {botones}
    </div>
  )
}
