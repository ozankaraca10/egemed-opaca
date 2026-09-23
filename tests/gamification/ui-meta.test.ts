import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { avatarTone } from '../../src/gamification/avatar'

describe('avatar tonu', () => {
  it('aynı kimlik → aynı ton; anonim → t-anon; yalnız izinli tonlar', () => {
    expect(avatarTone('u-12')).toBe(avatarTone('u-12'))
    expect(avatarTone('u-12', true)).toBe('t-anon')
    const tones = new Set(Array.from({ length: 200 }, (_, i) => avatarTone(`id-${i}`)))
    expect([...tones].every((t) => ['t-blue', 't-purple', 't-green', 't-amber'].includes(t))).toBe(true)
    expect(tones.size).toBe(4)
  })
})

describe('domainMeta — ResultsScreen ile eşit', () => {
  it('anahtar/etiket sırası aynı', () => {
    const grab = (file: string) => [...fs.readFileSync(file, 'utf8').matchAll(/\{ key: '(\w+)', label: '([^']+)'/g)].map((m) => `${m[1]}:${m[2]}`)
    const results = grab('src/screens/ResultsScreen.tsx')
    expect(results).toHaveLength(7)
    expect(grab('src/ui/gami/domainMeta.tsx')).toEqual(results)
  })
})
