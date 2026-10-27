/**
 * Usuários do seed (Anexo B). Ficam no pacote compartilhado porque o app (login)
 * e o serviço de chamados (dono de cada chamado) precisam dos mesmos ids.
 */
export type SeedUser = {
  id: string
  email: string
  name: string
  role: 'employee' | 'analyst'
  department: string
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    id: 'u_ana',
    email: 'ana.souza@nexo.com',
    name: 'Ana Souza',
    role: 'employee',
    department: 'Financeiro',
  },
  {
    id: 'u_bruno',
    email: 'bruno.lima@nexo.com',
    name: 'Bruno Lima',
    role: 'employee',
    department: 'Comercial',
  },
  {
    id: 'u_carla',
    email: 'carla.mendes@nexo.com',
    name: 'Carla Mendes',
    role: 'employee',
    department: 'Marketing',
  },
  {
    id: 'u_diego',
    email: 'diego.rocha@nexo.com',
    name: 'Diego Rocha',
    role: 'employee',
    department: 'Operações',
  },
  {
    id: 'u_elisa',
    email: 'elisa.nunes@nexo.com',
    name: 'Elisa Nunes',
    role: 'employee',
    department: 'Jurídico',
  },
  {
    id: 'u_marcos',
    email: 'marcos.alves@nexo.com',
    name: 'Marcos Alves',
    role: 'analyst',
    department: 'Service Desk N1',
  },
  {
    id: 'u_patricia',
    email: 'patricia.gomes@nexo.com',
    name: 'Patrícia Gomes',
    role: 'analyst',
    department: 'Service Desk N2',
  },
]
