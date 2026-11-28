import { useEffect, useState, type FormEvent } from 'react'
import { LuSearch, LuWifi } from 'react-icons/lu'
import { buscarCpe, type CpeDto } from '../../api/client'

/** Busca ao vivo por usuário PPPoE (debounce no backend). */
export default function BuscaUsuarioPppoe({
  onEscolher,
}: {
  // Na URL, para voltar sem perder a busca.
  onEscolher: (parametros: { username: string } | { cpe_pk: string }) => void
}) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<CpeDto[]>([])
  const [buscando, setBuscando] = useState(false)
  const [listaAberta, setListaAberta] = useState(false)

  useEffect(() => {
    if (busca.trim().length < 2) {
      setResultados([])
      return
    }
    let cancelado = false
    setBuscando(true)
    const temporizador = setTimeout(() => {
      buscarCpe({ username: busca.trim() })
        .then((resposta) => {
          if (!cancelado) setResultados(resposta.results)
        })
        .catch(() => {
          if (!cancelado) setResultados([])
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

  function aoBuscar(evento: FormEvent) {
    evento.preventDefault()
    const usuario = busca.trim()
    if (usuario) onEscolher({ username: usuario })
  }

  return (
    <form className="conexao-card conexao-busca conexao-combobox" onSubmit={aoBuscar}>
      <label htmlFor="conexao-usuario-input">Usuário PPPoE</label>
      <div className="conexao-busca-campo">
        <input
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          id="conexao-usuario-input"
          type="text"
          placeholder="Usuário PPPoE"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onFocus={() => setListaAberta(true)}
          onBlur={() => setTimeout(() => setListaAberta(false), 150)}
        />
        <button
          type="submit"
          className="botao botao-secundario botao-quadrado"
          aria-label="Buscar"
        >
          <LuSearch size={20} />
        </button>
      </div>
      {listaAberta && busca.trim().length >= 2 && (
        <ul className="conexao-combobox-lista">
          {buscando && <li className="conexao-combobox-vazio">Buscando…</li>}
          {!buscando && resultados.length === 0 && <li className="conexao-combobox-vazio">Nenhum usuário encontrado.</li>}
          {!buscando &&
            resultados.map((resultado) => (
              <li key={resultado.pk}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setListaAberta(false)
                    if (resultado.pk) onEscolher({ cpe_pk: String(resultado.pk) })
                  }}
                >
                  <LuWifi size={20} aria-hidden />
                  <span className="item-duas-linhas">
                    <strong>{resultado.username}</strong>
                    <small>
                      {[
                        resultado.client_complete_name,
                        resultado.contract_number != null && `Contrato ${resultado.contract_number}`,
                        resultado.dp_name && `CTO ${resultado.dp_name}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </form>
  )
}
