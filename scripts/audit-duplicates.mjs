#!/usr/bin/env node
/**
 * V8 (BRIEF_OPACA_V3) — genel tekrar denetimi. `npm run cases` (ve `validate-images.mjs`) sonrasında
 * çalıştırılır; Opaca'nın ürettiği tüm vakaları (çekirdek + otomatik) tarar ve şunları ölçer:
 *
 *  1. Soru imzası tekrarı — V2 (koordinatör kararı 23 Eylül, düzeltilmiş tanım):
 *     - GÖRÜNTÜYE BAĞLI sorular (finding_identify/localization/film_quality) imzada görüntüId taşır,
 *       her vaka farklı görüntüden türediğinden doğası gereği benzersizdir; "tekrar" olarak sayılmaz.
 *     - BİLGİ soruları (interpretation) imzada yalnız prompt+doğru yanıt taşır — asıl tekrar riski
 *       burada; en çok tekrarlayan 10 BİLGİ sorusu ve kullanım sayıları raporlanır.
 *     Eski tanım (tüm sorular, prompt dahil imza) da RAPOR KARŞILAŞTIRMASI için hesaplanır (bkz. legacy*).
 *  2. Aynı görüntünün birden çok vakada kullanılıp kullanılmadığı.
 *  3. Aynı hastadan (V1 kural 4: NIH'de dosya adı öneki) birden çok vaka var mı.
 *  4. 1000 rastgele tohumla `sampleSession` (src/core/session.ts ile birebir aynı algoritma) çalıştırılıp
 *     hiçbir oturumda BİLGİ sorusu imzası çakışması çıkmadığı (V2/§2a kesin kuralın büyük ölçekte doğrulanması).
 *  5. Kabul ölçütleri (HATA — çıkış kodu 1):
 *     a) hiçbir oturum tohumunda soru tekrarı yok,
 *     b) her bilgi sorusu varyantı havuzda en fazla KNOWLEDGE_QUESTION_CAP (4) vakada kullanılmış,
 *     d) bulgudan bağımsız genel soru (ör. ABCDE sırası) oranı ≤ GENERIC_QUESTION_MAX_RATIO (%10).
 *
 * Çıktı: konsola özet + reports/duplicates.json (ayrıntı). `npm run audit:dupes`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, DATA_DIR, readJson } from './lib/cxr-common.mjs'
import {
  questionSignature, legacyQuestionSignature, patientKey, sampleSession,
  IMAGE_DEPENDENT_TYPES, KNOWLEDGE_QUESTION_CAP, GENERIC_QUESTION_MAX_RATIO, genericQuestionRatio,
} from './lib/case-selection.mjs'

const core = readJson(path.join(DATA_DIR, 'cases.json'), { cases: [] }).cases
const auto = readJson(path.join(DATA_DIR, 'cases-auto.json'), { cases: [] }).cases
const images = readJson(path.join(DATA_DIR, 'images.json'), { records: [] }).records
const all = [...core, ...auto]
const imgById = new Map(images.map((r) => [r.id, r]))

/* 1a) eski tanım — yalnız rapor karşılaştırması */
let totalQuestions = 0
const legacySigToCaseIds = new Map()
for (const c of all) {
  for (const q of c.questions) {
    totalQuestions++
    const sig = legacyQuestionSignature(q)
    if (!legacySigToCaseIds.has(sig)) legacySigToCaseIds.set(sig, [])
    legacySigToCaseIds.get(sig).push(c.id)
  }
}
const legacyUniqueSignatures = legacySigToCaseIds.size
const legacyRatio = totalQuestions ? legacyUniqueSignatures / totalQuestions : 1

/* 1b) yeni tanım — yalnız BİLGİ soruları (interpretation ve görüntüden bağımsız her tür) */
const knowledgeSigToCaseIds = new Map()
let totalKnowledgeQuestions = 0
for (const c of all) {
  for (const q of c.questions) {
    if (IMAGE_DEPENDENT_TYPES.has(q.type)) continue
    totalKnowledgeQuestions++
    const sig = questionSignature(q)
    if (!knowledgeSigToCaseIds.has(sig)) knowledgeSigToCaseIds.set(sig, [])
    knowledgeSigToCaseIds.get(sig).push(c.id)
  }
}
const knowledgeUniqueSignatures = knowledgeSigToCaseIds.size
const knowledgeRatio = totalKnowledgeQuestions ? knowledgeUniqueSignatures / totalKnowledgeQuestions : 1
const topRepeatedKnowledge = [...knowledgeSigToCaseIds.entries()]
  .filter(([, ids]) => ids.length > 1)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 10)
  .map(([sig, ids]) => ({ signature: sig, count: ids.length, sampleCaseIds: ids.slice(0, 5) }))
const knowledgeOverCap = [...knowledgeSigToCaseIds.entries()].filter(([, ids]) => ids.length > KNOWLEDGE_QUESTION_CAP)

/* 1c) §2d: bulgudan bağımsız genel soru oranı */
const genRatio = genericQuestionRatio(all)

/* 2) aynı görüntü birden çok vakada mı kullanılıyor */
const imageToCaseIds = new Map()
for (const c of all) {
  if (!imageToCaseIds.has(c.imageId)) imageToCaseIds.set(c.imageId, [])
  imageToCaseIds.get(c.imageId).push(c.id)
}
const reusedImages = [...imageToCaseIds.entries()]
  .filter(([, ids]) => ids.length > 1)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([imageId, caseIds]) => ({ imageId, count: caseIds.length, caseIds }))

/* 3) aynı hastadan birden çok vaka (V1 kural 4) */
const patientToCaseIds = new Map()
for (const c of all) {
  const img = imgById.get(c.imageId)
  if (!img) continue
  const pKey = patientKey(img)
  if (!patientToCaseIds.has(pKey)) patientToCaseIds.set(pKey, [])
  patientToCaseIds.get(pKey).push(c.id)
}
const multiCasePatients = [...patientToCaseIds.entries()]
  .filter(([, ids]) => ids.length > 1)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([pKey, caseIds]) => ({ patientKey: pKey, count: caseIds.length, caseIds }))

/* 4) 1000 rastgele tohumla oturum içi tekrar denetimi (V2/§2a) */
const SESSION_SEED_TRIALS = 1000
const SESSION_SIZE = 10
const assessmentPool = all.filter((c) => c.modes.includes('assessment') && c.mappingValidation === 'validated')
const practicePool = all.filter((c) => c.modes.includes('practice'))
function auditSessions(pool, label) {
  let sessionsWithCollision = 0
  const examples = []
  for (let seed = 0; seed < SESSION_SEED_TRIALS; seed++) {
    const ids = sampleSession(pool, seed, SESSION_SIZE)
    const seen = new Set()
    let collided = false
    for (const id of ids) {
      const c = pool.find((cc) => cc.id === id)
      if (!c) continue
      for (const q of c.questions) {
        const sig = questionSignature(q, c.imageId)
        if (seen.has(sig)) {
          collided = true
          if (examples.length < 5) examples.push({ seed, caseId: c.id, questionId: q.id, signature: sig })
        }
        seen.add(sig)
      }
    }
    if (collided) sessionsWithCollision++
  }
  return { label, poolSize: pool.length, trials: SESSION_SEED_TRIALS, sessionsWithCollision, examples }
}
const sessionAudit = [auditSessions(assessmentPool, 'assessment'), auditSessions(practicePool, 'practice')]

/* rapor */
const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    cases: all.length,
    questions: totalQuestions,
    legacy: { uniqueSignatures: legacyUniqueSignatures, ratio: Number(legacyRatio.toFixed(3)) },
    knowledgeOnly: { questions: totalKnowledgeQuestions, uniqueSignatures: knowledgeUniqueSignatures, ratio: Number(knowledgeRatio.toFixed(3)), cap: KNOWLEDGE_QUESTION_CAP, overCapCount: knowledgeOverCap.length },
    genericQuestionRatio: Number(genRatio.toFixed(3)),
  },
  topRepeatedKnowledgeQuestions: topRepeatedKnowledge,
  reusedImages,
  multiCasePatients,
  sessionAudit,
}
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports', 'duplicates.json'), JSON.stringify(report, null, 2))

console.log(`Tekrar denetimi: ${all.length} vaka, ${totalQuestions} soru`)
console.log(`  Eski tanım (bilgi amaçlı, tüm sorular): ${legacyUniqueSignatures}/${totalQuestions} benzersiz (oran ${legacyRatio.toFixed(3)})`)
console.log(`  Yeni tanım (yalnız bilgi soruları, §2b kabul ölçütü): ${knowledgeUniqueSignatures}/${totalKnowledgeQuestions} benzersiz (oran ${knowledgeRatio.toFixed(3)}), tavanı (>${KNOWLEDGE_QUESTION_CAP}) aşan varyant: ${knowledgeOverCap.length}`)
console.log(`  Bulgudan bağımsız genel soru oranı (§2d, hedef ≤${GENERIC_QUESTION_MAX_RATIO}): ${genRatio.toFixed(3)}`)
console.log(`En çok tekrarlayan ${topRepeatedKnowledge.length} BİLGİ sorusu (ilk 10):`)
for (const r of topRepeatedKnowledge) console.log(`  ${r.count}× ${r.signature.slice(0, 90)}${r.signature.length > 90 ? '…' : ''}`)
console.log(`Birden çok vakada kullanılan görüntü: ${reusedImages.length}${reusedImages.length ? ' (ör. ' + reusedImages.slice(0, 3).map((r) => `${r.imageId}×${r.count}`).join(', ') + ')' : ' (yok)'}`)
console.log(`Aynı hastadan birden çok vaka: ${multiCasePatients.length}${multiCasePatients.length ? ' (ör. ' + multiCasePatients.slice(0, 3).map((r) => `${r.patientKey}×${r.count}`).join(', ') + ')' : ' (yok)'}`)
for (const s of sessionAudit) {
  console.log(`Oturum denetimi (${s.label}, havuz ${s.poolSize}): ${s.trials} tohumdan ${s.sessionsWithCollision} tanesinde soru tekrarı ${s.sessionsWithCollision ? '— HATA' : '— yok'}`)
}

const fatalSessionCollisions = sessionAudit.some((s) => s.sessionsWithCollision > 0)
const fatalCap = knowledgeOverCap.length > 0
const fatalGeneric = genRatio > GENERIC_QUESTION_MAX_RATIO
if (fatalSessionCollisions || fatalCap || fatalGeneric) {
  if (fatalCap) console.error(`HATA: ${knowledgeOverCap.length} bilgi sorusu varyantı tavanı (>${KNOWLEDGE_QUESTION_CAP} vaka) aşıyor (V2/§2b)`)
  if (fatalGeneric) console.error(`HATA: bulgudan bağımsız genel soru oranı ${genRatio.toFixed(3)} > ${GENERIC_QUESTION_MAX_RATIO} (V2/§2d)`)
  if (fatalSessionCollisions) console.error('HATA: en az bir oturum tohumunda soru tekrarı bulundu (V2/§2a kesin kural ihlali)')
  process.exit(1)
}
console.log('Ayrıntı: reports/duplicates.json')
process.exit(0)
