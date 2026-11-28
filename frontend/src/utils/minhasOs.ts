import type { EnderecoDto, OrdemServicoDto, TelefoneDto } from '../api/client'
import { dataParaFormatoServidor, extrairTelefones, separarTelefones } from './formatacao'

export interface OsDoDia {
  os: OrdemServicoDto
  // Ver osAtrasada.
  atrasada: boolean
  // Agendada para um dia anterior a hoje (mostra a data, não só a hora).
  diaAnterior: boolean
}

/** Atrasada: passou do horário e não iniciou. */
export function osAtrasada(os: OrdemServicoDto, agora: Date = new Date()): boolean {
  if (!os.op_date_sched || os.op_date_close || os.op_date_cancel || os.etapa === 'iniciada') return false
  // Mesmo formato "AAAA-MM-DD HH:mm" dos dois lados: comparar como texto.
  return os.op_date_sched.slice(0, 16) < dataParaFormatoServidor(agora).slice(0, 16)
}

/** OS de hoje e atrasadas, da mais antiga à mais nova; a primeira é a próxima. */
export function osDoDia(ordens: OrdemServicoDto[], agora: Date = new Date()): OsDoDia[] {
  // Compara a data como texto (evita fuso).
  const hoje = dataParaFormatoServidor(agora).slice(0, 10)
  return ordens
    .filter((os) => !!os.op_date_sched && !os.op_date_close && !os.op_date_cancel)
    .filter((os) => os.op_date_sched!.slice(0, 10) <= hoje)
    .sort((a, b) => a.op_date_sched!.localeCompare(b.op_date_sched!))
    .map((os) => ({ os, atrasada: osAtrasada(os, agora), diaAnterior: os.op_date_sched!.slice(0, 10) < hoje }))
}

/** OS de dias seguintes, da mais próxima. */
export function osFuturas(ordens: OrdemServicoDto[], agora: Date = new Date()): OrdemServicoDto[] {
  const hoje = dataParaFormatoServidor(agora).slice(0, 10)
  return ordens
    .filter((os) => !!os.op_date_sched && !os.op_date_close && !os.op_date_cancel)
    .filter((os) => os.op_date_sched!.slice(0, 10) > hoje)
    .sort((a, b) => a.op_date_sched!.localeCompare(b.op_date_sched!))
}

/** A próxima OS agendada depois de hoje — o Início mostra quando não há nenhuma para hoje. */
export function proximaOsFutura(ordens: OrdemServicoDto[], agora: Date = new Date()): OrdemServicoDto | null {
  return osFuturas(ordens, agora)[0] ?? null
}

/** "qui 06/11 08:00" de uma data agendada "AAAA-MM-DD HH:mm:ss". */
export function quandoOsFutura(sched: string): string {
  const [ano, mes, dia] = sched.slice(0, 10).split('-').map(Number)
  const semana = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const hora = sched.slice(11, 16)
  return `${semana} ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}${hora ? ` ${hora}` : ''}`
}

/** "HH:mm" da data agendada; para OS de dia anterior, "DD/MM HH:mm". */
export function horarioOs(item: OsDoDia): string {
  const sched = item.os.op_date_sched ?? ''
  const hora = sched.slice(11, 16)
  if (!item.diaAnterior) return hora
  const [, mes, dia] = sched.slice(0, 10).split('-')
  return `${dia}/${mes}${hora ? ` ${hora}` : ''}`
}

/** Rota no Google Maps: coordenadas ou endereço escrito; null sem destino. */
export function linkRota(endereco: EnderecoDto | null, os: OrdemServicoDto): string | null {
  let destino: string
  if (endereco?.address_latitude && endereco?.address_longitude) {
    destino = `${endereco.address_latitude},${endereco.address_longitude}`
  } else {
    const base = endereco ?? os
    const rua = [base.address, base.address_number].filter(Boolean).join(', ')
    if (!rua) return null
    destino = [rua, base.address_neighborhood, base.address_province, base.address_state].filter(Boolean).join(', ')
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`
}

/** Primeiro telefone (cadastrados, depois client_phones). */
export function primeiroTelefone(telefones: TelefoneDto[], clientPhones?: string | null): string | null {
  return telefonesDoCliente(telefones, clientPhones)[0] ?? null
}

/** Todos os números, cadastrados primeiro. */
export function telefonesDoCliente(telefones: TelefoneDto[], clientPhones?: string | null): string[] {
  const numeros = [
    ...telefones.flatMap((t) => separarTelefones(t.phone_number)),
    ...separarTelefones(extrairTelefones(clientPhones)),
  ].map((n) => n.replace(/[^\d+]/g, ''))
  return [...new Set(numeros)]
}

/** Rua, número e bairro numa linha (mesmo resumo da tela da OS). */
export function enderecoCurto(base: { address?: string; address_number?: string; address_neighborhood?: string }): string {
  return [base.address, base.address_number, base.address_neighborhood].filter(Boolean).join(', ')
}

/** "Hoje 09:00", "Amanhã 08:30", "Ontem 14:00" ou "03/10 10:00". */
export function quandoOs(sched: string | null | undefined, agora: Date = new Date()): string | null {
  if (!sched) return null
  const dia = sched.slice(0, 10)
  const hora = sched.slice(11, 16)
  const hoje = dataParaFormatoServidor(agora).slice(0, 10)
  const amanha = dataParaFormatoServidor(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1)).slice(0, 10)
  const ontem = dataParaFormatoServidor(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1)).slice(0, 10)
  const [, mes, d] = dia.split('-')
  const quando = dia === hoje ? 'Hoje' : dia === amanha ? 'Amanhã' : dia === ontem ? 'Ontem' : `${d}/${mes}`
  return hora ? `${quando} ${hora}` : quando
}

export interface GrupoOs {
  rotulo: string
  ordens: OrdemServicoDto[]
}

/** Agrupadas por dia; sem data no fim. */
export function agruparPorDia(ordens: OrdemServicoDto[], agora: Date = new Date()): GrupoOs[] {
  const ordenadas = [...ordens].sort((a, b) => {
    if (!a.op_date_sched) return b.op_date_sched ? 1 : 0
    if (!b.op_date_sched) return -1
    return a.op_date_sched.localeCompare(b.op_date_sched)
  })
  const grupos: GrupoOs[] = []
  for (const os of ordenadas) {
    const rotulo = os.op_date_sched ? (quandoOs(os.op_date_sched.slice(0, 10), agora) ?? '') : 'Sem data agendada'
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.rotulo === rotulo) ultimo.ordens.push(os)
    else grupos.push({ rotulo, ordens: [os] })
  }
  return grupos
}
