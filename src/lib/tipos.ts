export type Rol = 'admin' | 'operador' | 'cocina'

export interface Perfil {
  id: string
  nombre: string
  rol: Rol
}

export interface Departamento {
  id: number
  nombre: string
  alias: string[]
  activo: boolean
}

export interface Persona {
  id: number
  nombre: string
  departamento_id: number
  activo: boolean
}

export interface Saldo {
  persona_id: number
  nombre: string
  departamento_id: number
  departamento: string
  activo: boolean
  comprado: number
  pagado: number
  saldo: number
}
