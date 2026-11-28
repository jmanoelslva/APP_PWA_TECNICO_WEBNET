/** Vibração curta (Android); respeita "reduzir movimento". */
const PADROES = { leve: 10, sucesso: 18, erro: [30, 60, 30] } as const

export type TipoVibracao = keyof typeof PADROES

export function vibrar(tipo: TipoVibracao = 'leve'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  try {
    navigator.vibrate(PADROES[tipo] as number | number[])
  } catch {
    // navegador recusou: segue sem vibrar
  }
}
