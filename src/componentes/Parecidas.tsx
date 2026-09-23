import { parecidas } from '../lib/personas'
import type { Persona } from '../lib/tipos'

/**
 * Antes de crear a alguien nuevo: las que ya existen y suenan parecido
 * ("Reibi" cuando ya está Raybin). Con `onElegir` se pueden tocar para usarlas.
 */
export function Parecidas({
  nombre,
  personas,
  nombreDepto,
  onElegir,
}: {
  nombre: string
  personas: Persona[]
  nombreDepto: (id: number) => string
  onElegir?: (p: Persona) => void
}) {
  const encontradas = parecidas(nombre, personas)
  if (encontradas.length === 0) return null
  const MAXIMO = 5

  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl bg-aviso-suave p-4">
      <p className="text-lg font-semibold">
        {onElegir ? '¿Es alguna de estas? Ya existen y suenan parecido:' : 'Ya hay alguien que suena parecido:'}
      </p>
      {encontradas.slice(0, MAXIMO).map((p) =>
        onElegir ? (
          <button
            key={p.id}
            type="button"
            onClick={() => onElegir(p)}
            className="min-h-14 rounded-xl border border-control bg-superficie px-4 text-left text-xl active:bg-hundido"
          >
            <span className="font-semibold">{p.nombre}</span>{' '}
            <span className="font-semibold text-tinta-suave">· {nombreDepto(p.departamento_id)}</span>
          </button>
        ) : (
          <p key={p.id} className="text-lg">
            <span className="font-semibold">{p.nombre}</span>{' '}
            <span className="text-tinta-suave">· {nombreDepto(p.departamento_id)}</span>
          </p>
        ),
      )}
      <p className="text-base text-aviso">
        {onElegir ? 'Si no es ninguna, sigue: se crea la persona nueva.' : 'Si es otra persona, agrégala igual.'}
      </p>
    </div>
  )
}
