import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { claveDesdePin, LARGO_PIN, leerUsuarias, type Usuaria } from '../lib/usuarias'

const usuarias = leerUsuarias(import.meta.env.VITE_USUARIAS)

export function Login() {
  const [elegida, setElegida] = useState<Usuaria | null>(null)

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-6">
      <img src="/logo.svg" alt="" className="mx-auto mb-3 h-16 w-16" />
      <h1 className="mb-6 text-center text-3xl font-bold">La Cuenta</h1>
      {elegida ? (
        <Pin usuaria={elegida} volver={() => setElegida(null)} />
      ) : (
        <Elegir elegir={setElegida} />
      )}
    </div>
  )
}

function Elegir({ elegir }: { elegir: (u: Usuaria) => void }) {
  if (usuarias.length === 0) {
    return (
      <p className="text-center text-lg text-peligro">
        Falta configurar VITE_USUARIAS. Revisa .env.example.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xl font-semibold">¿Quién va a entrar?</p>
      {usuarias.map((u) => (
        <button
          key={u.correo}
          type="button"
          onClick={() => elegir(u)}
          className="min-h-14 rounded-xl bg-marca text-xl font-semibold text-white active:bg-marca-oscura"
        >
          {u.nombre}
        </button>
      ))}
    </div>
  )
}

function Pin({ usuaria, volver }: { usuaria: Usuaria; volver: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  async function entrar(completo: string) {
    setEntrando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: usuaria.correo,
      password: claveDesdePin(completo),
    })
    // Si entra, App cambia de pantalla sola.
    if (error) {
      setError(
        error.code === 'invalid_credentials'
          ? 'Ese PIN no es. Intenta otra vez.'
          : 'No se pudo entrar. Revisa el internet e intenta otra vez.',
      )
      setPin('')
      setEntrando(false)
    }
  }

  function tocar(digito: string) {
    if (entrando || pin.length >= LARGO_PIN) return
    setError(null)
    const nuevo = pin + digito
    setPin(nuevo)
    if (nuevo.length === LARGO_PIN) void entrar(nuevo)
  }

  function borrar() {
    if (!entrando) setPin(pin.slice(0, -1))
  }

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  const estiloTecla =
    'min-h-16 rounded-xl border border-control bg-superficie text-2xl font-semibold tabular-nums active:bg-hundido disabled:text-tinta-tenue'

  return (
    <div className="flex flex-col gap-5">
      <p className="text-center text-xl font-semibold">Hola, {usuaria.nombre}. Escribe tu PIN</p>

      <div className="flex justify-center gap-4" aria-label={`${pin.length} de ${LARGO_PIN} dígitos`}>
        {Array.from({ length: LARGO_PIN }, (_, i) => (
          <span
            key={i}
            className={`h-6 w-6 rounded-full border-2 border-marca ${
              i < pin.length ? 'bg-marca' : ''
            }`}
          />
        ))}
      </div>

      <p className="min-h-7 text-center text-lg text-peligro" role="alert">
        {entrando ? <span className="text-tinta-suave">Entrando...</span> : error}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {teclas.map((t) => (
          <button key={t} type="button" onClick={() => tocar(t)} disabled={entrando} className={estiloTecla}>
            {t}
          </button>
        ))}
        <button type="button" onClick={volver} disabled={entrando} className={`${estiloTecla} text-lg`}>
          Volver
        </button>
        <button type="button" onClick={() => tocar('0')} disabled={entrando} className={estiloTecla}>
          0
        </button>
        <button type="button" onClick={borrar} disabled={entrando} className={`${estiloTecla} text-lg`}>
          Borrar
        </button>
      </div>
    </div>
  )
}
