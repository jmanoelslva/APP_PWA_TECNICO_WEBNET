import { describe, expect, it } from 'vitest'
import { corMaisProxima } from './coresFibra'

describe('corMaisProxima', () => {
  // Tons escolhidos à mão no painel (tons reais do painel).
  it.each([
    ['#55FF00', 'Verde'],
    ['#00FF00', 'Verde'],
    ['#0055FF', 'Azul'],
    ['#AA55FF', 'Violeta'],
    ['#ff0000', 'Vermelho'],
    ['#FF00FF', 'Rosa'],
    ['#FFFFFF', 'Branco'],
    ['#AA5500', 'Marrom'],
    ['#000000', 'Preto'],
  ])('%s → %s', (hex, nome) => {
    expect(corMaisProxima(hex)?.nome).toBe(nome)
  })
  it('sem cor ou inválida', () => {
    expect(corMaisProxima(null)).toBeNull()
    expect(corMaisProxima('azul')).toBeNull()
  })
})
