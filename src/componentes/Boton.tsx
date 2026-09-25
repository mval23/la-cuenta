import type { ButtonHTMLAttributes } from 'react'

/*
 * Cuándo usar cada una:
 *   principal   la acción del bloque: una sola ("Guardar $12.000", "Entrar").
 *               Dice el verbo, y la cifra si hay plata de por medio.
 *   tintado     la acción más común de una pantalla o renglón ("Pagó todo", "+ Otra compra").
 *   secundario  todo lo demás que haya que encontrar: "Cancelar", "Volver", "Anotar
 *               a mano", "Anular" en un renglón. Tiene borde para que se vea que se toca.
 *   peligro     solo el "Sí" que confirma anular o archivar (ver Confirmar).
 *   texto       solo lo opcional, que se puede ignorar ("+ Anotar qué llevó").
 * Nunca un ícono solo: siempre con palabra.
 */
type Variante = 'principal' | 'tintado' | 'secundario' | 'peligro' | 'texto'

const estilos: Record<Variante, string> = {
  principal: 'bg-marca text-white active:bg-marca-oscura disabled:bg-hundido disabled:text-tinta-tenue',
  tintado: 'bg-marca-suave text-marca-oscura active:bg-marca-suave-oscura disabled:bg-hundido disabled:text-tinta-tenue',
  secundario:
    'bg-superficie text-tinta border border-control active:bg-hundido disabled:text-tinta-tenue',
  peligro: 'bg-superficie text-peligro border border-peligro-linea active:bg-peligro-suave disabled:text-tinta-tenue',
  texto: 'text-marca active:bg-marca-suave disabled:text-tinta-tenue',
}

/** Área táctil de unos 51px; la compacta, de unos 47px, para acciones dentro de filas. */
const tamanos = {
  normal: 'min-h-12 px-5',
  compacto: 'min-h-11 px-4',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  compacto?: boolean
}

export function Boton({ variante = 'principal', compacto = false, className = '', ...props }: Props) {
  return (
    <button
      type="button"
      className={`rounded-xl text-lg font-semibold ${tamanos[compacto ? 'compacto' : 'normal']} ${estilos[variante]} ${className}`}
      {...props}
    />
  )
}

/**
 * "Volver a Cobrar": con borde y flecha, arriba a la izquierda, para que se
 * reconozca como botón y no como texto.
 */
export function BotonVolver({ texto, onClick, className = '' }: { texto: string; onClick: () => void; className?: string }) {
  return (
    <Boton variante="secundario" compacto className={`flex items-center gap-1 self-start pl-2 ${className}`} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 shrink-0 fill-none stroke-current stroke-[2.5]">
        <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {texto}
    </Boton>
  )
}
