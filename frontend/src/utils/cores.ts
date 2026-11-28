/** Cores da marca como CSS custom properties (index.css). */
export const CORES = {
  primaria: 'var(--cor-primaria)',
  primariaEscura: 'var(--cor-primaria-escura)',
  primariaClara: 'var(--cor-primaria-clara)',
  primariaGradienteFim: 'var(--cor-primaria-gradiente-fim)',

  fundo: 'var(--cor-fundo)',
  superficie: 'var(--cor-superficie)',
  borda: 'var(--cor-borda)',
  branco: '#ffffff',

  texto: 'var(--cor-texto)',
  textoSecundario: 'var(--cor-texto-secundario)',
  textoTerciario: 'var(--cor-texto-terciario)',
  textoFraco: 'var(--cor-texto-fraco)',
  textoDesabilitado: 'var(--cor-texto-desabilitado)',

  sucesso: 'var(--cor-sucesso)',
  sucessoVivo: 'var(--cor-sucesso-vivo)',
  alerta: 'var(--cor-alerta)',
  atencao: 'var(--cor-atencao)',
  erro: 'var(--cor-erro)',

  suporte: 'var(--cor-suporte)',
  cliente: 'var(--cor-cliente)',
  conexao: 'var(--cor-conexao)',
  onu: 'var(--cor-onu)',
  endereco: 'var(--cor-endereco)',
  ferramentas: 'var(--cor-ferramentas)',
  financeiro: 'var(--cor-financeiro)',
  offline: 'var(--cor-offline)',
  olts: 'var(--cor-olts)',
} as const

/** Cor com transparência via color-mix. */
export function comAlpha(cor: string, porcentagem: number): string {
  return `color-mix(in srgb, ${cor} ${porcentagem}%, transparent)`
}
