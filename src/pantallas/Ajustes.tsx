import { useState } from 'react'
import { Aviso } from '../componentes/Aviso'
import { Boton } from '../componentes/Boton'
import { useAviso } from '../componentes/useAviso'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../lib/tipos'
import { Departamentos } from './Departamentos'

export function Ajustes({ perfil }: { perfil: Perfil }) {
  const { aviso, mostrar, cerrar } = useAviso()
  const [saliendo, setSaliendo] = useState(false)

  return (
    <section className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-titulo font-bold">Ajustes</h1>

      <Departamentos mostrar={mostrar} />

      <div className="flex flex-col gap-3 border-t border-stone-200 pt-6">
        <p className="text-lg text-stone-600">Usuaria: {perfil.nombre}</p>
        {saliendo ? (
          // Para volver a entrar hace falta el PIN: mejor preguntar antes.
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-amber-50 p-4">
            <span className="mr-auto text-lg">¿Cerrar sesión? Para volver a entrar se necesita el PIN.</span>
            <Boton variante="secundario" compacto onClick={() => setSaliendo(false)}>
              No
            </Boton>
            <Boton compacto onClick={() => supabase.auth.signOut()}>
              Sí, cerrar sesión
            </Boton>
          </div>
        ) : (
          <Boton variante="secundario" className="self-start" onClick={() => setSaliendo(true)}>
            Cerrar sesión
          </Boton>
        )}
      </div>

      <Aviso aviso={aviso} onCerrar={cerrar} />
    </section>
  )
}
