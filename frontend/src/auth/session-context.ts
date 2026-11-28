import { createContext } from 'react'

export interface TecnicoLogado {
  username: string
  nome?: string | null
}

export interface SessionState {
  logado: boolean
  // true na checagem inicial; as rotas protegidas esperam.
  verificando: boolean
  carregando: boolean
  erro: string | null
  tecnico: TecnicoLogado | null
  entrar: (usuario: string, senha: string) => Promise<boolean>
  // Os avisos de OS continuam neste celular até desligar ou outro técnico entrar.
  sair: () => Promise<void>
}

// Contexto em arquivo próprio para não quebrar o Fast Refresh.
export const SessionContext = createContext<SessionState | null>(null)
