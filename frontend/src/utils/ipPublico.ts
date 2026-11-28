// ipify público (api6 falha sem IPv6). Timeout curto. Exige connect-src no CSP (deploy/*.conf.example).
async function buscarIpPublico(url: string, timeoutMs = 4000): Promise<string | null> {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs)
  try {
    const resposta = await fetch(url, { signal: controlador.signal })
    if (!resposta.ok) return null
    const dados = (await resposta.json()) as { ip?: string }
    return dados.ip ?? null
  } catch {
    return null
  } finally {
    clearTimeout(temporizador)
  }
}

export async function buscarIpsPublicos(): Promise<{ ipv4: string | null; ipv6: string | null }> {
  const [ipv4, ipv6] = await Promise.all([
    buscarIpPublico('https://api.ipify.org?format=json'),
    buscarIpPublico('https://api6.ipify.org?format=json'),
  ])
  return { ipv4, ipv6 }
}
