import { createContext } from 'react'

export type TipoToast = 'info' | 'sucesso' | 'erro'

export interface ToastContextValue {
  toast: (mensagem: string, tipo?: TipoToast) => void
}

// Contexto em arquivo próprio para não quebrar o Fast Refresh.
export const ToastContext = createContext<ToastContextValue | null>(null)
