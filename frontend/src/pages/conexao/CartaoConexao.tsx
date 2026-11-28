import type { ReactNode } from 'react'

/** Cartão com título da aba Roteador. */
export default function CartaoConexao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="conexao-card">
      <h2>{titulo}</h2>
      {children}
    </div>
  )
}
