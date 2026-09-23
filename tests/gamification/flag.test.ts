import { describe, expect, it } from 'vitest'
import { gamiDemoFrom, gamiEnabledFrom } from '../../src/gamification/flag'

describe('oyunlaştırma bayrağı', () => {
  it('?gami=1 ya da VITE_GAMI=1 açar; diğer her şey kapalı', () => {
    expect(gamiEnabledFrom('?gami=1', undefined)).toBe(true)
    expect(gamiEnabledFrom('', '1')).toBe(true)
    expect(gamiEnabledFrom('', undefined)).toBe(false)
    expect(gamiEnabledFrom('?gami=0', '0')).toBe(false)
    expect(gamiEnabledFrom('?gami=true', undefined)).toBe(false)
  })
  it('demo durumu yalnız geçerli değerlerde', () => {
    expect(gamiDemoFrom('?gami=1&demo=full')).toBe('full')
    expect(gamiDemoFrom('?demo=winner')).toBe('winner')
    expect(gamiDemoFrom('?demo=xyz')).toBeNull()
  })
})
