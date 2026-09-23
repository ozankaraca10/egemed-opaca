/** EGEMED Opaca — oyunlaştırma özellik bayrağı (yol haritası §2.3).
 *  `?gami=1` ya da derleme sabiti `VITE_GAMI=1`. Bayrak kapalıyken hiçbir oyunlaştırma öğesi render edilmez.
 *  `?gami=1&demo=full|empty|winner` tasarım/test için hazır demo durumlarını seçer (bkz. demo.ts). */

import type { DemoKind } from './demo'

export function gamiEnabledFrom(search: string, envFlag: string | undefined): boolean {
  if (envFlag === '1') return true
  return new URLSearchParams(search).get('gami') === '1'
}

export function gamiDemoFrom(search: string): DemoKind | null {
  const v = new URLSearchParams(search).get('demo')
  return v === 'full' || v === 'empty' || v === 'winner' ? v : null
}

const search = typeof window !== 'undefined' ? window.location.search : ''
/** Uygulama ömrü boyunca sabit (sayfa yüklenirken bir kez okunur). */
export const GAMI_ENABLED = gamiEnabledFrom(search, import.meta.env.VITE_GAMI)
export const GAMI_DEMO = GAMI_ENABLED ? gamiDemoFrom(search) : null
