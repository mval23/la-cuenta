// Pantallas del PIN que abre la app en este dispositivo (ver lib/candado.ts).

import { useEffect, useState } from 'react'
import { TecladoPin } from '../componentes/TecladoPin'
import { esperaPendiente, guardarPin, LARGO_PIN, pinMuyFacil, probarPin } from '../lib/candado'
import { supabase } from '../lib/supabase'

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-6">
      <img src="/logo.svg" alt="" className="mx-auto mb-3 h-16 w-16" />
      <h1 className="mb-6 text-center text-3xl font-bold">La Cuenta</h1>
      {children}
    </div>
  )
}

/** La primera vez en el dispositivo: elegir el PIN y escribirlo otra vez. */
export function ElegirPin({ usuarioId, nombre, onListo }: { usuarioId: string; nombre: string; onListo: () => void }) {
  const [primero, setPrimero] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function alEscribir(nuevo: string) {
    setPin(nuevo)
    setError(null)
    if (nuevo.length < LARGO_PIN) return
    if (primero === null) {
      if (pinMuyFacil(nuevo)) {
        setError('Ese PIN es muy fácil de adivinar. Elige otro.')
        setPin('')
        return
      }
      setPrimero(nuevo)
      setPin('')
      return
    }
    if (nuevo !== primero) {
      setError('No son iguales. Elige el PIN otra vez.')
      setPrimero(null)
      setPin('')
      return
    }
    setGuardando(true)
    await guardarPin(localStorage, usuarioId, nuevo)
    onListo()
  }

  return (
    <Marco>
      <TecladoPin
        titulo={
          primero === null
            ? `${nombre}, elige un PIN de ${LARGO_PIN} números para abrir La Cuenta`
            : 'Escríbelo otra vez'
        }
        pin={pin}
        onPin={alEscribir}
        deshabilitado={guardando}
        mensaje={error && <span className="text-peligro">{error}</span>}
        izquierda={primero !== null ? { texto: 'Volver', onClick: () => (setPrimero(null), setPin('')) } : undefined}
      />
    </Marco>
  )
}

/** Tapa la app hasta que se escriba el PIN. La app sigue abierta debajo. */
export function PedirPin({ nombre, esAdmin, onAbrir }: { nombre: string; esAdmin: boolean; onAbrir: () => void }) {
  // Amparo no tiene la contraseña de la cuenta: se le dice a quién acudir.
  const configurar = esAdmin
    ? 'configurar el iPad otra vez con la contraseña de la cuenta'
    : 'pedirle a Mariana que configure el iPad otra vez'
  const [pin, setPin] = useState('')
  const [probando, setProbando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [esperarHasta, setEsperarHasta] = useState(() => esperaPendiente(localStorage))

  useEffect(() => {
    if (esperarHasta === null) return
    const t = window.setTimeout(() => {
      setEsperarHasta(null)
      setError(null)
    }, esperarHasta - Date.now())
    return () => window.clearTimeout(t)
  }, [esperarHasta])

  async function alEscribir(nuevo: string) {
    setPin(nuevo)
    setError(null)
    if (nuevo.length < LARGO_PIN) return
    setProbando(true)
    const resultado = await probarPin(localStorage, nuevo)
    setProbando(false)
    setPin('')
    if (resultado.tipo === 'ok') onAbrir()
    else if (resultado.tipo === 'no') {
      setError(
        resultado.quedan <= 3
          ? `Ese PIN no es. Si fallas ${resultado.quedan} ${resultado.quedan === 1 ? 'vez' : 'veces'} más, habrá que ${configurar}.`
          : 'Ese PIN no es. Intenta otra vez.',
      )
    } else if (resultado.tipo === 'esperar') setEsperarHasta(resultado.hasta)
    // Con la sesión cerrada, App muestra la pantalla de configurar.
    else void supabase.auth.signOut({ scope: 'local' })
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-fondo">
      <Marco>
        <TecladoPin
          titulo={`Hola, ${nombre}. Escribe tu PIN`}
          pin={pin}
          onPin={alEscribir}
          deshabilitado={probando || esperarHasta !== null}
          mensaje={
            esperarHasta !== null ? (
              <span className="text-aviso">Fallaste varias veces. Espera un minuto e intenta otra vez.</span>
            ) : probando ? (
              <span className="text-tinta-suave">Revisando...</span>
            ) : (
              error && <span className="text-peligro">{error}</span>
            )
          }
        />
        <p className="mt-6 text-center text-base text-tinta-suave">
          ¿Olvidaste el PIN? Hay que {configurar}.
        </p>
      </Marco>
    </div>
  )
}

/** Se falló el PIN demasiadas veces y la sesión no alcanzó a cerrarse: se cierra ahora. */
export function Bloqueado() {
  useEffect(() => {
    void supabase.auth.signOut({ scope: 'local' })
  }, [])
  return (
    <Marco>
      <p className="text-center text-lg text-tinta-suave">Cerrando la sesión...</p>
    </Marco>
  )
}
