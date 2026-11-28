import { lazy, Suspense, useRef, useState, type ChangeEvent } from 'react'
import { LuExternalLink, LuLocateFixed, LuMapPin } from 'react-icons/lu'
import { soDigitos } from '../utils/formatacao'
import Abas, { type Aba } from './Abas'
import {
  formatarDistancia,
  obterMelhorLocalizacao,
  PRECISAO_MAXIMA_ACEITAVEL_M,
  PRECISAO_SUFICIENTE_M,
} from '../pages/conexao/localizacao'
import { ApiError, atualizarEndereco, consultarCep, type EnderecoDto } from '../api/client'
import { useToast } from './Toast/useToast'
import './ModalEditarEndereco.css'
import { useFecharComVoltar } from '../hooks/useFecharComVoltar'

interface Props {
  endereco: EnderecoDto
  // Aba aberta ao entrar (ex.: "Marcar localização" abre direto na Localização).
  abaInicial?: AbaEndereco
  onFechar: () => void
  onSalvo: (endereco: EnderecoDto) => void
}

// Tela cheia em duas partes: cada uma cabe na tela do celular sem rolar.
export type AbaEndereco = 'endereco' | 'localizacao'
const ABAS: Aba<AbaEndereco>[] = [
  { chave: 'endereco', rotulo: 'Endereço' },
  { chave: 'localizacao', rotulo: 'Localização' },
]

// Leaflet só carrega quando o endereço tem coordenada.
const MapaEndereco = lazy(() => import('./MapaEndereco'))

// Máscara enquanto digita (00000-000); o formulário guarda só os dígitos.
function mascararCep(valor: string | null | undefined): string {
  const d = soDigitos(valor).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

const CAMPOS_EDITAVEIS: (keyof EnderecoDto)[] = [
  'address_identification',
  'address',
  'address_number',
  'address_zipcode',
  'address_neighborhood',
  'address_province',
  'address_state',
  'address_completation',
  'address_latitude',
  'address_longitude',
  'address_siafi',
]

export default function ModalEditarEndereco({ endereco, abaInicial = 'endereco', onFechar, onSalvo }: Props) {
  const [form, setForm] = useState<EnderecoDto>(endereco)
  const [aba, setAba] = useState<AbaEndereco>(abaInicial)
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const ultimoCepConsultadoRef = useRef(soDigitos(endereco.address_zipcode))
  const janelaRef = useRef<HTMLDivElement>(null)

  const alterado = CAMPOS_EDITAVEIS.some((chave) => (form[chave] ?? '') !== (endereco[chave] ?? ''))

  // Fechar com alterações pede confirmação.
  function tentarFechar() {
    if (!alterado) {
      onFechar()
      return
    }
    // O arrastar para baixo já deslizou a janela para fora: volta ao lugar.
    if (janelaRef.current) janelaRef.current.style.transform = ''
    setConfirmandoDescarte(true)
  }

  // "Voltar" do celular: fecha a janela ou, na confirmação, continua editando.
  useFecharComVoltar(!confirmandoDescarte, tentarFechar)
  useFecharComVoltar(confirmandoDescarte, () => setConfirmandoDescarte(false))
  const [salvando, setSalvando] = useState(false)
  const [capturandoLocalizacao, setCapturandoLocalizacao] = useState(false)
  const { toast } = useToast()

  // null quando a coordenada veio do cadastro.
  const [precisaoM, setPrecisaoM] = useState<number | null>(null)
  // Melhor precisão até agora, enquanto a captura ainda está em andamento.
  const [precisaoParcialM, setPrecisaoParcialM] = useState<number | null>(null)

  // GPS do técnico na casa do cliente, melhor leitura da janela.
  async function capturarLocalizacaoAtual() {
    if (!navigator.geolocation) {
      toast('Este navegador não suporta captura de localização.')
      return
    }
    setCapturandoLocalizacao(true)
    setPrecisaoParcialM(null)
    try {
      const posicao = await obterMelhorLocalizacao({
        pararComPrecisaoM: PRECISAO_SUFICIENTE_M,
        aoMelhorar: (parcial) => setPrecisaoParcialM(parcial.coords.accuracy),
      })
      setForm((atual) => ({
        ...atual,
        address_latitude: posicao.coords.latitude.toFixed(7),
        address_longitude: posicao.coords.longitude.toFixed(7),
      }))
      setPrecisaoM(posicao.coords.accuracy)
    } catch {
      toast('Não foi possível obter a localização. Verifique a permissão do navegador.')
    } finally {
      setCapturandoLocalizacao(false)
    }
  }

  const temCoordenada = Boolean(form.address_latitude && form.address_longitude)
  const precisaoRuim = precisaoM !== null && precisaoM > PRECISAO_MAXIMA_ACEITAVEL_M

  async function salvar() {
    if (!endereco.address_pk) return
    setSalvando(true)
    try {
      await atualizarEndereco(endereco.address_pk, {
        // Obrigatórios no Controllr, reenviados como vieram.
        client_pk: form.client_pk,
        address_siafi: form.address_siafi,
        address_default: form.address_default,
        address: form.address,
        address_number: form.address_number,
        address_neighborhood: form.address_neighborhood,
        address_zipcode: form.address_zipcode,
        address_province: form.address_province,
        address_state: form.address_state,
        address_completation: form.address_completation,
        address_identification: form.address_identification,
        address_latitude: form.address_latitude,
        address_longitude: form.address_longitude,
      })
      onSalvo(form)
    } catch (excecao) {
      toast(excecao instanceof ApiError ? excecao.message : 'Não foi possível salvar o endereço.')
    } finally {
      setSalvando(false)
    }
  }

  // CEP completo preenche logradouro, bairro, cidade, UF e siafi (logradouro e bairro só se o CEP trouxer).
  async function aoMudarCep(e: ChangeEvent<HTMLInputElement>) {
    const digitos = soDigitos(e.target.value).slice(0, 8)
    setForm((atual) => ({ ...atual, address_zipcode: digitos }))
    if (digitos.length !== 8 || digitos === ultimoCepConsultadoRef.current) return
    ultimoCepConsultadoRef.current = digitos
    setBuscandoCep(true)
    try {
      const cep = await consultarCep(digitos)
      setForm((atual) => {
        if (soDigitos(atual.address_zipcode) !== digitos) return atual
        return {
          ...atual,
          address: cep.address ?? atual.address,
          address_neighborhood: cep.address_neighborhood ?? atual.address_neighborhood,
          address_province: cep.address_province ?? atual.address_province,
          address_state: cep.address_state ?? atual.address_state,
          address_siafi: cep.address_siafi ?? atual.address_siafi,
        }
      })
      toast('Endereço preenchido pelo CEP. Confira o número.', 'sucesso')
    } catch (excecao) {
      toast(excecao instanceof ApiError ? excecao.message : 'Não foi possível consultar o CEP.')
    } finally {
      setBuscandoCep(false)
    }
  }

  function campo<K extends keyof EnderecoDto>(chave: K) {
    return {
      value: (form[chave] as string) ?? '',
      onChange: (e: ChangeEvent<HTMLInputElement>) => setForm((atual) => ({ ...atual, [chave]: e.target.value })),
    }
  }

  return (
    <div className="modal-editar-endereco-fundo" onClick={tentarFechar}>
      <div ref={janelaRef} className="modal-editar-endereco" onClick={(e) => e.stopPropagation()}>
        <div className="modal-editar-endereco-topo">
          <h2>Editar endereço</h2>
          <Abas abas={ABAS} ativa={aba} onEscolher={setAba} rotulo="Partes do endereço" />
        </div>

        <div className={`modal-editar-endereco-corpo aba-${aba}`}>
        {aba === 'endereco' && (
        <>
        <label>Identificação</label>
        <input {...campo('address_identification')} placeholder="Ex: Endereço padrão" />

        <label>Logradouro</label>
        <input {...campo('address')} placeholder="Rua, avenida…" />

        <div className="modal-editar-endereco-linha">
          <div>
            <label>Número</label>
            <input {...campo('address_number')} />
          </div>
          <div>
            <label>CEP{buscandoCep && <span className="modal-editar-endereco-buscando"> · buscando…</span>}</label>
            <input
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              value={mascararCep(form.address_zipcode)}
              onChange={aoMudarCep}
              aria-busy={buscandoCep}
            />
          </div>
        </div>

        <label>Bairro</label>
        <input {...campo('address_neighborhood')} />

        <div className="modal-editar-endereco-linha uf">
          <div>
            <label>Cidade</label>
            <input {...campo('address_province')} />
          </div>
          <div>
            <label>UF</label>
            <input
              value={form.address_state ?? ''}
              onChange={(e) => setForm((atual) => ({ ...atual, address_state: e.target.value.toUpperCase() }))}
              maxLength={2}
              autoCapitalize="characters"
            />
          </div>
        </div>

        <label>Complemento</label>
        <textarea
          className="modal-editar-endereco-complemento"
          rows={3}
          value={form.address_completation ?? ''}
          onChange={(e) =>
            setForm((atual) => ({ ...atual, address_completation: e.target.value.replace(/\s*\n\s*/g, ' ') }))
          }
          placeholder="Ex: casa azul, ao lado da padaria"
        />
        </>
        )}

        {aba === 'localizacao' && (
        <div className={`modal-editar-endereco-localizacao${temCoordenada ? ' com-coordenada' : ''}`}>
          <div className="modal-editar-endereco-localizacao-topo">
            <span className="modal-editar-endereco-localizacao-icone">
              <LuMapPin size={20} />
            </span>
            <div className="modal-editar-endereco-localizacao-texto">
              <strong>
                {capturandoLocalizacao
                  ? 'Obtendo sua posição…'
                  : temCoordenada
                    ? precisaoM !== null
                      ? 'Posição capturada'
                      : 'Posição cadastrada'
                    : 'Sem posição cadastrada'}
              </strong>
              <span className="modal-editar-endereco-coordenada">
                {capturandoLocalizacao
                  ? precisaoParcialM !== null
                    ? `Precisão atual ±${formatarDistancia(precisaoParcialM)} — aguarde parado.`
                    : 'Aguarde alguns segundos parado.'
                  : temCoordenada
                    ? `${form.address_latitude}, ${form.address_longitude}`
                    : 'Na casa do cliente, use o botão abaixo.'}
              </span>
            </div>
            {temCoordenada && !capturandoLocalizacao && (
              <a
                className="botao-icone botao-icone-fantasma"
                href={`https://www.google.com/maps/search/?api=1&query=${form.address_latitude},${form.address_longitude}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Conferir no Google Maps"
              >
                <LuExternalLink size={20} />
              </a>
            )}
          </div>
          {temCoordenada && (
            <Suspense fallback={<div className="mapa-endereco" />}>
              <MapaEndereco
                lat={Number(form.address_latitude)}
                lng={Number(form.address_longitude)}
                precisaoM={precisaoM}
              />
            </Suspense>
          )}
          {precisaoM !== null && !capturandoLocalizacao && (
            <p className={`modal-editar-endereco-precisao${precisaoRuim ? ' ruim' : ''}`}>
              Precisão de ±{formatarDistancia(precisaoM)}
              {precisaoRuim && ' — baixa. Vá para perto da porta ou de área aberta e capture de novo.'}
            </p>
          )}
          <button
            type="button"
            className="botao botao-secundario modal-editar-endereco-capturar"
            aria-busy={capturandoLocalizacao}
            disabled={capturandoLocalizacao}
            onClick={capturarLocalizacaoAtual}
          >
            <LuLocateFixed size={20} />
            {capturandoLocalizacao
              ? 'Capturando…'
              : temCoordenada
                ? 'Atualizar com minha posição'
                : 'Usar minha posição atual'}
          </button>
        </div>
        )}
        </div>

        <div className="modal-editar-endereco-rodape">
          {confirmandoDescarte ? (
            <>
              <p className="modal-editar-endereco-aviso">Descartar as alterações deste endereço?</p>
              <div className="modal-editar-endereco-acoes">
                <button className="botao botao-secundario" onClick={() => setConfirmandoDescarte(false)}>
                  Continuar editando
                </button>
                <button className="botao botao-perigo" onClick={onFechar}>
                  Descartar
                </button>
              </div>
            </>
          ) : (
            <div className="modal-editar-endereco-acoes">
              <button className="botao botao-secundario" onClick={tentarFechar}>Cancelar</button>
              <button
                aria-busy={salvando}
                className="botao botao-primario"
                disabled={salvando || buscandoCep || capturandoLocalizacao}
                onClick={salvar}
              >
                {salvando ? 'Salvando…' : alterado ? 'Salvar alterações' : 'Salvar'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
