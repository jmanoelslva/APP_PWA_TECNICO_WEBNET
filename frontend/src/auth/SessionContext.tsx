import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { aoExpirarSessao, buscarTecnicoAtual, login as apiLogin, logout as apiLogout } from '../api/client'
import { useToast } from '../components/Toast/useToast'
import { limparRecentes } from '../utils/buscaUnica'
import { limparAtendimento } from '../utils/atendimento'
import { SessionContext, type TecnicoLogado } from './session-context'
import { lembrarNome } from '../utils/nomeTecnico'

/** O cookie sobrevive ao F5: confirma com /auth/me antes de mandar ao login. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [logado, setLogado] = useState(false)
  const [verificando, setVerificando] = useState(true)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [tecnico, setTecnico] = useState<TecnicoLogado | null>(null)
  const { toast } = useToast()
  // Ref para o ouvinte registrado uma vez ler o valor atual.
  const logadoRef = useRef(false)

  useEffect(() => {
    logadoRef.current = logado
  }, [logado])

  useEffect(() => {
    buscarTecnicoAtual()
      .then((dado) => {
        setTecnico({ username: dado.username, nome: dado.nome })
        lembrarNome(dado.username, dado.nome)
        setLogado(true)
      })
      .catch(() => {
        // Sem sessão válida (401) — segue para o login normalmente.
      })
      .finally(() => setVerificando(false))
  }, [])

  const entrar = useCallback(async (usuario: string, senha: string) => {
    setCarregando(true)
    setErro(null)
    try {
      const resposta = await apiLogin(usuario.trim(), senha)
      if (resposta.success && resposta.tecnico) {
        setLogado(true)
        setTecnico({ username: resposta.tecnico.username })
        // O login não busca o nome (fica rápido); vem do /auth/me em segundo plano.
        buscarTecnicoAtual()
          .then((dado) => {
            setTecnico({ username: dado.username, nome: dado.nome })
            lembrarNome(dado.username, dado.nome)
          })
          .catch(() => {})
        return true
      }
      setErro(resposta.message ?? 'Usuário ou senha incorretos.')
      return false
    } catch {
      setErro('Não foi possível conectar. Tente novamente.')
      return false
    } finally {
      setCarregando(false)
    }
  }, [])

  const sair = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      // Nomes de clientes buscados não ficam no celular depois de sair.
      limparRecentes()
      limparAtendimento()
      setLogado(false)
      setTecnico(null)
    }
  }, [])

  // 401 de qualquer tela; só conta se já havia sessão nesta aba.
  useEffect(() => {
    aoExpirarSessao(() => {
      if (!logadoRef.current) return
      logadoRef.current = false
      toast('Sua sessão expirou. Faça login novamente.', 'info')
      sair().catch(() => {})
    })
    return () => aoExpirarSessao(null)
  }, [sair, toast])

  return (
    <SessionContext.Provider value={{ logado, verificando, carregando, erro, tecnico, entrar, sair }}>
      {children}
    </SessionContext.Provider>
  )
}
