import { useState } from 'react'
import { Boton } from './Boton'

/** Cuando algo no carga: qué pasó y un botón para volver a intentar. */
export function ErrorDeCarga({ texto, onReintentar }: { texto: string; onReintentar: () => Promise<unknown> }) {
  const [intentando, setIntentando] = useState(false)

  async function reintentar() {
    setIntentando(true)
    await onReintentar()
    setIntentando(false)
  }

  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl bg-red-50 p-4">
      <p className="text-lg text-red-800">{texto}</p>
      <Boton variante="secundario" onClick={reintentar} disabled={intentando}>
        {intentando ? 'Intentando...' : 'Intentar de nuevo'}
      </Boton>
    </div>
  )
}
