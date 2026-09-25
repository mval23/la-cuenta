import { useState, type FormEvent } from 'react'
import { Boton } from '../componentes/Boton'
import { campo, etiqueta } from '../componentes/estilos'
import { LARGO_PIN, olvidarPin, quedoBloqueado } from '../lib/candado'
import { supabase } from '../lib/supabase'

/**
 * Configurar el dispositivo: se entra una sola vez con el correo y la
 * contraseña larga de la cuenta. Después la sesión queda guardada y la app se
 * abre con el PIN (ver lib/candado.ts).
 */
export function Login() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const [bloqueado] = useState(() => quedoBloqueado(localStorage))

  async function entrar(e: FormEvent) {
    e.preventDefault()
    if (entrando) return
    setEntrando(true)
    setError(null)
    // Antes de entrar: si no, el candado de una sesión anterior (por ejemplo,
    // bloqueado por muchos fallos) aparecería apenas se abra la sesión.
    olvidarPin(localStorage)
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
    // Si entra, App cambia de pantalla sola.
    if (error) {
      setError(
        error.code === 'invalid_credentials'
          ? 'El correo o la contraseña no son. Revísalos e intenta otra vez.'
          : 'No se pudo entrar. Revisa el internet e intenta otra vez.',
      )
      setEntrando(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-6">
      <img src="/logo.svg" alt="" className="mx-auto mb-3 h-16 w-16" />
      <h1 className="text-center text-3xl font-bold">La Cuenta</h1>
      <p className="mb-6 text-center text-xl text-tinta-suave">Configurar este dispositivo</p>

      <form onSubmit={entrar} className="flex flex-col gap-4">
        {bloqueado && (
          <p className="rounded-xl bg-aviso-suave p-4 text-lg" role="status">
            Se cerró la sesión porque el PIN se escribió mal muchas veces. Para volver a entrar hace falta la
            contraseña de la cuenta: la tiene Mariana.
          </p>
        )}
        <p className="text-lg">
          Esto se hace una sola vez. Después, La Cuenta se abre con un PIN de {LARGO_PIN} números.
        </p>
        <label className="flex flex-col gap-2">
          <span className={etiqueta}>Correo de la cuenta</span>
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={etiqueta}>Contraseña</span>
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="current-password"
            required
            className={campo}
          />
        </label>
        <p className="min-h-7 text-lg text-peligro" role="alert">
          {error}
        </p>
        <Boton type="submit" disabled={entrando || !correo.trim() || !clave}>
          {entrando ? 'Entrando...' : 'Entrar'}
        </Boton>
      </form>
    </div>
  )
}
