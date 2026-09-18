import type { ButtonHTMLAttributes } from 'react'

type Variante = 'principal' | 'tintado' | 'secundario' | 'peligro' | 'texto'

const estilos: Record<Variante, string> = {
  principal: 'bg-amber-800 text-white active:bg-amber-900 disabled:bg-stone-200 disabled:text-stone-500',
  tintado: 'bg-amber-100 text-amber-900 active:bg-amber-200 disabled:bg-stone-100 disabled:text-stone-400',
  secundario:
    'bg-white text-stone-900 border border-stone-300 active:bg-stone-100 disabled:text-stone-400',
  peligro: 'bg-white text-red-700 border border-red-200 active:bg-red-50 disabled:text-stone-400',
  texto: 'text-amber-800 active:bg-amber-50 disabled:text-stone-400',
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
