import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type TipoToast } from './toast-context'
import { vibrar } from '../../utils/vibrar'
import './Toast.css'

interface ItemToast {
  id: number
  mensagem: string
  tipo: TipoToast
}

const DURACAO_MS = 3500

/** Toasts empilhados no rodapé, somem sozinhos. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemToast[]>([])
  const proximoId = useRef(0)

  const toast = useCallback((mensagem: string, tipo: TipoToast = 'erro') => {
    const id = proximoId.current++
    // Sucesso vibra curto, erro duplo, info não vibra.
    if (tipo === 'sucesso') vibrar('sucesso')
    else if (tipo === 'erro') vibrar('erro')
    setItens((atual) => [...atual, { id, mensagem, tipo }])
    setTimeout(() => {
      setItens((atual) => atual.filter((item) => item.id !== id))
    }, DURACAO_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-pilha">
        {itens.map((item) => (
          <div key={item.id} className={`toast toast-${item.tipo}`}>
            {item.mensagem}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
