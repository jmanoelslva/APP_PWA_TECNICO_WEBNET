// Atendimento em andamento (barra e "Continuar atendimento"), no localStorage por até 12 h, apagado ao sair.

export interface Atendimento {
  clientPk?: number
  cliente?: string
  cpePk?: number
  pppoe?: string
  ticketPk?: number
  // Última tela do atendimento (caminho + busca), para o "Continuar".
  caminho?: string
  tela?: TelaAtendimento
  em: number
}

export type TelaAtendimento = 'cliente' | 'conexao' | 'onu' | 'os' | 'financeiro'

export const NOME_TELA: Record<TelaAtendimento, string> = {
  cliente: 'Cliente',
  conexao: 'Conexão',
  onu: 'ONU',
  os: 'OS',
  financeiro: 'Financeiro',
}

const CHAVE = 'webnet-tecnico-atendimento'
export const EVENTO_ATENDIMENTO = 'webnet-atendimento-mudou'
const VALIDADE_MS = 12 * 60 * 60 * 1000

export function lerAtendimento(agora = Date.now()): Atendimento | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return null
    const a = JSON.parse(bruto) as Atendimento
    if (!a || typeof a.em !== 'number' || agora - a.em > VALIDADE_MS) return null
    return a
  } catch {
    return null
  }
}

function gravar(a: Atendimento | null): void {
  try {
    if (a) localStorage.setItem(CHAVE, JSON.stringify(a))
    else localStorage.removeItem(CHAVE)
  } catch {
    // sem armazenamento: a barra só usa o que a tela atual sabe
  }
  window.dispatchEvent(new Event(EVENTO_ATENDIMENTO))
}

export type DadosAtendimento = Omit<Atendimento, 'em' | 'caminho' | 'tela'>

const IDENTIFICADORES = ['clientPk', 'cpePk', 'ticketPk', 'pppoe'] as const

/** Mesmo atendimento: algum identificador em comum e nenhum divergente. */
export function mesmoAtendimento(atual: Atendimento | null, novo: DadosAtendimento): boolean {
  if (!atual) return false
  let emComum = false
  for (const chave of IDENTIFICADORES) {
    const a = atual[chave]
    const n = novo[chave]
    if (a == null || a === '' || n == null || n === '') continue
    const iguais = chave === 'pppoe' ? String(a).toLowerCase() === String(n).toLowerCase() : a === n
    if (!iguais) return false
    emComum = true
  }
  return emComum
}

/** Mesmo atendimento completa; outro cliente começa do zero. */
export function juntarAtendimento(atual: Atendimento | null, novo: DadosAtendimento, agora = Date.now()): Atendimento {
  const base = mesmoAtendimento(atual, novo) ? atual : null
  const limpo = Object.fromEntries(Object.entries(novo).filter(([, v]) => v != null && v !== '')) as DadosAtendimento
  return { ...(base ?? {}), ...limpo, em: agora }
}

export function registrarAtendimento(novo: DadosAtendimento, tela: TelaAtendimento, caminho: string): void {
  gravar({ ...juntarAtendimento(lerAtendimento(), novo), tela, caminho })
}

export function limparAtendimento(): void {
  gravar(null)
}

type ComChamado = { client_pk?: number; ticket_pk?: number }

export type OsDoCliente<T extends ComChamado> =
  | { tipo: 'uma'; ticketPk: number }
  | { tipo: 'varias'; ordens: T[] }
  | { tipo: 'nenhuma' }

/** OS abertas do cliente, contadas por chamado: uma abre, várias pedem escolha, nenhuma avisa. */
export function osDoCliente<T extends ComChamado>(ordens: T[], clientPk: number): OsDoCliente<T> {
  const porChamado = new Map<number, T>()
  for (const o of ordens) {
    if (o.client_pk === clientPk && o.ticket_pk != null && !porChamado.has(o.ticket_pk)) porChamado.set(o.ticket_pk, o)
  }
  if (porChamado.size === 1) return { tipo: 'uma', ticketPk: [...porChamado.keys()][0] }
  return porChamado.size > 1 ? { tipo: 'varias', ordens: [...porChamado.values()] } : { tipo: 'nenhuma' }
}

/** Caminho de cada tela do atendimento; ausente quando falta o dado. */
export function destinosAtendimento(a: Atendimento | null): Partial<Record<TelaAtendimento, string>> {
  if (!a) return {}
  const d: Partial<Record<TelaAtendimento, string>> = {}
  if (a.clientPk != null) d.cliente = `/clientes/${a.clientPk}`
  if (a.cpePk != null) d.conexao = `/conexao?cpe_pk=${a.cpePk}`
  if (a.pppoe) d.onu = `/onu?username=${encodeURIComponent(a.pppoe)}`
  if (a.ticketPk != null) d.os = `/os/${a.ticketPk}`
  else if (a.cliente) d.os = `/suporte?busca=${encodeURIComponent(a.cliente)}`
  if (a.clientPk != null) d.financeiro = `/financeiro?client_pk=${a.clientPk}`
  return d
}
