import { Boton } from '../componentes/Boton'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../lib/tipos'
import { Departamentos } from './Departamentos'

export function Ajustes({ perfil }: { perfil: Perfil }) {
  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-titulo font-bold">Ajustes</h1>

      <Departamentos />

      <div className="flex flex-col gap-3 border-t border-stone-200 pt-6">
        <p className="text-lg text-stone-600">Usuaria: {perfil.nombre}</p>
        <Boton variante="secundario" className="self-start" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </Boton>
      </div>
    </section>
  )
}
