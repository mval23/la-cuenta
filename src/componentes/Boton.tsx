import type { ButtonHTMLAttributes } from 'react'

type Variante = 'principal' | 'secundario' | 'peligro'

const estilos: Record<Variante, string> = {
  principal: 'bg-amber-800 text-white active:bg-amber-900 disabled:bg-stone-400',
  secundario:
    'bg-white text-stone-900 border-2 border-stone-300 active:bg-stone-100 disabled:text-stone-400',
  peligro: 'bg-white text-red-800 border-2 border-red-300 active:bg-red-50',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
}

export function Boton({ variante = 'principal', className = '', ...props }: Props) {
  return (
    <button
      type="button"
      className={`min-h-14 rounded-2xl px-6 font-semibold ${estilos[variante]} ${className}`}
      {...props}
    />
  )
}
