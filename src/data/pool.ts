import type { CaseDef, Mode } from '../core/types'
import casesData from './cases.json'
import casesAuto from './cases-auto.json'

/** Tüm vaka havuzu: elle yazılmış çekirdek vakalar + veri setinden üretilen varyantlar.
 *  Havuz veri setinin sınırlarına kadar genişletilir; her oturumda rastgele 10 vaka sunulur. */
export const CORE_CASES = casesData.cases as unknown as CaseDef[]
export const AUTO_CASES = (casesAuto as { cases: CaseDef[] }).cases as unknown as CaseDef[]
export const ALL_CASES: CaseDef[] = [...CORE_CASES, ...AUTO_CASES]

export function poolFor(mode: Mode): CaseDef[] {
  if (mode === 'assessment') return ALL_CASES.filter((c) => c.modes.includes('assessment') && c.mappingValidation === 'validated')
  if (mode === 'practice') return ALL_CASES.filter((c) => c.modes.includes('practice'))
  return ALL_CASES
}
