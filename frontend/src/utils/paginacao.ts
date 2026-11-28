export interface PaginaBuscada<T> {
  results: T[]
  // Total bruto da origem (antes de filtros do backend). Sem ele, para na 1ª página.
  totalBruto?: number
}

/** Avança pelo tamanho pedido (o backend filtra, a página pode vir menor). maxPaginas evita laço. */
export async function buscarTodasPaginas<T>(
  buscar: (start: number, limit: number) => Promise<PaginaBuscada<T>>,
  tamanho: number,
  maxPaginas = 20,
): Promise<T[]> {
  const todos: T[] = []
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const start = pagina * tamanho
    const resposta = await buscar(start, tamanho)
    todos.push(...resposta.results)
    const total = resposta.totalBruto
    if (typeof total !== 'number' || start + tamanho >= total) break
  }
  return todos
}
