import { buscarDetalheCliente } from '../api/client'
import { linkLigar } from './formatacao'
import { primeiroTelefone } from './minhasOs'

/** tel: do primeiro telefone, buscado na hora. null = sem telefone. */
export async function linkLigarDoCliente(clientPk: number): Promise<string | null> {
  const detalhe = await buscarDetalheCliente(clientPk)
  return linkLigar(primeiroTelefone(detalhe.telefones, detalhe.cliente.client_phones))
}
