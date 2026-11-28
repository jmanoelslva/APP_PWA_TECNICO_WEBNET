import { useState } from 'react'
import { LuEye, LuEyeOff, LuSave } from 'react-icons/lu'
import { ApiError, atualizarWifiCpe, type CpeDto } from '../../api/client'
import { useToast } from '../../components/Toast/useToast'
import { OPCOES_CRIPTOGRAFIA_WIFI } from '../../utils/formatacao'
import CartaoConexao from './CartaoConexao'

/** Criptografia do Wi-Fi (0 Nenhum, 1 WEP, 2 WPA, 3 EAP). Nenhum = sem senha. */
export default function CardWifi({
  cpe,
  onAtualizado,
}: {
  cpe: CpeDto
  onAtualizado: (parcial: Partial<CpeDto>) => void
}) {
  const { toast } = useToast()
  // Sem valor, assume Nenhum.
  const [wifiTipo, setWifiTipo] = useState(cpe.wifi_encryption_type != null ? String(cpe.wifi_encryption_type) : '0')
  const [wifiSenha, setWifiSenha] = useState(cpe.wifi_encryption_password ?? '')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const semCriptografia = wifiTipo === '0'

  async function salvar() {
    if (!cpe.pk) return
    setSalvando(true)
    try {
      const senhaParaEnviar = semCriptografia ? '' : wifiSenha
      const tipo = wifiTipo.trim() ? Number(wifiTipo.trim()) : undefined
      await atualizarWifiCpe(cpe.pk, {
        wifi_encryption_type: tipo,
        wifi_encryption_password: senhaParaEnviar,
        auditoria: {
          cliente: cpe.client_complete_name,
          pppoe: cpe.username,
          wifi_tipo_anterior: cpe.wifi_encryption_type,
          senha_wifi_alterada: senhaParaEnviar !== (cpe.wifi_encryption_password ?? ''),
          senha_wifi_anterior: cpe.wifi_encryption_password ?? undefined,
        },
      })
      setWifiSenha(senhaParaEnviar)
      onAtualizado({ wifi_encryption_type: tipo, wifi_encryption_password: senhaParaEnviar })
      toast('Wi-Fi do CPE atualizado.', 'sucesso')
    } catch (excecao) {
      toast(excecao instanceof ApiError ? excecao.message : 'Não foi possível atualizar o Wi-Fi.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <CartaoConexao titulo="Wi-Fi do CPE (criptografia)">
      <div className="conexao-campo">
        <span>Tipo de criptografia</span>
        <select
          className="conexao-input"
          value={wifiTipo}
          onChange={(e) => {
            setWifiTipo(e.target.value)
            if (e.target.value === '0') setWifiSenha('')
          }}
        >
          {OPCOES_CRIPTOGRAFIA_WIFI.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div className="conexao-campo">
        <span>Senha do Wi-Fi</span>
        <div className="conexao-campo-valor">
          <input
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="conexao-input"
            type={mostrarSenha ? 'text' : 'password'}
            value={semCriptografia ? '' : wifiSenha}
            onChange={(e) => setWifiSenha(e.target.value)}
            disabled={semCriptografia}
            placeholder={semCriptografia ? 'Sem criptografia — sem senha' : 'Não informado'}
          />
          <button
            onClick={() => setMostrarSenha((v) => !v)}
            disabled={semCriptografia}
            aria-label={mostrarSenha ? 'Ocultar senha do Wi-Fi' : 'Mostrar senha do Wi-Fi'}
          >
            {mostrarSenha ? <LuEyeOff size={16} /> : <LuEye size={16} />}
          </button>
        </div>
      </div>
      <button aria-busy={salvando}
        className="botao botao-secundario botao-pequeno botao-largo"
        onClick={salvar}
        disabled={salvando}
      >
        <LuSave size={16} /> {salvando ? 'Salvando…' : 'Salvar Wi-Fi'}
      </button>
    </CartaoConexao>
  )
}
