import type { ReactNode } from 'react'
import { LARGO_PIN } from '../lib/candado'

const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const estiloTecla =
  'min-h-16 rounded-xl border border-control bg-superficie text-2xl font-semibold tabular-nums active:bg-hundido disabled:text-tinta-tenue'

/** Los puntos del PIN y el teclado de números, como el del iPad. */
export function TecladoPin({
  titulo,
  pin,
  onPin,
  mensaje,
  deshabilitado = false,
  izquierda,
}: {
  titulo: string
  pin: string
  /** Se llama con cada número; al llegar a LARGO_PIN, el PIN está completo. */
  onPin: (pin: string) => void
  /** Error o estado debajo de los puntos. */
  mensaje?: ReactNode
  deshabilitado?: boolean
  /** Botón opcional en la esquina inferior izquierda, como "Volver". */
  izquierda?: { texto: string; onClick: () => void }
}) {
  function tocar(digito: string) {
    if (!deshabilitado && pin.length < LARGO_PIN) onPin(pin + digito)
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-center text-xl font-semibold">{titulo}</p>

      <div className="flex justify-center gap-4" aria-label={`${pin.length} de ${LARGO_PIN} números`}>
        {Array.from({ length: LARGO_PIN }, (_, i) => (
          <span key={i} className={`h-6 w-6 rounded-full border-2 border-marca ${i < pin.length ? 'bg-marca' : ''}`} />
        ))}
      </div>

      <div className="min-h-7 text-center text-lg" role="alert">
        {mensaje}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {teclas.map((t) => (
          <button key={t} type="button" onClick={() => tocar(t)} disabled={deshabilitado} className={estiloTecla}>
            {t}
          </button>
        ))}
        {izquierda ? (
          <button type="button" onClick={izquierda.onClick} disabled={deshabilitado} className={`${estiloTecla} text-lg`}>
            {izquierda.texto}
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => tocar('0')} disabled={deshabilitado} className={estiloTecla}>
          0
        </button>
        <button
          type="button"
          onClick={() => onPin(pin.slice(0, -1))}
          disabled={deshabilitado || pin === ''}
          className={`${estiloTecla} text-lg`}
        >
          Borrar
        </button>
      </div>
    </div>
  )
}
