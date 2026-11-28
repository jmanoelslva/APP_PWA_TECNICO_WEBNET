import { LuExternalLink } from 'react-icons/lu'
import { urlRoteador } from '../utils/roteador'

/** IP com o atalho para o roteador (só IPv4). */
export default function IpComAcesso({ ip, porta }: { ip: string | null | undefined; porta?: number | null }) {
  const url = urlRoteador(ip, porta)
  if (!url) return <>{ip || '—'}</>
  return (
    <span className="ip-com-acesso">
      <span className="ip-com-acesso-texto">{ip}</span>
      <a
        className="botao-icone botao-icone-fantasma ip-com-acesso-botao"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Abrir o roteador em ${url}`}
        title={url}
      >
        <LuExternalLink size={16} />
      </a>
    </span>
  )
}
