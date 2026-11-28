import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LuCable, LuPower, LuRefreshCw, LuTrash2 } from 'react-icons/lu'
import { ApiError, atualizarInfoOnu, buscarOnu, reiniciarOnu, removerOnu, renomearOnu, type OnuDto } from '../api/client'
import Abas, { useAbaLembrada, type Aba } from '../components/Abas'
import CabecalhoTela from '../components/CabecalhoTela'
import PullToRefresh from '../components/PullToRefresh'
import Skeleton from '../components/Skeleton'
import EstadoVazio from '../components/EstadoVazio'
import EstadoErro from '../components/EstadoErro'
import { useToast } from '../components/Toast/useToast'
import { CORES } from '../utils/cores'
import BuscaOnu from './onu/BuscaOnu'
import CardDetalhesOnu from './onu/CardDetalhesOnu'
import CardsCredenciais from './onu/CardsCredenciais'
import CardsSinal from './onu/CardsSinal'
import { formatarTempoDesdeColeta } from './onu/formato'
import { ModalConfirmarAcao, ModalRenomear } from './onu/ModaisAcaoOnu'
import ModalRegistrarCliente from './onu/ModalRegistrarCliente'
import './OnuStatus.css'
import BarraAtendimento from '../components/BarraAtendimento'

type AbaOnu = 'sinal' | 'credenciais' | 'equipamento'

// Reiniciar/remover longe do toque acidental.
const ABAS: Aba<AbaOnu>[] = [
  { chave: 'sinal', rotulo: 'Sinal' },
  { chave: 'credenciais', rotulo: 'Credenciais' },
  { chave: 'equipamento', rotulo: 'Equipamento' },
]

/** ONU: sinal, status e ações; cartões e modais em pages/onu/. */
export default function OnuStatus() {
  const [params, setParams] = useSearchParams()
  const cpePkParam = params.get('cpe_pk')
  const usernameParam = params.get('username')
  const serialParam = params.get('serial')
  // PPPoE é o jeito confiável de achar a ONU (cpe_pk é ambíguo); tem prioridade.
  const temParametroInicial = !!usernameParam || !!serialParam || !!cpePkParam
  const { toast } = useToast()
  const [aba, setAba] = useAbaLembrada('webnet-tecnico-aba-onu', ABAS)

  function buscarInicial() {
    if (usernameParam) return buscarOnu({ username: usernameParam })
    if (serialParam) return buscarOnu({ serial: serialParam })
    return buscarOnu({ cpe_pk: Number(cpePkParam) })
  }

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [onu, setOnu] = useState<OnuDto | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  // Reiniciar/remover (sem doc), com confirmação.
  const [confirmandoAcao, setConfirmandoAcao] = useState<'reiniciar' | 'remover' | null>(null)
  const [executandoAcao, setExecutandoAcao] = useState(false)
  const [registrandoCliente, setRegistrandoCliente] = useState(false)
  // Nome atual ao abrir o "Renomear"; null = modal fechado.
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [salvandoNome, setSalvandoNome] = useState(false)
  // Relê a ONU antes de agir: a 1ª leitura às vezes traz OSPO incompleto.
  const [atualizandoAntesDaAcao, setAtualizandoAntesDaAcao] = useState(false)

  useEffect(() => {
    if (!temParametroInicial) {
      setCarregando(false)
      return
    }
    carregar(buscarInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpePkParam, usernameParam, serialParam])

  async function carregar(chamada: () => ReturnType<typeof buscarOnu>) {
    setCarregando(true)
    setErro(null)
    try {
      const resposta = await chamada()
      setOnu(resposta.results[0] ?? null)
    } catch (excecao) {
      setErro(excecao instanceof ApiError ? excecao.message : 'Não foi possível carregar o status da ONU.')
    } finally {
      setCarregando(false)
    }
  }

  async function atualizarAgora() {
    // onu.pk 0 é válido (ONU sem cliente).
    if (!onu || onu.pk == null || onu.olt_pk == null || !onu.sn || onu.slot == null || onu.pon == null || onu.id == null) {
      toast('Dados insuficientes para atualizar esta ONU.')
      return
    }
    setAtualizando(true)
    toast('Reconectando a OLT e aguardando atualizar — isso leva cerca de 1 minuto.', 'info')
    try {
      await atualizarInfoOnu(onu.pk, {
        olt_pk: onu.olt_pk,
        onu_serial: onu.sn,
        slot_id: onu.slot,
        port_id: onu.pon,
        onu_id: onu.id,
        frame_id: onu.frame ?? 1,
      })
      if (temParametroInicial) await carregar(buscarInicial)
      else if (onu.sn) await carregar(() => buscarOnu({ serial: onu.sn }))
      toast('ONU atualizada.', 'sucesso')
    } catch (excecao) {
      toast(excecao instanceof ApiError ? excecao.message : 'Não foi possível atualizar a ONU.')
    } finally {
      setAtualizando(false)
    }
  }

  function dadosOspo() {
    if (!onu || onu.olt_pk == null || onu.slot == null || onu.pon == null || onu.id == null) return null
    return {
      olt_pk: onu.olt_pk,
      slot_id: onu.slot,
      port_id: onu.pon,
      onu_id: onu.id,
      frame_id: onu.frame ?? 1,
      olt_nome: onu.olt_name,
      onu_serial: onu.sn,
    }
  }

  async function recarregarOnuAtual(): Promise<OnuDto | null> {
    if (temParametroInicial) {
      const resposta = await buscarInicial()
      const atualizada = resposta.results[0] ?? null
      setOnu(atualizada)
      return atualizada
    }
    if (onu?.sn) {
      const resposta = await buscarOnu({ serial: onu.sn })
      const atualizada = resposta.results[0] ?? null
      setOnu(atualizada)
      return atualizada
    }
    return onu
  }

  /** Relê a ONU e, se veio, abre a ação; senão avisa. */
  async function abrirDepoisDeReler(abrir: (atualizada: OnuDto) => void) {
    setAtualizandoAntesDaAcao(true)
    try {
      const atualizada = await recarregarOnuAtual()
      if (!atualizada) {
        toast('Não foi possível atualizar os dados da ONU.')
        return
      }
      abrir(atualizada)
    } catch {
      toast('Não foi possível atualizar os dados da ONU.')
    } finally {
      setAtualizandoAntesDaAcao(false)
    }
  }

  async function confirmarRenomear(nome: string) {
    const ospo = dadosOspo()
    if (!onu || onu.pk == null || !ospo || !nome) {
      toast('Informe um nome válido para a ONU.')
      return
    }
    setSalvandoNome(true)
    try {
      await renomearOnu(onu.pk, { ...ospo, onu_name: nome, nome_anterior: onu.name })
      setOnu((atual) => (atual ? { ...atual, name: nome } : atual))
      setRenomeando(null)
      toast('ONU renomeada.', 'sucesso')
    } catch (excecao) {
      toast(excecao instanceof ApiError ? excecao.message : 'Não foi possível renomear a ONU.')
    } finally {
      setSalvandoNome(false)
    }
  }

  async function executarAcao() {
    const acao = confirmandoAcao
    const ospo = dadosOspo()
    if (!acao || !onu || onu.pk == null || !ospo) {
      toast('Dados insuficientes para executar esta ação.')
      setConfirmandoAcao(null)
      return
    }
    setExecutandoAcao(true)
    try {
      if (acao === 'reiniciar') {
        await reiniciarOnu(onu.pk, ospo)
        toast('ONU reiniciada.', 'sucesso')
      } else {
        await removerOnu(onu.pk, ospo)
        toast('ONU removida do registro.', 'sucesso')
        setOnu(null)
        setParams({}, { replace: true })
      }
      setConfirmandoAcao(null)
    } catch (excecao) {
      toast(
        excecao instanceof ApiError
          ? excecao.message
          : `Não foi possível ${acao === 'reiniciar' ? 'reiniciar' : 'remover'} a ONU.`,
      )
    } finally {
      setExecutandoAcao(false)
    }
  }

  const semSelecao = !temParametroInicial && !onu && !carregando
  const tempoDesdeColeta = onu ? formatarTempoDesdeColeta(onu.info_timer) : null

  // Relê sem reconectar a OLT.
  async function recarregar() {
    if (temParametroInicial) await carregar(buscarInicial)
  }

  return (
    <PullToRefresh aoAtualizar={recarregar}>
      <div className="onu-tela tela-entrada">
        <BarraAtendimento
          tela="onu"
          dados={
            onu
              ? { clientPk: onu.client_pk, cliente: onu.client_name, cpePk: onu.cpe_pk, pppoe: onu.wancfg_pppoe_username || usernameParam || undefined }
              : usernameParam
                ? { pppoe: usernameParam }
                : cpePkParam
                  ? { cpePk: Number(cpePkParam) }
                  : null
          }
        />
        {/* Título só na tela geral (busca); aberta para um cliente, a barra
            do atendimento já marca onde se está. */}
        {!temParametroInicial && <CabecalhoTela icone={LuCable} cor={CORES.onu} titulo="ONU" />}

        {/* Busca só sem ONU escolhida, como na Conexão: aberta pela barra do
            atendimento ou por um atalho, a tela já vem com a ONU. Escolher
            troca a busca pelo resultado: "Voltar" sai da aba. */}
        {!temParametroInicial && <BuscaOnu onEscolher={(parametros) => setParams(parametros, { replace: true })} />}

        {semSelecao && !erro && (
          <EstadoVazio
            icone={LuCable}
            titulo="Busque pelo serial da ONU ou pelo usuário PPPoE"
            subtitulo="Ou acesse esta tela a partir dos detalhes de um cliente."
          />
        )}

        {carregando && (
          <div className="onu-card">
            <Skeleton width="50%" height={16} />
            <Skeleton width="70%" height={13} />
          </div>
        )}

        {!carregando && erro && (
          <EstadoErro mensagem={erro} onTentarDeNovo={() => carregar(buscarInicial)} />
        )}

        {temParametroInicial && !carregando && !erro && !onu && (
          <EstadoVazio icone={LuCable} titulo="Nenhuma ONU encontrada para esta conexão." />
        )}

        {!carregando && !erro && onu && (
          <>
            <Abas abas={ABAS} ativa={aba} onEscolher={setAba} rotulo="Partes da ONU" />

            {aba === 'sinal' && (
              <>
                <CardsSinal onu={onu} />
                {!atualizando && tempoDesdeColeta && <p className="onu-ultima-coleta">Dados coletados {tempoDesdeColeta}</p>}
                <button
                  className="botao botao-secundario botao-bloco"
                  onClick={atualizarAgora}
                  disabled={atualizando}
                >
                  <LuRefreshCw size={20} className={atualizando ? 'onu-girando' : ''} />{' '}
                  {atualizando ? 'Reconectando OLT… (~1 min)' : 'Atualizar agora'}
                </button>
              </>
            )}

            {aba === 'credenciais' && <CardsCredenciais key={onu.pk} onu={onu} />}

            {aba === 'equipamento' && (
              <>
                <CardDetalhesOnu
                  onu={onu}
                  ocupado={atualizandoAntesDaAcao}
                  onRegistrarCliente={() => abrirDepoisDeReler(() => setRegistrandoCliente(true))}
                  onRenomear={() => abrirDepoisDeReler((atualizada) => setRenomeando(atualizada.name ?? ''))}
                />

                <div className="onu-acoes-onu">
                  <button
                    type="button"
                    className="botao botao-secundario"
                    onClick={() => abrirDepoisDeReler(() => setConfirmandoAcao('reiniciar'))}
                    disabled={executandoAcao || atualizandoAntesDaAcao}
                  >
                    <LuPower size={16} /> Reiniciar ONU
                  </button>
                  <button
                    type="button"
                    className="botao botao-perigo"
                    onClick={() => abrirDepoisDeReler(() => setConfirmandoAcao('remover'))}
                    disabled={executandoAcao || atualizandoAntesDaAcao}
                  >
                    <LuTrash2 size={16} /> Remover ONU
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {confirmandoAcao && (
          <ModalConfirmarAcao
            acao={confirmandoAcao}
            executando={executandoAcao}
            onConfirmar={executarAcao}
            onCancelar={() => setConfirmandoAcao(null)}
          />
        )}

        {renomeando !== null && (
          <ModalRenomear
            nomeAtual={renomeando}
            salvando={salvandoNome}
            onSalvar={confirmarRenomear}
            onCancelar={() => setRenomeando(null)}
          />
        )}

        {registrandoCliente && onu && (
          <ModalRegistrarCliente
            onu={onu}
            onFechar={() => setRegistrandoCliente(false)}
            onAssociado={(clientPk, clientNome) => {
              setRegistrandoCliente(false)
              setOnu((atual) => (atual ? { ...atual, client_pk: clientPk, client_name: clientNome } : atual))
              toast('ONU associada ao cliente com sucesso.', 'sucesso')
            }}
          />
        )}
      </div>
    </PullToRefresh>
  )
}
