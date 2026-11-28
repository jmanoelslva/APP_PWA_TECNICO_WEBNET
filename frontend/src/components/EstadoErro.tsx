import { LuCloudOff } from 'react-icons/lu'
import './EstadoVazio.css'

interface Props {
  mensagem: string
  onTentarDeNovo: () => void
}

/** Erro ao carregar uma tela: mesmo visual do estado vazio, com "Tentar novamente". */
export default function EstadoErro({ mensagem, onTentarDeNovo }: Props) {
  return (
    <div className="estado-vazio estado-erro" role="alert">
      <span className="estado-vazio-icone">
        <LuCloudOff size={32} />
      </span>
      <p className="estado-vazio-titulo">{mensagem}</p>
      <button
        className="botao botao-secundario"
        onClick={() => onTentarDeNovo()}
      >
        Tentar novamente
      </button>
    </div>
  )
}
