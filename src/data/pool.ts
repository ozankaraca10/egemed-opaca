import type { CaseDef, Mode } from '../core/types'
import casesData from './cases.json'
import casesAuto from './cases-auto.json'

/** Vaka havuzu: elle yazılmış çekirdek vakalar + görüntü envanterinden üretilen vakalar. */
export const CORE_CASES = (casesData as { cases: unknown[] }).cases as CaseDef[]
export const AUTO_CASES = (casesAuto as { cases: unknown[] }).cases as CaseDef[]
export const ALL_CASES: CaseDef[] = [...CORE_CASES, ...AUTO_CASES]

export function poolFor(mode: Mode): CaseDef[] {
  if (mode === 'assessment') return ALL_CASES.filter((c) => c.modes.includes('assessment') && c.mappingValidation === 'validated')
  if (mode === 'practice') return ALL_CASES.filter((c) => c.modes.includes('practice'))
  return ALL_CASES
}
