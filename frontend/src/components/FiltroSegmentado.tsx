import type { CSSProperties } from 'react'
import './FiltroSegmentado.css'

export interface OpcaoSegmentada<T extends string> {
  chave: T
  rotulo: string
  /** Contagem em destaque acima do rótulo (opcional). */
  quantidade?: number
  /** Número em vermelho mesmo sem estar ativo (ex.: "Hoje", "Atrasadas"). */
  alerta?: boolean
}

/** Filtro segmentado de uma escolha (Offline, OS, Auditoria). */
export default function FiltroSegmentado<T extends string>({
  opcoes,
  ativa,
  onEscolher,
  rotulo,
  cor,
}: {
  opcoes: OpcaoSegmentada<T>[]
  ativa: T
  onEscolher: (chave: T) => void
  /** Nome do grupo para leitor de tela. */
  rotulo: string
  /** Cor da área (CORES.*) para o rótulo da opção ativa. */
  cor?: string
}) {
  return (
    <div
      className="filtro-segmentado"
      role="group"
      aria-label={rotulo}
      style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))`, '--segmento-cor': cor } as CSSProperties}
    >
      {opcoes.map((opcao) => (
        <button
          key={opcao.chave}
          type="button"
          aria-pressed={ativa === opcao.chave}
          className={`${ativa === opcao.chave ? 'ativo' : ''}${opcao.alerta ? ' alerta' : ''}`.trim() || undefined}
          onClick={() => onEscolher(opcao.chave)}
        >
          {opcao.quantidade != null && <strong>{opcao.quantidade}</strong>}
          <span>{opcao.rotulo}</span>
        </button>
      ))}
    </div>
  )
}
