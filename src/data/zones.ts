import zonesData from './reading-zones.json'
import type { ReadingZone } from '../core/types'

export const ZONES = zonesData.zones as ReadingZone[]
export const STEP_TITLES = zonesData.steps as Record<string, string>
export const ZONE_IDS = ZONES.map((z) => z.id)
export function zoneById(id: string): ReadingZone | undefined {
  return ZONES.find((z) => z.id === id)
}
