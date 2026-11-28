// Localização do técnico para sugerir a CTO mais próxima (CardCto.tsx).

import { useEffect, useRef, useState } from 'react'
import { registrarLeituraLocal } from '../../utils/localizacaoAuditoria'

export interface PosicaoAoVivo {
  lat: number
  lng: number
  precisaoM: number
}

/** GPS ao vivo enquanto o componente está na tela; sem permissão, null. */
export function useLocalizacaoAoVivo(): PosicaoAoVivo | null {
  const [posicao, setPosicao] = useState<PosicaoAoVivo | null>(null)
  const ultimaRef = useRef<PosicaoAoVivo | null>(null)
  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (leitura) => {
        registrarLeituraLocal(leitura)
        const nova = {
          lat: leitura.coords.latitude,
          lng: leitura.coords.longitude,
          precisaoM: leitura.coords.accuracy,
        }
        // Ignora o tremor do GPS parado.
        if (!mudouOSuficiente(ultimaRef.current, nova)) return
        ultimaRef.current = nova
        setPosicao(nova)
      },
      () => {},
      // maximumAge 0: sempre leitura nova do GPS, nunca uma guardada.
      { enableHighAccuracy: true, maximumAge: 0 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])
  return posicao
}

// Precisão melhor (≥1 m) ou movimento ≥3 m atualiza; piora só a partir de 5 m.
export const MOVIMENTO_MINIMO_M = 3
export const MELHORA_PRECISAO_MINIMA_M = 1
export const PIORA_PRECISAO_MINIMA_M = 5

export function mudouOSuficiente(anterior: PosicaoAoVivo | null, nova: PosicaoAoVivo): boolean {
  if (!anterior) return true
  const ganho = anterior.precisaoM - nova.precisaoM
  return (
    ganho >= MELHORA_PRECISAO_MINIMA_M ||
    -ganho >= PIORA_PRECISAO_MINIMA_M ||
    distanciaMetros(anterior.lat, anterior.lng, nova.lat, nova.lng) >= MOVIMENTO_MINIMO_M
  )
}

// Haversine, em metros.
export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const raioTerraM = 6371000
  const paraRad = (graus: number) => (graus * Math.PI) / 180
  const dLat = paraRad(lat2 - lat1)
  const dLng = paraRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(paraRad(lat1)) * Math.cos(paraRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * raioTerraM * Math.asin(Math.sqrt(a))
}

export function formatarDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`
  return `${(metros / 1000).toFixed(1)} km`
}

// Limiares pela precisão relatada, não por distância fixa.
export const PRECISAO_MAXIMA_ACEITAVEL_M = 30
export const MARGEM_COORDENADA_CTO_M = 5
// Amostra a janela e fica com a leitura mais precisa (o 1º fix pode demorar).
const JANELA_AMOSTRAGEM_LOCALIZACAO_MS = 10000

// Abaixo disso o GPS quase não melhora.
export const PRECISAO_SUFICIENTE_M = 5

export interface OpcoesMelhorLocalizacao {
  // Encerra antes da janela quando a melhor leitura chega a esta precisão.
  pararComPrecisaoM?: number
  // Chamado a cada leitura que melhora a precisão (para exibir ao vivo).
  aoMelhorar?: (posicao: GeolocationPosition) => void
}

export function obterMelhorLocalizacao(opcoes: OpcoesMelhorLocalizacao = {}): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let melhor: GeolocationPosition | null = null
    let ultimoErro: GeolocationPositionError | null = null
    let encerrado = false
    let temporizador: ReturnType<typeof setTimeout> | undefined

    function encerrar() {
      if (encerrado) return
      encerrado = true
      clearTimeout(temporizador)
      navigator.geolocation.clearWatch(watchId)
      if (melhor) {
        registrarLeituraLocal(melhor)
        resolve(melhor)
      }
      else reject(ultimoErro ?? new Error('Não foi possível obter a localização.'))
    }

    // Sem timeout próprio: quem encerra é o setTimeout da janela.
    const watchId = navigator.geolocation.watchPosition(
      (posicao) => {
        if (encerrado) return
        if (!melhor || posicao.coords.accuracy < melhor.coords.accuracy) {
          melhor = posicao
          opcoes.aoMelhorar?.(posicao)
          if (opcoes.pararComPrecisaoM !== undefined && posicao.coords.accuracy <= opcoes.pararComPrecisaoM) encerrar()
        }
      },
      (erro) => {
        ultimoErro = erro
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    )

    temporizador = setTimeout(encerrar, JANELA_AMOSTRAGEM_LOCALIZACAO_MS)
  })
}
