import type { ButtonHTMLAttributes } from 'react'

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
