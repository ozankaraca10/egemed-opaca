import { describe, expect, it } from 'vitest'
import {
  dayKeyTr, diffDaysTr, endOfMonthTr, monthKeyTr, periodRangeTr,
  startOfAcademicYearTr, startOfDayTr, startOfMonthTr, startOfWeekTr, TR_OFFSET_MS,
} from '../../src/gamification/time'

describe('TR takvimi (UTC+3, DST yok)', () => {
  it('TR_OFFSET_MS tam 3 saat', () => {
    expect(TR_OFFSET_MS).toBe(3 * 60 * 60 * 1000)
  })

  describe('gece yarısı sınırı: UTC 20:59 vs 21:00 (TR 23:59 vs 00:00)', () => {
    it('UTC 20:59:59 hâlâ önceki TR günü', () => {
      const t = new Date('2026-09-22T20:59:59.000Z')
      expect(dayKeyTr(t)).toBe('2026-09-22')
    })
    it('UTC 21:00:00 zaten bir sonraki TR günü', () => {
      const t = new Date('2026-09-22T21:00:00.000Z')
      expect(dayKeyTr(t)).toBe('2026-09-23')
    })
  })

  describe('startOfDayTr', () => {
    it('TR 00:00 UTC 21:00 önceki güne denk gelir', () => {
      const now = new Date('2026-09-23T10:00:00.000Z') // TR 13:00, 23 Eyl
      expect(startOfDayTr(now).toISOString()).toBe('2026-09-22T21:00:00.000Z')
    })
  })

  describe('hafta başı Pazartesi 00:00 TR', () => {
    it('Salı (TR) için önceki Pazartesi 00:00 TR döner', () => {
      // 2026-09-22 Salı (TR). Pazartesi 2026-09-21 00:00 TR = UTC 2026-09-20T21:00:00Z
      const now = new Date('2026-09-22T10:00:00.000Z')
      expect(startOfWeekTr(now).toISOString()).toBe('2026-09-20T21:00:00.000Z')
    })
    it('Pazartesi TR 00:00 sınırında: bir ms önce hâlâ önceki hafta, tam anda yeni hafta', () => {
      const mondayMidnightTr = new Date('2026-09-20T21:00:00.000Z') // Pazartesi 00:00 TR
      const justBefore = new Date(mondayMidnightTr.getTime() - 1)
      expect(startOfWeekTr(justBefore).toISOString()).toBe('2026-09-13T21:00:00.000Z')
      expect(startOfWeekTr(mondayMidnightTr).toISOString()).toBe(mondayMidnightTr.toISOString())
    })
    it('Pazar (TR) için haftanın başı hâlâ o haftanın Pazartesi\'sidir (hafta sonu ileri atlamaz)', () => {
      const sunday = new Date('2026-09-27T10:00:00.000Z') // TR Pazar
      expect(startOfWeekTr(sunday).toISOString()).toBe('2026-09-20T21:00:00.000Z')
    })
  })

  describe('ay sınırı: TR 23:59:59 vs sonraki ay 00:00:00', () => {
    it('endOfMonthTr Eylül son anını (TR 23:59:59.999, 30 Eylül) verir', () => {
      const now = new Date('2026-09-15T00:00:00.000Z')
      const end = endOfMonthTr(now)
      // Ekim 1'i 00:00 TR = UTC 2026-09-30T21:00:00Z; son an bundan 1ms önce
      expect(end.toISOString()).toBe('2026-09-30T20:59:59.999Z')
    })
    it('ayın son saniyesi (TR 23:59:59) hâlâ aynı ay, ay başı 00:00:00 (TR) sonraki ay', () => {
      const lastSecondOfSeptemberTr = new Date('2026-09-30T20:59:59.000Z')
      const firstInstantOfOctoberTr = new Date('2026-09-30T21:00:00.000Z')
      expect(monthKeyTr(lastSecondOfSeptemberTr)).toBe('2026-09')
      expect(monthKeyTr(firstInstantOfOctoberTr)).toBe('2026-10')
    })
    it('startOfMonthTr ayın 1'.concat("'i 00:00 TR'yi verir"), () => {
      const now = new Date('2026-09-15T12:00:00.000Z')
      expect(startOfMonthTr(now).toISOString()).toBe('2026-08-31T21:00:00.000Z')
    })
  })

  describe('akademik yıl (1 Eylül–31 Ağustos)', () => {
    it('Eylül içindeki bir tarih o yılın 1 Eylül\'üne bağlanır', () => {
      const now = new Date('2026-09-05T10:00:00.000Z')
      expect(startOfAcademicYearTr(now).toISOString()).toBe('2026-08-31T21:00:00.000Z')
    })
    it('Ağustos içindeki bir tarih önceki yılın 1 Eylül\'üne bağlanır', () => {
      const now = new Date('2026-08-20T10:00:00.000Z')
      expect(startOfAcademicYearTr(now).toISOString()).toBe('2025-08-31T21:00:00.000Z')
    })
    it('31 Ağustos TR 23:59 hâlâ eski akademik yıl, 1 Eylül TR 00:00 yeni yıl', () => {
      const lastInstantOfAugustTr = new Date('2026-08-31T20:59:59.000Z')
      const firstInstantOfSeptemberTr = new Date('2026-08-31T21:00:00.000Z')
      expect(startOfAcademicYearTr(lastInstantOfAugustTr).toISOString()).toBe('2025-08-31T21:00:00.000Z')
      expect(startOfAcademicYearTr(firstInstantOfSeptemberTr).toISOString()).toBe('2026-08-31T21:00:00.000Z')
    })
  })

  describe('diffDaysTr', () => {
    it('aynı TR günü içinde 0 döner', () => {
      const a = new Date('2026-09-22T20:00:00.000Z') // TR 22 Eyl 23:00
      const b = new Date('2026-09-22T02:00:00.000Z')
      expect(diffDaysTr(a, b)).toBe(0)
    })
    it('ardışık günlerde 1 döner', () => {
      const a = new Date('2026-09-23T10:00:00.000Z')
      const b = new Date('2026-09-22T10:00:00.000Z')
      expect(diffDaysTr(a, b)).toBe(1)
    })
  })

  describe('periodRangeTr', () => {
    it('academic_year başlangıcı startOfAcademicYearTr ile aynı', () => {
      const now = new Date('2026-09-23T10:00:00.000Z')
      const { start, end } = periodRangeTr('academic_year', now)
      expect(start.toISOString()).toBe(startOfAcademicYearTr(now).toISOString())
      expect(end.toISOString()).toBe(now.toISOString())
    })
  })
})
