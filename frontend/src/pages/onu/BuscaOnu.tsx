import { useEffect, useState, type FormEvent } from 'react'
import { LuCable, LuScanQrCode, LuWifi } from 'react-icons/lu'
import { buscarCpe, buscarOnu, type CpeDto, type OnuDto } from '../../api/client'
import LeitorCodigoBarras from '../../components/LeitorCodigoBarras'

type ResultadoCombo = { tipo: 'serial'; item: OnuDto } | { tipo: 'usuario'; item: CpeDto }

/** "Cliente · OLT · 1/2:3" — sem cliente, avisa. */
function detalheOnu(onu: OnuDto): string {
  const posicao = [onu.slot, onu.pon, onu.id].every((v) => v != null) ? `${onu.slot}/${onu.pon}:${onu.id}` : null
  return [onu.client_name || 'Sem cliente', onu.olt_name, posicao].filter(Boolean).join(' · ')
}

/** "Cliente · Contrato 123 · CTO X" */
function detalheConexao(cpe: CpeDto): string {
  return [
    cpe.client_complete_name,
    cpe.contract_number != null && `Contrato ${cpe.contract_number}`,
    cpe.dp_name && `CTO ${cpe.dp_name}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Busca por serial (prefixo) e por PPPoE (trecho) em paralelo, num só combobox. Lê o serial pela câmera. */
export default function BuscaOnu({
  onEscolher,
}: {
  onEscolher: (parametros: { serial: string } | { username: string }) => void
}) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<ResultadoCombo[]>([])
  const [buscando, setBuscando] = useState(false)
  const [listaAberta, setListaAberta] = useState(false)
  const [lendoCodigo, setLendoCodigo] = useState(false)

  useEffect(() => {
    const valor = busca.trim()
    if (valor.length < 2) {
      setResultados([])
      return
    }
    let cancelado = false
    setBuscando(true)
    const temporizador = setTimeout(() => {
      Promise.all([
        buscarOnu({ serial: valor }).catch(() => ({ results: [] as OnuDto[] })),
        buscarCpe({ username: valor }).catch(() => ({ results: [] as CpeDto[] })),
      ])
        .then(([respostaOnu, respostaCpe]) => {
          if (cancelado) return
          setResultados([
            ...respostaOnu.results.map((item): ResultadoCombo => ({ tipo: 'serial', item })),
            ...respostaCpe.results.map((item): ResultadoCombo => ({ tipo: 'usuario', item })),
          ])
        })
        .finally(() => {
          if (!cancelado) setBuscando(false)
        })
    }, 350)
    return () => {
      cancelado = true
      clearTimeout(temporizador)
    }
  }, [busca])

  function selecionar(resultado: ResultadoCombo) {
    // Fecha o teclado ao escolher.
    ;(document.activeElement as HTMLElement | null)?.blur()
    setListaAberta(false)
    setBusca('')
    if (resultado.tipo === 'serial' && resultado.item.sn) onEscolher({ serial: resultado.item.sn })
    else if (resultado.tipo === 'usuario' && resultado.item.username) onEscolher({ username: resultado.item.username })
  }

  function aoSubmeter(evento: FormEvent) {
    evento.preventDefault()
    if (resultados.length === 1) selecionar(resultados[0])
  }

  function aoLerCodigo(valor: string) {
    setLendoCodigo(false)
    setListaAberta(false)
    setBusca('')
    onEscolher({ serial: valor.trim().toUpperCase() })
  }

  return (
    <>
      <form
        className={`onu-card onu-busca onu-combobox${listaAberta && busca.trim().length >= 2 ? ' aberta' : ''}`}
        onSubmit={aoSubmeter}
      >
        <label htmlFor="onu-busca-input">Serial da ONU ou usuário PPPoE</label>
        <div className="onu-busca-campo">
          <input
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            id="onu-busca-input"
            type="text"
            placeholder="Serial ou usuário PPPoE"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setListaAberta(true)
            }}
            onFocus={() => setListaAberta(true)}
            onBlur={() => setTimeout(() => setListaAberta(false), 150)}
          />
          <button
            type="button"
            className="botao botao-secundario botao-quadrado"
            onClick={() => setLendoCodigo(true)}
            aria-label="Ler código de barras ou QR pela câmera"
            title="Ler código de barras ou QR pela câmera"
          >
            <LuScanQrCode size={20} />
          </button>
        </div>
        {listaAberta && busca.trim().length >= 2 && (
          <ul className="onu-combobox-lista">
            {buscando && <li className="onu-combobox-vazio">Buscando…</li>}
            {!buscando && resultados.length === 0 && <li className="onu-combobox-vazio">Nada encontrado.</li>}
            {!buscando &&
              resultados.map((resultado) => (
                <li key={`${resultado.tipo}-${resultado.item.pk}`}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => selecionar(resultado)}>
                    {resultado.tipo === 'serial' ? (
                      <>
                        <LuCable size={20} aria-hidden />
                        <span className="item-duas-linhas">
                          <strong>{resultado.item.sn}</strong>
                          <small>{detalheOnu(resultado.item)}</small>
                        </span>
                      </>
                    ) : (
                      <>
                        <LuWifi size={20} aria-hidden />
                        <span className="item-duas-linhas">
                          <strong>{resultado.item.username}</strong>
                          <small>{detalheConexao(resultado.item)}</small>
                        </span>
                      </>
                    )}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </form>
      {lendoCodigo && <LeitorCodigoBarras onDetectado={aoLerCodigo} onFechar={() => setLendoCodigo(false)} />}
    </>
  )
}
