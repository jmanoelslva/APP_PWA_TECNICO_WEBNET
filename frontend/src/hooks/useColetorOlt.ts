import { useEffect, useState } from 'react'

/** Coletor de OLTs opcional em /olt/: confere o JSON de /olt/api/saude antes de mostrar o menu. */
export function useColetorOlt(): boolean {
  const [disponivel, setDisponivel] = useState(false)

  useEffect(() => {
    const controle = new AbortController()
    const limite = setTimeout(() => controle.abort(), 5000)
    fetch('/olt/api/saude', { credentials: 'same-origin', cache: 'no-store', signal: controle.signal })
      .then(async (resposta) => {
        if (!resposta.ok || !resposta.headers.get('content-type')?.includes('application/json')) return
        const corpo = (await resposta.json()) as { app?: string }
        setDisponivel(corpo.app === 'coletor-olt')
      })
      .catch(() => setDisponivel(false))
      .finally(() => clearTimeout(limite))
    return () => {
      clearTimeout(limite)
      controle.abort()
    }
  }, [])

  return disponivel
}
