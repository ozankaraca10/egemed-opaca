import { useRef } from 'react'
import type { Question } from '../core/types'
import { shuffledOptions } from '../core/session'
import { IconCheck, IconCheckCircle, IconXCircle } from './icons'

/** Yeniden kullanılabilir soru bileşenleri (§23): tek/çok seçim, ses tanıma,
 *  lokalizasyon, bell/diyafram, yorum, tanı, sıralama. */

interface Props {
  q: Question
  /** Seçenek karıştırma tohumu için vaka id'si (K1) */
  caseId: string
  value: string[]
  onChange: (values: string[]) => void
  revealed: boolean
  disabled?: boolean
  showEyebrow?: boolean
  /** madde 1: revealed iken doğru seçeneği işaretlemek için (yoksa q.correct kullanılır) */
  correctIds?: string[]
  /** madde 4: soru sayacı — vakadaki adım indeksi (0 tabanlı) */
  index?: number
  /** madde 4: vakadaki toplam soru sayısı */
  total?: number
}

export function QuestionCard({ q, caseId, value, onChange, revealed, disabled, showEyebrow = true, correctIds, index, total }: Props) {
  const toggle = (id: string) => {
    if (disabled || revealed) return
    if (q.type === 'multi_choice') {
      const cur = new Set(value)
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      onChange([...cur])
    } else {
      onChange([id])
    }
  }

  const isMulti = q.type === 'multi_choice'
  const eyebrowLabel: Record<string, string> = {
    sound_identify: 'Ses tanımlama',
    localization: 'Lokalizasyon',
    bell_diaphragm: 'Stetoskop kafası',
    interpretation: 'Klinik yorum',
    diagnosis: 'Tanı',
    recognition: 'Ses tanımlama',
    sequence: 'Sıralama',
    single_choice: 'Soru',
    multi_choice: 'Çok seçmeli',
  }
  // K1: doğru yanıtın hep ilk seçenek ("a") olma önyargısını önlemek için
  // vaka+soru id'sinden türeyen tohumla deterministik karıştırma.
  const options = shuffledOptions(caseId, q.id, q.options)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const correct = correctIds ?? q.correct

  /** D3: tek seçimli sorularda ok tuşlarıyla gezinme (ARIA radiogroup deseni) */
  const onOptKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (isMulti || disabled || revealed) return
    const dirs: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
    const dir = dirs[e.key]
    if (!dir) return
    e.preventDefault()
    const next = (index + dir + options.length) % options.length
    btnRefs.current[next]?.focus()
    toggle(options[next].id)
  }

  const showProgress = typeof index === 'number' && typeof total === 'number' && total > 0

  return (
    <div className="q-block">
      {showEyebrow && (
        <div className="q-eyebrow-row">
          <span className="q-eyebrow">{eyebrowLabel[q.type] ?? 'Soru'}</span>
          {showProgress && (
            <span className="q-progress" aria-label={`Soru ${index! + 1} / ${total}`}>
              <span>Soru {index! + 1} / {total}</span>
              <span className="q-progress-dots" aria-hidden="true">
                {Array.from({ length: total! }, (_, i) => (
                  <i key={i} className={i < index! ? 'done' : i === index! ? 'active' : ''} />
                ))}
              </span>
            </span>
          )}
        </div>
      )}
      <p className="q-text">{q.prompt}</p>
      {q.help && <p className="q-help">{q.help}</p>}
      <div className="opt-list" role={isMulti ? 'group' : 'radiogroup'} aria-label={q.prompt}>
        {options.map((o, i) => {
          const selected = value.includes(o.id)
          const isCorrectOpt = revealed && correct.includes(o.id)
          const isWrongSelected = revealed && selected && !correct.includes(o.id)
          return (
            <button
              key={o.id}
              ref={(el) => { btnRefs.current[i] = el }}
              type="button"
              className={`opt ${selected ? 'selected' : ''} ${isCorrectOpt ? 'is-correct' : ''} ${isWrongSelected ? 'is-wrong' : ''}`}
              onClick={() => toggle(o.id)}
              onKeyDown={(e) => onOptKeyDown(e, i)}
              role={isMulti ? 'checkbox' : 'radio'}
              aria-checked={selected}
              disabled={disabled}
            >
              <span className={isMulti ? 'check' : 'radio'}>
                {isMulti && <IconCheck />}
              </span>
              <span>{o.label}</span>
              {isCorrectOpt && <span className="mark" aria-hidden="true"><IconCheckCircle /></span>}
              {isWrongSelected && <span className="mark" aria-hidden="true"><IconXCircle /></span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Yanıt sonrası eğitim geri bildirimi (§46) — sadece Doğru/Yanlış değil. */
export function FeedbackCard({ correct, q, given }: { correct: boolean; q: Question; given: string[] }) {
  const correctLabels = q.correct.map((cid) => q.options.find((o) => o.id === cid)?.label ?? '').filter(Boolean)
  return (
    <div className="card mt-12">
      <div className={`feedback-head ${correct ? 'good' : 'bad'}`}>
        <div className={`ic ${correct ? 'good' : 'bad'}`}>
          {correct ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="10" fill="none" /><path d="m8 12.5 2.6 2.6L16.5 9" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="10" fill="none" /><path d="M9 9l6 6M15 9l-6 6" /></svg>
          )}
        </div>
        <h2>{correct ? 'Doğru!' : 'Yanlış'}</h2>
      </div>
      {!correct && given.length > 0 && (
        <p className="feedback-verdict">Yanıtınız: {given.map((id) => q.options.find((o) => o.id === id)?.label).filter(Boolean).join(', ')}</p>
      )}
      {!correct && (
        <p className="feedback-verdict" style={{ color: 'var(--green-600)' }}>
          Doğru yanıt: {correctLabels.join(', ')}
        </p>
      )}
      <p className="feedback-text">{correct ? q.feedbackCorrect : q.feedbackIncorrect}</p>
    </div>
  )
}

