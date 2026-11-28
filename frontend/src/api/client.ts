/** Cliente HTTP do backend próprio (nunca o Controllr direto). Sessão por cookie httpOnly TECSESSION. */

import { buscarTodasPaginas } from '../utils/paginacao'
import { cabecalhoLocalizacao } from '../utils/localizacaoAuditoria'

const API_BASE = '/api'
const TEMPO_LIMITE_CONSULTA_MS = 30_000
const STATUS_SERVIDOR_FORA = [502, 503, 504]

export class SessaoExpiradaError extends Error {
  constructor() {
    super('Sessão expirada.')
    this.name = 'SessaoExpiradaError'
  }
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** SessionProvider se registra aqui para deslogar e avisar quando a sessão expira. */
let ouvinteSessaoExpirada: (() => void) | null = null

export function aoExpirarSessao(ouvinte: (() => void) | null): void {
  ouvinteSessaoExpirada = ouvinte
}

interface ErroPadrao {
  detail?: string
}

function querystring(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return ''
  const busca = new URLSearchParams()
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined) busca.append(chave, String(valor))
  }
  const texto = busca.toString()
  return texto ? `?${texto}` : ''
}

async function tratarResposta<T>(response: Response, path: string): Promise<T> {
  // 401 = sessão ausente ou expirada (senha errada vem como 200 {success:false}).
  if (response.status === 401) {
    ouvinteSessaoExpirada?.()
    throw new SessaoExpiradaError()
  }
  if (!response.ok) {
    // 502/503/504 sem JSON: backend reiniciando.
    let mensagem = STATUS_SERVIDOR_FORA.includes(response.status)
      ? 'Servidor em atualização. Tente de novo em alguns segundos.'
      : `Erro ${response.status} ao chamar ${path}`
    try {
      const corpo = (await response.json()) as ErroPadrao
      if (corpo.detail) mensagem = corpo.detail
    } catch {
      // corpo não era JSON — mantém a mensagem genérica
    }
    throw new ApiError(mensagem, response.status)
  }
  return (await response.json()) as T
}

async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  // Tempo-limite só em consultas; envios não são cortados para não deixar dúvida se gravou.
  let response: Response
  try {
    response = await fetch(`${API_BASE}/${path}${querystring(params)}`, {
      method: 'GET',
      credentials: 'include',
      signal: AbortSignal.timeout(TEMPO_LIMITE_CONSULTA_MS),
    })
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'TimeoutError') {
      throw new ApiError('O sinal está fraco: a consulta passou de 30 segundos sem resposta. Tente de novo.', 0)
    }
    throw erro
  }
  return tratarResposta<T>(response, path)
}

// Cabeçalhos das ações (envios): localização do técnico para a auditoria.
function cabecalhosAcao(json: boolean): Record<string, string> {
  const cabecalhos: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {}
  const local = cabecalhoLocalizacao()
  if (local) cabecalhos['X-Localizacao'] = local
  return cabecalhos
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: cabecalhosAcao(true),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return tratarResposta<T>(response, path)
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/${path}`, {
    method: 'PUT',
    credentials: 'include',
    headers: cabecalhosAcao(true),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return tratarResposta<T>(response, path)
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}/${path}`, { method: 'POST', credentials: 'include', headers: cabecalhosAcao(false), body: form })
  return tratarResposta<T>(response, path)
}

// ---------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------

export interface TecnicoDto {
  username: string
  /** Nome no Controllr (ex.: "Pedro Carlos"); null sem permissão para ler. */
  nome?: string | null
}

export interface LoginResponse {
  success: boolean
  message?: string
  tecnico?: TecnicoDto
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return post<LoginResponse>('auth/login', { username, password })
}

export function logout(): Promise<{ success: boolean }> {
  return post('auth/logout')
}

export function buscarTecnicoAtual(): Promise<TecnicoDto> {
  return get<TecnicoDto>('auth/me')
}

// ---------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------

export interface ClienteDto {
  client_pk?: number
  client_name?: string
  client_lastname?: string
  client_complete_name?: string
  client_doc1?: string
  client_doc2?: string
  client_phones?: string
  client_emails?: string
  client_status?: number
  client_type?: number
}

// Campos crus de /aaa_ctl/cpe/list_combo (cpe_username), diferente de CpeDto.
export interface CpeComboDto {
  cpe_pk?: number
  client_pk?: number
  contract_pk?: number
  // Completado pelo backend (list_combo só traz contract_pk).
  contract_number?: number
  cpe_circuit_id?: string
  client_complete_name?: string
  dp_name?: string
  dp_pk?: number
  cpe_mac?: string
  nas_name?: string
  plan_pk?: number
  cpe_username?: string
}

export interface ItemContratoDto {
  item_pk?: number
  contract_pk?: number
  item_name?: string
  item_amount?: string
  item_type?: number
  item_rent?: boolean
  plan_name?: string
  plan_pk?: number
}

export interface ContratoDto {
  contract_pk?: number
  contract_number?: number
  contract_status?: number
  contract_pay_day?: number
  contract_date_activation?: string
  client_pk?: number
  // sign_date vazio = não assinado; sign_doc_link abre o documento. Demais contract_sign_* vêm pelo índice abaixo.
  contract_sign_date?: string
  contract_sign_doc_link?: string
  itens?: ItemContratoDto[]
  [chave: string]: unknown
}

export interface EnderecoDto {
  address_pk?: number
  address_identification?: string
  address?: string
  address_number?: string
  address_neighborhood?: string
  address_zipcode?: string
  address_province?: string
  address_state?: string
  address_completation?: string
  address_default?: number
  // Obrigatório no Controllr; sempre reenviado como veio.
  address_siafi?: number
  address_latitude?: string
  address_longitude?: string
  client_pk?: number
}

export interface BuscaClienteResultado {
  client_pk: number
  cliente: ClienteDto
  cpes: CpeComboDto[]
}

export interface BuscaClienteResponse {
  success: boolean
  results: BuscaClienteResultado[]
}

export function buscarClientes(filtros: { doc?: string; contrato?: string; nome?: string }): Promise<BuscaClienteResponse> {
  return get<BuscaClienteResponse>('clientes/busca', filtros)
}

// Telefone com phone_pk (client_phones é só resumo), campos crus do Controllr.
export interface TelefoneDto {
  phone_pk?: number
  client_pk?: number
  phone_identification?: string
  phone_number?: string
  phone_operator?: string
  phone_type?: number
  phone_sva?: number
  phone_status?: number
  phone_valid?: number
  phone_code?: string
}

export interface DetalheClienteResponse {
  success: boolean
  cliente: ClienteDto
  contratos: ContratoDto[]
  enderecos: EnderecoDto[]
  cpes: CpeComboDto[]
  telefones: TelefoneDto[]
}

export function buscarDetalheCliente(clientPk: number): Promise<DetalheClienteResponse> {
  return get<DetalheClienteResponse>(`clientes/${clientPk}`)
}

// phone/update exige o registro completo.
export function atualizarTelefone(phonePk: number, dados: TelefoneDto): Promise<{ success: boolean; results: unknown }> {
  return put(`telefones/${phonePk}`, dados)
}

// O backend completa os padrões do painel.
export function criarTelefone(dados: {
  client_pk: number
  phone_identification: string
  phone_number: string
}): Promise<{ success: boolean; results: unknown }> {
  return post('telefones', dados)
}

// ---------------------------------------------------------------------
// Endereço / localização
// ---------------------------------------------------------------------

export interface EnderecoPayload {
  // Obrigatórios no Controllr: reenviar os valores já carregados.
  client_pk?: number
  address?: string
  address_number?: string
  address_neighborhood?: string
  address_zipcode?: string
  address_province?: string
  address_state?: string
  address_siafi?: number
  address_default?: number
  address_completation?: string
  address_identification?: string
  address_latitude?: string
  address_longitude?: string
}

export function atualizarEndereco(
  addressPk: number,
  payload: EnderecoPayload,
): Promise<{ success: boolean; results: unknown }> {
  return put(`enderecos/${addressPk}`, payload)
}

// ---------------------------------------------------------------------
// Conexão (CPE)
// ---------------------------------------------------------------------

export interface CpeDto {
  pk?: number
  username?: string
  // Senha PPPoE (cpe_password). access_login/access_password é o acesso ao roteador.
  password?: string
  access_login?: string
  access_password?: string
  access_port?: number
  v4_ip?: string
  v4_ip_last?: string
  mac?: string
  // Último MAC visto, quando cpe_mac está vazio.
  mac_last?: string
  // Última autenticação do cliente (cpe_date_auth na API).
  date_auth?: string
  // Último accounting RADIUS: hora da queda de um cliente offline.
  date_acct?: string
  status?: number
  state?: number
  address?: string
  address_number?: string
  address_neighborhood?: string
  address_zipcode?: string
  address_latitude?: string
  address_longitude?: string
  client_complete_name?: string
  client_pk?: number
  contract_pk?: number
  contract_number?: number
  plan_name?: string
  dp_name?: string
  dp_pk?: number
  dp_port?: number
  obs?: string
  // contract_status (0 desativado … 5 cancelado) e sessões RADIUS abertas.
  contract_status?: number
  sessions?: number
  // Criptografia do Wi-Fi do CPE; tipo sem enum documentado.
  wifi_encryption_type?: number
  wifi_encryption_password?: string
}

export interface BuscaCpeResponse {
  success: boolean
  results: CpeDto[]
}

export function buscarCpe(
  filtro: { client_pk?: number; contract_pk?: number; cpe_pk?: number; username?: string; dp_pk?: number },
): Promise<BuscaCpeResponse> {
  return get<BuscaCpeResponse>('cpe/busca', filtro)
}

export interface SessaoOnlineResponse {
  success: boolean
  results: Record<string, unknown>[]
}

export function buscarSessaoOnlineCpe(cpePk: number): Promise<SessaoOnlineResponse> {
  return get<SessaoOnlineResponse>(`cpe/${cpePk}/sessao`)
}

// /aaa_ctl/session_history/list; rx/tx em KB.
export interface SessaoHistoricoDto {
  session_date_start?: string
  session_date_close?: string
  session_username?: string
  session_callingid?: string
  session_rx_byte?: number
  session_tx_byte?: number
  session_v4_ip?: string
  session_v6_px?: string
  session_v6_pd?: string
  session_acct_time?: number
  // Acct-Terminate-Cause (RFC 2866); 0 = sem causa.
  session_terminate_cause?: number
  session_nas_port_id?: string
}

export interface HistoricoSessoesResponse {
  success: boolean
  results: SessaoHistoricoDto[]
  // Sessões no período inteiro, não só nesta página.
  total?: number
}

export function buscarHistoricoSessoesCpe(
  cpePk: number,
  opcoes: { username?: string; dataInicio?: string; dataFim?: string; page?: number; limit?: number } = {},
): Promise<HistoricoSessoesResponse> {
  return get<HistoricoSessoesResponse>(`cpe/${cpePk}/historico-sessoes`, {
    username: opcoes.username,
    data_inicio: opcoes.dataInicio,
    data_fim: opcoes.dataFim,
    page: opcoes.page,
    limit: opcoes.limit,
  })
}

// Estado da tela antes de salvar, só para a auditoria.
export interface ContextoAuditoriaCpe {
  cliente?: string
  pppoe?: string
  wifi_tipo_anterior?: number
  senha_wifi_alterada?: boolean
  senha_wifi_anterior?: string
  login_anterior?: string
  porta_anterior?: number
  senha_acesso_alterada?: boolean
  senha_acesso_anterior?: string
}

export function atualizarWifiCpe(
  cpePk: number,
  dados: { wifi_encryption_type?: number; wifi_encryption_password?: string; auditoria?: ContextoAuditoriaCpe },
): Promise<{ success: boolean; results: unknown }> {
  return put(`cpe/${cpePk}/wifi`, dados)
}

export interface DetalhesCpePayload {
  cpe_obs?: string
  dp_pk?: number
  cpe_dp_port?: number
  cpe_access_login?: string
  cpe_access_password?: string
  cpe_access_port?: number
  auditoria?: ContextoAuditoriaCpe
}

export function atualizarDetalhesCpe(cpePk: number, dados: DetalhesCpePayload): Promise<{ success: boolean; results: unknown }> {
  return put(`cpe/${cpePk}/detalhes`, dados)
}

export interface ListarCpeOfflineResponse {
  success: boolean
  results: CpeDto[]
  total: number
}

// Contrato ativo, CPE habilitada e sem sessão RADIUS.
export function listarCpeOffline(opcoes: { start?: number; limit?: number } = {}): Promise<ListarCpeOfflineResponse> {
  return get<ListarCpeOfflineResponse>('cpe/offline', { start: opcoes.start ?? 0, limit: opcoes.limit ?? 20 })
}

export interface DpDto {
  pk: number
  name: string
  lat: number | null
  lng: number | null
  // Mesmos dados do "Mapa - Informações" do painel (Distribuição: Sim).
  cor: string | null
  limite: number | null
  ativos: number | null
  setor: string | null
  setor_pk?: number | null
  // dp_desc sem o "*" de vazio.
  descricao?: string | null
}

export function listarDps(): Promise<{ success: boolean; results: DpDto[] }> {
  return get<{ success: boolean; results: DpDto[] }>('dp/lista')
}

export interface SetorDpDto {
  pk: number
  nome: string
  // "FTTH-VSJ" → "VSJ"; null quando o nome não segue o padrão.
  sigla: string | null
}

/** Setores para a CTO nova (e as cores/capacidades que o servidor aceita). */
export function listarSetoresDp(): Promise<{
  success: boolean
  results: SetorDpDto[]
  capacidades: number[]
  // "{sigla}-CTO-{hub}.{numero}": padrão de nome do provedor.
  formato_nome?: string
}> {
  return get('dp/setores')
}

/** Posição, cor, capacidade e descrição. Depende da ACL do técnico (403 com mensagem). */
export function editarDp(
  dpPk: number,
  dados: { lat?: number; lng?: number; precisao_m?: number; cor?: string; limite?: number; descricao?: string },
): Promise<{ success: boolean }> {
  return post(`dp/${dpPk}/editar`, dados)
}

export function criarDp(dados: {
  setor_pk: number
  hub: number
  numero: number
  limite: number
  cor: string
  lat: number
  lng: number
  precisao_m?: number
  descricao?: string
}): Promise<{ success: boolean; nome: string }> {
  return post('dp/criar', dados)
}

// Projeto da rede (KMZ do servidor): só o entorno. coords em [lat, lng].
export interface ItemProjetoDto {
  tipo: 'ponto' | 'linha' | 'poligono'
  nome: string
  pasta: string
  cor: string | null
  coords: [number, number][]
}

export function buscarProjetoRede(
  lat: number,
  lng: number,
  raio = 1500,
): Promise<{ success: boolean; results: ItemProjetoDto[] }> {
  return get<{ success: boolean; results: ItemProjetoDto[] }>('mapa/projeto', { lat, lng, raio })
}

// ---------------------------------------------------------------------
// ONU
// ---------------------------------------------------------------------

export interface OnuDto {
  pk?: number
  sn?: string
  name?: string
  state?: string
  cmd_status?: number
  // ms desde a última coleta; zera em "Atualizar agora".
  info_timer?: number
  // time em "yyyy-mm-dd hh:mm:ss UTC-3" (ver formatarUltimaQueda).
  last_down_reason?: string
  last_down_time?: string
  omddm_rx_power?: number
  omddm_tx_power?: number
  omddm_temperature?: number
  omddm_voltage?: number
  distance?: number
  signal_alert?: number
  signal_warning?: number
  dp_name?: string
  olt_pk?: number
  olt_name?: string
  olt_omddm_rx_power?: number
  olt_omddm_tx_power?: number
  model?: string
  vendor?: string
  frame?: number
  slot?: number
  pon?: number
  id?: number
  cpe_pk?: number
  cpe_v4_ip_last?: string
  // Porta da CTO (fora da doc de onu/list).
  cpe_dp_port?: number
  client_name?: string
  client_pk?: number
  contract_pk?: number
  contract_number?: number
  // PPPoE configurado na própria ONU.
  wancfg_pppoe_username?: string
  wancfg_pppoe_passwd?: string
  // WAN reenviada ao associar cliente: apply_wan exige o registro completo.
  wancfg_pppoe_svcname?: string
  wancfg_conntype?: number
  wan_tpl_pk?: number
  wancfg_vlanid?: number
  wancfg_user_vlanid?: number
  wancfg_cos?: number
  wancfg_tcont?: number
  wancfg_gemport?: number
  wancfg_svlan?: number
  wancfg_stpid?: number
  wancfg_scos?: number
  wancfg_pon_profile?: string
  wancfg_local_ip?: string
  // Wi-Fi e acesso web da ONU.
  wificfg_name?: string
  wificfg_password?: string
  webcfg_login?: string
  webcfg_password?: string
}

export interface BuscaOnuResponse {
  success: boolean
  results: OnuDto[]
}

/** 0 dBm não é leitura real: vira "sem leitura". */
export function normalizarSinalOnu(onu: OnuDto): OnuDto {
  const semZero = (rx: number | undefined) => (rx === 0 ? undefined : rx)
  return { ...onu, omddm_rx_power: semZero(onu.omddm_rx_power), olt_omddm_rx_power: semZero(onu.olt_omddm_rx_power) }
}

export async function buscarOnu(
  filtro: { serial?: string; username?: string; cpe_pk?: number; olt_pk?: number },
): Promise<BuscaOnuResponse> {
  const resposta = await get<BuscaOnuResponse>('onu/busca', filtro)
  return { ...resposta, results: (resposta.results ?? []).map(normalizarSinalOnu) }
}

export function atualizarInfoOnu(
  onuPk: number,
  parametros: { olt_pk: number; onu_serial: string; slot_id: number; port_id: number; onu_id: number; frame_id?: number },
): Promise<{ success: boolean; results: unknown }> {
  // Parâmetros por querystring.
  const query = querystring({ ...parametros, frame_id: parametros.frame_id ?? 1 })
  return post(`onu/${onuPk}/atualizar${query}`)
}

interface OspoOnu {
  olt_pk: number
  slot_id: number
  port_id: number
  onu_id: number
  frame_id?: number
  // Só para a auditoria: como a ONU aparece na tela no momento da ação.
  olt_nome?: string
  onu_serial?: string
}

export function reiniciarOnu(onuPk: number, parametros: OspoOnu): Promise<{ success: boolean; results: unknown }> {
  const query = querystring({ ...parametros, frame_id: parametros.frame_id ?? 1 })
  return post(`onu/${onuPk}/reiniciar${query}`)
}

export function removerOnu(onuPk: number, parametros: OspoOnu): Promise<{ success: boolean; results: unknown }> {
  const query = querystring({ ...parametros, frame_id: parametros.frame_id ?? 1 })
  return post(`onu/${onuPk}/remover${query}`)
}

export function renomearOnu(
  onuPk: number,
  parametros: OspoOnu & { onu_name: string; nome_anterior?: string },
): Promise<{ success: boolean; results: unknown }> {
  const query = querystring({ ...parametros, frame_id: parametros.frame_id ?? 1 })
  return post(`onu/${onuPk}/renomear${query}`)
}

export interface AssociarClienteOnuPayload extends OspoOnu {
  client_pk: number
  // Conexão escolhida pelo técnico.
  cpe_pk: number
  onu_serial: string
  wancfg_conntype?: number
  wan_tpl_pk?: number
  wancfg_vlanid?: number
  wancfg_user_vlanid?: number
  wancfg_cos?: number
  wancfg_tcont?: number
  wancfg_gemport?: number
  wancfg_svlan?: number
  wancfg_stpid?: number
  wancfg_scos?: number
  wancfg_pon_profile?: string
  wancfg_pppoe_svcname?: string
  wancfg_local_ip?: string
  // Como a ONU estava na tela — só vai para a auditoria (onu.py).
  auditoria?: { olt_nome?: string; cliente_anterior?: string; pppoe_anterior?: string }
}

export function associarClienteOnu(
  onuPk: number,
  dados: AssociarClienteOnuPayload,
): Promise<{ success: boolean; results: unknown }> {
  return post(`onu/${onuPk}/associar-cliente`, dados)
}

// ---------------------------------------------------------------------
// Suporte / Tickets: o chamado do cliente; as OS ficam na seção abaixo.
// ---------------------------------------------------------------------

export interface TicketDto {
  ticket_pk?: number
  ticket_protocol?: string
  ticket_title?: string
  ticket_desc?: string
  ticket_status?: number
  ticket_date_create?: string
  ticket_date_last?: string
  ticket_date_close?: string
  category_name?: string
  contract_number?: number
  // apidoc.brbyte.com/#post-/support_ctl/ticket/list
  client_pk?: number
  client_complete_name?: string
  address_pk?: number
}

export function detalheTicket(ticketPk: number): Promise<{ success: boolean; ticket: TicketDto }> {
  return get(`suporte/tickets/${ticketPk}`)
}

export interface OperacaoDto {
  op_pk?: number
  op_desc?: string
  op_file?: string
  op_date_create?: string
  op_type?: number
  op_code?: number
  op_client?: boolean
  // Eventos de etapa da OS: op_os_pk = op_pk da OS raiz; a etapa vale pelo evento mais recente de cada tipo.
  op_os_pk?: number
  op_date_answer?: string
  op_date_start?: string
  op_date_finish?: string
}

export function listarMensagensTicket(ticketPk: number): Promise<{ success: boolean; results: OperacaoDto[] }> {
  return get(`suporte/tickets/${ticketPk}/mensagens`)
}

export function criarMensagemTicket(ticketPk: number, opDesc: string): Promise<{ success: boolean; results: unknown }> {
  return post(`suporte/tickets/${ticketPk}/mensagens`, { op_desc: opDesc })
}

export async function enviarAnexoTicket(ticketPk: number, arquivo: File): Promise<{ success: boolean; results: unknown }> {
  const form = new FormData()
  form.append('file', arquivo)
  return postForm(`suporte/tickets/${ticketPk}/anexos`, form)
}

// ---------------------------------------------------------------------
// Ordem de Serviço: trabalho de campo do técnico (staff_username).
// ---------------------------------------------------------------------

export interface OrdemServicoDto {
  op_pk?: number
  // Etapa calculada pelo backend (só na lista em aberto).
  etapa?: 'agendada' | 'respondida' | 'iniciada'
  op_os_pk?: number
  // Número legível da OS (não é op_pk nem ticket_protocol).
  op_number?: string
  ticket_pk?: number
  op_date_sched?: string
  op_date_create?: string
  op_date_answer?: string
  op_date_start?: string
  op_date_finish?: string
  op_date_close?: string
  op_date_cancel?: string
  op_status?: number
  op_priority?: number
  op_desc?: string
  op_obs?: string
  op_client_show?: boolean
  address_pk?: number
  user_pk?: number
  staff_pk?: number
  // Login do técnico que executa a OS ("Minhas OS" compara com o login no app).
  staff_username?: string
  task_pk?: number
  // Tipo de serviço definido pelo escritório (fora da doc).
  task_name?: string
  // Cliente, contrato e endereço já vêm na OS.
  client_pk?: number
  client_complete_name?: string
  contract_pk?: number
  contract_number?: number
  ticket_protocol?: string
  address_identification?: string
  address?: string
  address_number?: string
  address_neighborhood?: string
  address_province?: string
  address_state?: string
  address_zipcode?: string
  address_completation?: string
}

export interface ListarOrdensServicoResponse {
  success: boolean
  results: OrdemServicoDto[]
  total: number
  // Total do Controllr antes dos filtros do backend (controla a paginação).
  total_controllr?: number
}

/** Todas as OS, em páginas de 100, até cobrir o total do Controllr. */
export function listarTodasOrdensServico(
  opcoes: { minhas?: boolean; abertas?: boolean },
): Promise<OrdemServicoDto[]> {
  return buscarTodasPaginas(async (start, limit) => {
    const resposta = await listarOrdensServico({ ...opcoes, start, limit })
    return { results: resposta.results, totalBruto: resposta.total_controllr }
  }, 100)
}

export function listarOrdensServico(
  opcoes: { minhas?: boolean; abertas?: boolean; ticketPk?: number; start?: number; limit?: number },
): Promise<ListarOrdensServicoResponse> {
  return get<ListarOrdensServicoResponse>('os', {
    minhas: opcoes.minhas ?? true,
    abertas: opcoes.abertas ?? true,
    ticket_pk: opcoes.ticketPk,
    start: opcoes.start ?? 0,
    limit: opcoes.limit ?? 20,
  })
}

/** OS do dia (AAAA-MM-DD) e concluídas. */
export function resumoDoDia(data: string): Promise<{ success: boolean; total: number; concluidas: number }> {
  return get('os/resumo-dia', { data })
}

// Etapas do técnico: responder, iniciar e finalizar. Fechar é só do escritório.
export function responderOrdemServico(
  ticketPk: number,
  parametros: { opOsPk: number; opDesc?: string },
): Promise<{ success: boolean; results: unknown }> {
  return post(`os/${ticketPk}/responder`, { op_os_pk: parametros.opOsPk, op_desc: parametros.opDesc })
}

export function iniciarOrdemServico(
  ticketPk: number,
  parametros: { opOsPk: number; opDesc?: string },
): Promise<{ success: boolean; results: unknown }> {
  return post(`os/${ticketPk}/iniciar`, { op_os_pk: parametros.opOsPk, op_desc: parametros.opDesc })
}

export function finalizarOrdemServico(
  ticketPk: number,
  // onuSerial: o servidor registra o sinal na auditoria.
  parametros: { opOsPk: number; opDesc?: string; onuSerial?: string },
): Promise<{ success: boolean; results: unknown }> {
  return post(`os/${ticketPk}/finalizar`, {
    op_os_pk: parametros.opOsPk,
    op_desc: parametros.opDesc,
    onu_serial: parametros.onuSerial || undefined,
  })
}

// Desfazer exige op_desc.
export function desfazerRespostaOrdemServico(
  ticketPk: number,
  parametros: { opOsPk: number; opDesc: string },
): Promise<{ success: boolean; results: unknown }> {
  return post(`os/${ticketPk}/desfazer-resposta`, { op_os_pk: parametros.opOsPk, op_desc: parametros.opDesc })
}

export function desfazerInicioOrdemServico(
  ticketPk: number,
  parametros: { opOsPk: number; opDesc: string },
): Promise<{ success: boolean; results: unknown }> {
  return post(`os/${ticketPk}/desfazer-inicio`, { op_os_pk: parametros.opOsPk, op_desc: parametros.opDesc })
}

export function desfazerFinalizacaoOrdemServico(
  ticketPk: number,
  parametros: { opOsPk: number; opDesc: string },
): Promise<{ success: boolean; results: unknown }> {
  return post(`os/${ticketPk}/desfazer-finalizacao`, { op_os_pk: parametros.opOsPk, op_desc: parametros.opDesc })
}

// ---------------------------------------------------------------------
// Financeiro: faturas e pagamentos em observação. 403 = sem ACL.
// ---------------------------------------------------------------------

export interface FaturaDto {
  invoice_pk?: number
  contract_pk?: number
  contract_number?: number
  invoice_nosso_num?: string
  invoice_document_number?: string
  invoice_date_due?: string
  invoice_date_document?: string
  // Vazio = não paga.
  invoice_date_credit?: string
  invoice_amount_document?: number
  invoice_amount_paid?: number
  invoice_late?: boolean
  invoice_deleted?: boolean
  // Presentes quando há observação ativa.
  obs_pk?: number
  obs_date_end?: string
}

export interface ListarFaturasResponse {
  success: boolean
  results: FaturaDto[]
  total: number
}

export function listarFaturas(
  clientPk: number,
  opcoes: { start?: number; limit?: number } = {},
): Promise<ListarFaturasResponse> {
  return get<ListarFaturasResponse>('financeiro/faturas', {
    client_pk: clientPk,
    start: opcoes.start ?? 0,
    limit: opcoes.limit ?? 30,
  })
}

export interface CriarObservacaoPayload {
  client_pk: number
  contract_pk: number
  invoice_pk: number
  obs_text: string
  // Exatamente um dos dois ("Liberar Tipo").
  obs_release_date?: string
  obs_period_dias?: number
}

export function criarObservacaoFatura(payload: CriarObservacaoPayload): Promise<{ success: boolean; results: unknown }> {
  return post('financeiro/observacoes', payload)
}

// ---------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------

export interface MeuIpResponse {
  success: boolean
  ip: string
  location?: {
    country?: string
    region?: string
    city?: string
    postalCode?: string
    timezone?: string
  }
  isp?: string
  as_info?: {
    asn?: number
    name?: string
    domain?: string
    type?: string
  }
}

// Geolocalização do IP (sem ip, o backend usa o da conexão). Chave só no servidor.
export function consultarMeuIp(ip?: string): Promise<MeuIpResponse> {
  return get<MeuIpResponse>('ferramentas/meu-ip', { ip })
}

// CEP pelo ViaCEP; campos vazios vêm null.
export interface CepResponse {
  success: boolean
  cep: string
  address: string | null
  address_neighborhood: string | null
  address_province: string | null
  address_state: string | null
  address_siafi: number | null
}

export function consultarCep(cep: string): Promise<CepResponse> {
  return get<CepResponse>(`ferramentas/cep/${encodeURIComponent(cep)}`)
}

// ---------------------------------------------------------------------
// Auditoria (usuários em AUDITORIA_USUARIOS)
// ---------------------------------------------------------------------

export interface EventoAuditoria {
  quando: string
  tecnico: string
  user_pk?: number | null
  ip: string
  acao: string
  alvo: Record<string, unknown>
  // Localização do técnico na ação (só ações de campo).
  local?: { lat: number; lng: number; precisao_m: number; idade_s: number } | null
}

export function acessoAuditoria(): Promise<{ permitido: boolean }> {
  return get<{ permitido: boolean }>('auditoria/acesso')
}

export function listarAuditoria(filtro: {
  tecnico?: string
  acao?: string
  de?: string
  ate?: string
  limite?: number
  // Cliente, PPPoE, serial ou número do chamado/OS.
  busca?: string
}): Promise<{ eventos: EventoAuditoria[]; mais: boolean }> {
  return get<{ eventos: EventoAuditoria[]; mais: boolean }>('auditoria', filtro)
}

// ---------------------------------------------------------------------
// Avisos de OS nova (Web Push)
// ---------------------------------------------------------------------

export function configAvisos(): Promise<{ disponivel: boolean; chave: string }> {
  return get<{ disponivel: boolean; chave: string }>('avisos/config')
}

// confirmar: envia um aviso de teste (só ao ligar).
export function inscreverAvisos(inscricao: PushSubscriptionJSON, confirmar = false): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('avisos/inscricao', { endpoint: inscricao.endpoint, keys: inscricao.keys, confirmar })
}

export function removerAvisos(endpoint: string): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('avisos/remover', { endpoint })
}
