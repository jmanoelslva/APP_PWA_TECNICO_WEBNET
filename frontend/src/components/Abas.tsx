import { useState } from 'react'
import './Abas.css'

export interface Aba<T extends string> {
  chave: T
  rotulo: string
}

/** Aba salva para esta tela (sessionStorage), ou a primeira se não houver/for inválida. */
export function lerAbaSalva<T extends string>(chaveArmazenamento: string, abas: Aba<T>[]): T {
  try {
    const salva = sessionStorage.getItem(chaveArmazenamento)
    const valida = abas.find((item) => item.chave === salva)
    return valida ? valida.chave : abas[0].chave
  } catch {
    return abas[0].chave
  }
}

/** Aba lembrada enquanto o app está aberto. */
export function useAbaLembrada<T extends string>(chaveArmazenamento: string, abas: Aba<T>[]): [T, (nova: T) => void] {
  // "?aba=" abre direto nessa aba e passa a ser a lembrada.
  const [aba, setAba] = useState<T>(() => {
    const pedida = new URLSearchParams(window.location.search).get('aba')
    const valida = abas.find((item) => item.chave === pedida)
    if (!valida) return lerAbaSalva(chaveArmazenamento, abas)
    try {
      sessionStorage.setItem(chaveArmazenamento, valida.chave)
    } catch {
      // sem armazenamento: vale só nesta tela
    }
    return valida.chave
  })
  function escolher(nova: T) {
    setAba(nova)
    try {
      sessionStorage.setItem(chaveArmazenamento, nova)
    } catch {
      // sem armazenamento: vale só nesta tela
    }
  }
  return [aba, escolher]
}

/** Trilho de abas fixo no topo, aba ativa no laranja da marca. */
export default function Abas<T extends string>({
  abas,
  ativa,
  onEscolher,
  rotulo,
}: {
  abas: Aba<T>[]
  ativa: T
  onEscolher: (aba: T) => void
  /** Nome do grupo para leitor de tela (ex.: "Partes da OS"). */
  rotulo: string
}) {
  return (
    <div className="abas" role="tablist" aria-label={rotulo}>
      {abas.map((item) => (
        <button
          key={item.chave}
          type="button"
          role="tab"
          aria-selected={ativa === item.chave}
          className={`aba${ativa === item.chave ? ' ativa' : ''}`}
          onClick={() => onEscolher(item.chave)}
        >
          {item.rotulo}
        </button>
      ))}
    </div>
  )
}
