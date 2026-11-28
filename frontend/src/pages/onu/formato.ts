import type { NivelSinal } from '../../utils/formatacao'

/** Faixa da OLT (cortes diferentes da ONU). */
export function nivelSinalOlt(rx: number | undefined): NivelSinal {
  if (rx == null) return 'desconhecida'
  if (rx >= -25) return 'boa'
  if (rx >= -27) return 'alerta'
  return 'critica'
}

// ms desde a última coleta; zera em "Atualizar agora".
export function formatarTempoDesdeColeta(ms: number | undefined): string | null {
  if (ms == null) return null
  const segundosTotais = Math.floor(ms / 1000)
  const minutos = Math.floor(segundosTotais / 60)
  const segundos = segundosTotais % 60
  if (minutos === 0) return `há ${segundos}s`
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  const minutosRestantes = minutos % 60
  return `há ${horas}h${minutosRestantes > 0 ? ` ${minutosRestantes}min` : ''}`
}

// "yyyy-mm-dd hh:mm:ss UTC-3" → dd/mm/yyyy hh:mm:ss, sem converter fuso; formato inesperado sai cru.
export function formatarUltimaQueda(valor: string | undefined): string | null {
  if (!valor) return null
  const match = valor.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2})/)
  if (!match) return valor
  const [, ano, mes, dia, hora] = match
  return `${dia}/${mes}/${ano} ${hora}`
}

export const TEXTO_SINAL: Record<NivelSinal, string> = {
  boa: 'Sinal normal',
  alerta: 'Sinal fraco — atenção',
  critica: 'Sinal crítico',
  desconhecida: 'Sem leitura',
}
