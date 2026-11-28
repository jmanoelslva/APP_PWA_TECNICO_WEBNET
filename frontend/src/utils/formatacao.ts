/** "YYYY-MM-DD" ou "YYYY-MM-DD HH:mm:ss" (formato do Controllr) → "DD/MM/YYYY". */
export function formatarData(data: string | null | undefined): string | null {
  if (!data) return null
  const soData = data.split(' ')[0]
  const partes = soData.split('-')
  if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`
  return soData
}

/** "YYYY-MM-DD HH:mm:ss" → "DD/MM/YYYY HH:mm". */
export function formatarDataHora(data: string | null | undefined): string {
  if (!data) return ''
  const partes = data.split(' ')
  const dataParte = partes[0]?.split('-')
  const horaParte = partes[1]?.slice(0, 5)
  if (dataParte?.length === 3) {
    return `${dataParte[2]}/${dataParte[1]}/${dataParte[0]}${horaParte ? ` ${horaParte}` : ''}`
  }
  return data
}

/** Com segundos. */
export function formatarDataHoraSegundos(data: string | null | undefined): string {
  if (!data) return ''
  const partes = data.split(' ')
  const dataParte = partes[0]?.split('-')
  const horaParte = partes[1]
  if (dataParte?.length === 3) {
    return `${dataParte[2]}/${dataParte[1]}/${dataParte[0]}${horaParte ? ` ${horaParte}` : ''}`
  }
  return data
}

/** Data do Controllr → ms; vazia, zerada ou inválida → null. */
export function instanteDoServidor(data: string | null | undefined): number | null {
  if (!data) return null
  const m = data.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m || m[1] === '0000') return null
  const instante = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime()
  return Number.isFinite(instante) ? instante : null
}

/** "agora", "há 5 min", "há 3 h", "há 1 dia", "há 12 dias". */
export function tempoRelativo(instante: number, agora: number = Date.now()): string {
  const minutos = Math.max(0, Math.floor((agora - instante) / 60_000))
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.floor(horas / 24)
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

/** "há 3 h · 05/11/2026 19:25"; vazia → "". */
export function quandoFoi(data: string | null | undefined, agora: number = Date.now()): string {
  const instante = instanteDoServidor(data)
  if (instante == null) return ''
  return `${tempoRelativo(instante, agora)} · ${formatarDataHora(data)}`
}

/** "YYYY-MM-DD HH:mm:ss", mesmo formato usado pelo Controllr (ver where.py::corpo no backend). */
export function dataParaFormatoServidor(data: Date): string {
  const par = (n: number) => String(n).padStart(2, '0')
  return `${data.getFullYear()}-${par(data.getMonth() + 1)}-${par(data.getDate())} ${par(data.getHours())}:${par(data.getMinutes())}:${par(data.getSeconds())}`
}

/** Mapeamento oficial de contract_status, doc do Controllr. */
const ROTULOS_STATUS_CONTRATO: Record<number, string> = {
  0: 'Desativado',
  1: 'Ativado',
  2: 'Alertado',
  3: 'Pendente',
  4: 'Bloqueado',
  5: 'Cancelado',
}

export function formatarStatusContrato(valor: number | string | null | undefined): string {
  if (valor == null) return '—'
  return ROTULOS_STATUS_CONTRATO[Number(valor)] ?? String(valor)
}

/** "Rótulo#-#número", às vezes vários por vírgula: só os números. */
export function extrairTelefones(raw: string | null | undefined): string | null {
  if (!raw) return null
  const numeros = raw
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => parte.split('#-#').pop()?.trim() ?? parte)
    .filter(Boolean)
  return numeros.length > 0 ? numeros.join(', ') : null
}

/** Tipos de criptografia Wi-Fi do CPE (cpe_wifi_encryption_type). */
export const OPCOES_CRIPTOGRAFIA_WIFI: Array<{ valor: number; rotulo: string }> = [
  { valor: 0, rotulo: 'Nenhum' },
  { valor: 1, rotulo: 'WEP' },
  { valor: 2, rotulo: 'WPA' },
  { valor: 3, rotulo: 'EAP' },
]

/** Detecta o tipo: números buscam documento (trecho) e contrato; 11 ou 14 dígitos só documento; com letra, nome. */
export function detectarTipoBusca(valor: string): { doc?: string; contrato?: string; nome?: string } {
  const termo = valor.trim()
  const somenteDigitos = termo.replace(/\D/g, '')
  // Máscara de CPF/CNPJ ainda é número.
  if (somenteDigitos && /^[\d.\-/\s]+$/.test(termo)) {
    if (somenteDigitos.length === 11 || somenteDigitos.length === 14) return { doc: somenteDigitos }
    // Menos de 4 dígitos: só contrato (texto, mantém zero à esquerda).
    if (somenteDigitos.length < 4) return { contrato: somenteDigitos }
    return { doc: somenteDigitos, contrato: somenteDigitos }
  }
  return { nome: termo }
}

/** "JM" de "jmanoelslva"; "MS" de "maria.silva" (partes separadas por . _ - ou espaço). */
export function iniciais(usuario: string | undefined): string {
  const partes = (usuario ?? '').split(/[.\s_-]+/).filter(Boolean)
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase()
  return (partes[0] ?? '?').slice(0, 2).toUpperCase()
}

export type NivelSinal = 'boa' | 'alerta' | 'critica' | 'desconhecida'

/** Faixa da ONU desta operação (OLT em pages/onu/formato.ts). */
export function nivelSinalOnu(rx: number | null | undefined): NivelSinal {
  if (rx == null) return 'desconhecida'
  if (rx >= -22) return 'boa'
  if (rx >= -24) return 'alerta'
  return 'critica'
}

/** "1.234,56", sem R$. */
export function formatarMoeda(valor: number | string | null | undefined): string {
  if (valor == null || valor === '') return '—'
  const numero = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor
  if (Number.isNaN(numero)) return String(valor)
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const TEXTO_SINAL_ONU: Record<NivelSinal, string> = {
  boa: 'Sinal normal',
  alerta: 'Sinal fraco',
  critica: 'Sinal crítico',
  desconhecida: 'Sem leitura',
}

export function soDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '')
}

/** CPF (11 dígitos) ou CNPJ (14) com máscara; outro formato volta como veio. */
export function formatarDocumento(doc: string | null | undefined): string {
  const d = soDigitos(doc)
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  return doc ?? ''
}

/** Número nacional (DDD + número), sem o 55 do país, ou null se não parecer telefone do Brasil. */
function telefoneNacional(numero: string | null | undefined): string | null {
  let d = soDigitos(numero)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1) // "0 + DDD + fixo"
  return d.length === 10 || d.length === 11 ? d : null
}

/** "(86) 99999-0000" / "(86) 3222-0000"; outro formato volta como veio. */
export function formatarTelefone(numero: string | null | undefined): string {
  const d = telefoneNacional(numero)
  if (!d) return numero ?? ''
  return d.length === 11
    ? d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
    : d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')
}

/** Link para ligar (tel:) ou null sem número. */
export function linkLigar(numero: string | null | undefined): string | null {
  const d = telefoneNacional(numero) ?? soDigitos(numero)
  return d ? `tel:${d}` : null
}

/** wa.me só para celular (9 dígitos com 9, ou 8 dígitos de 6 a 9, que ganha o 9). */
export function linkWhatsapp(numero: string | null | undefined): string | null {
  const d = telefoneNacional(numero)
  if (d && d.length === 11 && d[2] === '9') return `https://wa.me/55${d}`
  if (d && d.length === 10 && '6789'.includes(d[2])) return `https://wa.me/55${d.slice(0, 2)}9${d.slice(2)}`
  return null
}

/** Separa vários números num texto. */
export function separarTelefones(texto: string | null | undefined): string[] {
  if (!texto) return []
  return texto
    .split(/[,;/|\n]|\s+(?:e|ou)\s+/i)
    .map((parte) => (parte.split('#-#').pop() ?? parte).trim())
    .filter((parte) => soDigitos(parte).length >= 8)
}

/** "64000-000" a partir de 8 dígitos; outro formato volta como veio. */
export function formatarCep(cep: string | null | undefined): string {
  const d = soDigitos(cep)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep ?? ''
}
