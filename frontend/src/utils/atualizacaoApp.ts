/** Versão nova: recarrega na próxima troca de tela ou ao voltar ao app; chunk que falha recarrega na hora. */

let versaoNova = false
let recarregando = false

function recarregar(): void {
  if (recarregando) return
  recarregando = true
  window.location.reload()
}

/** Chamado a cada troca de tela (App.tsx): aplica a versão nova, se houver. */
export function aplicarVersaoNovaSePreciso(): void {
  if (versaoNova) recarregar()
}

export function iniciarAtualizacaoApp(): void {
  // Arquivo de tela (import dinâmico) que não existe mais: versão velha.
  window.addEventListener('vite:preloadError', (evento) => {
    evento.preventDefault()
    recarregar()
  })

  if (!('serviceWorker' in navigator)) return
  // Sem controlador = primeira instalação: o SW assumir não é versão nova.
  const jaTinhaVersao = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (jaTinhaVersao) versaoNova = true
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') aplicarVersaoNovaSePreciso()
  })
}
