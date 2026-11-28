import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSessao } from '../auth/useSessao'
import Spinner from './Spinner'

/** Redireciona para o login quem tentar acessar uma tela protegida sem sessão ativa. */
export default function RotaProtegida({ children }: { children: ReactNode }) {
  const { logado, verificando } = useSessao()
  if (verificando) {
    return <Spinner tela />
  }
  if (!logado) return <Navigate to="/login" replace />
  return <>{children}</>
}
