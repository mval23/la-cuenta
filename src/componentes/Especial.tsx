import { Boton } from './Boton'

/*
 * Almuerzos especiales. Una compra siempre empieza normal: lo especial se
 * marca a propósito con el botón, y entonces aparece la franja con "Quitar".
 */

export function BotonEspecial({ onClick }: { onClick: () => void }) {
  return (
    <Boton variante="texto" compacto onClick={onClick}>
      + Es almuerzo especial
    </Boton>
  )
}

export function FranjaEspecial({ onQuitar }: { onQuitar: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-especial bg-especial-suave px-4 py-3">
      <p className="min-w-0 flex-1 text-xl font-bold text-especial">
        Almuerzo especial
        <span className="block text-base font-normal">Sale aparte en su cuenta y en Ventas</span>
      </p>
      <Boton variante="secundario" compacto onClick={onQuitar}>
        Quitar
      </Boton>
    </div>
  )
}

/** La marca en las listas: "Especial". */
export function EtiquetaEspecial() {
  return (
    <span className="mr-1.5 inline-block rounded-full bg-especial-suave px-2.5 text-base font-bold text-especial">
      Especial
    </span>
  )
}
