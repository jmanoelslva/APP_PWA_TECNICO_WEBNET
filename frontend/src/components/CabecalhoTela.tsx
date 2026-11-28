import type { IconType } from 'react-icons'
import { comAlpha } from '../utils/cores'
import './CabecalhoTela.css'

interface Props {
  icone: IconType
  cor: string
  titulo: string
}

/** Ícone na cor da área + título, sem subtítulo. */
export default function CabecalhoTela({ icone: Icone, cor, titulo }: Props) {
  return (
    <header className="cabecalho-tela">
      <span className="cabecalho-tela-icone" style={{ background: comAlpha(cor, 14), color: cor }}>
        <Icone size={20} />
      </span>
      <h1>{titulo}</h1>
    </header>
  )
}
