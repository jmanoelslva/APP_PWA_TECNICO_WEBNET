import { useEffect, useRef } from 'react'

/** Voltar do celular fecha a janela de cima. Cada janela aberta deixa uma entrada extra no histórico; fechar pelo botão
   a retira um ciclo depois. */
interface JanelaAberta {
  fechar: () => void
  fechadaPeloVoltar: boolean
}

const pilha: JanelaAberta[] = []
let ouvindo = false

function entradaMarcada(): boolean {
  return (window.history.state as { janelaAberta?: boolean } | null)?.janelaAberta === true
}

function marcarEntrada(): void {
  const estado = (window.history.state as Record<string, unknown> | null) ?? {}
  window.history.pushState({ ...estado, janelaAberta: true }, '')
}

function aoVoltar(): void {
  if (entradaMarcada() || pilha.length === 0) return
  const topo = pilha.pop()!
  topo.fechadaPeloVoltar = true
  topo.fechar()
  if (pilha.length > 0) marcarEntrada()
}

export function useFecharComVoltar(aberto: boolean, fechar: () => void): void {
  const fecharRef = useRef(fechar)
  useEffect(() => {
    fecharRef.current = fechar
  })

  useEffect(() => {
    if (!aberto) return
    if (!ouvindo) {
      window.addEventListener('popstate', aoVoltar)
      ouvindo = true
    }
    const janela: JanelaAberta = { fechar: () => fecharRef.current(), fechadaPeloVoltar: false }
    if (pilha.length === 0 && !entradaMarcada()) marcarEntrada()
    pilha.push(janela)
    return () => {
      const indice = pilha.indexOf(janela)
      if (indice >= 0) pilha.splice(indice, 1)
      if (janela.fechadaPeloVoltar || pilha.length > 0) return
      setTimeout(() => {
        if (pilha.length === 0 && entradaMarcada()) window.history.back()
      }, 0)
    }
  }, [aberto])
}
