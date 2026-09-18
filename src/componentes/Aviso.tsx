import { useState } from 'react'
import type { DatosAviso } from './useAviso'

/**
 * Aviso flotante justo encima de las pestañas, para que se vea aunque la
 * lista esté desplazada.
 */
export function Aviso({ aviso, onCerrar }: { aviso: DatosAviso | null; onCerrar: () => void }) {
  const [deshaciendo, setDeshaciendo] = useState(false)

  async function deshacer() {
    if (!aviso?.deshacer || deshaciendo) return
    setDeshaciendo(true)
    await aviso.deshacer()
    setDeshaciendo(false)
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-30 px-4"
      style={{ bottom: 'calc(var(--alto-pestanas) + env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      {aviso && (
        <div
          key={aviso.texto}
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-2xl py-2 pr-2 pl-5 shadow-[0_8px_24px_rgb(0_0_0/0.14)] motion-safe:animate-aparecer ${
            aviso.tipo === 'ok' ? 'bg-tinta text-white' : 'bg-peligro text-white'
          }`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 shrink-0 fill-none stroke-current stroke-2">
            {aviso.tipo === 'ok' ? (
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M12 7v6M12 16.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" strokeLinecap="round" />
            )}
          </svg>
          <p className="min-w-0 flex-1 py-2 text-lg">{aviso.texto}</p>
          {aviso.deshacer ? (
            <button
              type="button"
              onClick={deshacer}
              disabled={deshaciendo}
              className="min-h-11 rounded-xl px-4 text-lg font-semibold text-destello active:bg-superficie/10"
            >
              {deshaciendo ? 'Deshaciendo...' : 'Deshacer'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-11 rounded-xl px-4 text-lg font-semibold active:bg-superficie/10"
            >
              Cerrar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
