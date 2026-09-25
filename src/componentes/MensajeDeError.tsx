/**
 * El error justo debajo del campo que hay que corregir, no en el aviso de
 * abajo. El campo lo enlaza con `aria-describedby={id}`.
 */
export function MensajeDeError({ id, texto }: { id: string; texto: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-lg text-peligro">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 fill-none stroke-current stroke-2">
        <path d="M12 7v6M12 16.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" strokeLinecap="round" />
      </svg>
      {texto}
    </p>
  )
}
