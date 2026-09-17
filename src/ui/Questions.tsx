import { useRef } from 'react'
import type { Question } from '../core/types'
import { shuffledOptions } from '../core/session'
import { decodeMark } from '../core/geometry'
import { findingShort } from '../data/terminology'
import { IconCheck, IconCheckCircle, IconXCircle } from './icons'

/** Soru bileşenleri: seçmeli sorular + görüntü üzerinde işaretleme (lokalizasyon). */

interface Props {
  q: Question
  caseId: string
  value: string[]
  onChange: (values: string[]) => void
  revealed: boolean
  disabled?: boolean
  index?: number
  total?: number
}

const EYEBROW: Record<string, string> = {
  finding_identify: 'Bulgu tanıma',
  localization: 'Lokalizasyon',
  film_quality: 'Film kalitesi',
  interpretation: 'Klinik yorum',
  diagnosis: 'Tanı',
  sequence: 'Sıralama',
  single_choice: 'Soru',
  multi_choice: 'Çok seçmeli',
}

export function QuestionCard({ q, caseId, value, onChange, revealed, disabled, index, total }: Props) {
  const isMulti = q.type === 'multi_choice'
  const options = shuffledOptions(caseId, q.id, q.options)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const showProgress = typeof index === 'number' && typeof total === 'number' && total > 0

  const toggle = (id: string) => {
    if (disabled || revealed) return
    if (isMulti) {
      const cur = new Set(value)
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      onChange([...cur])
    } else onChange([id])
  }

  const onOptKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (isMulti || disabled || revealed) return
    const dir = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[e.key]
    if (!dir) return
    e.preventDefault()
    const next = (i + dir + options.length) % options.length
    btnRefs.current[next]?.focus()
    toggle(options[next].id)
  }

  return (
    <div className="q-block">
      <div className="q-eyebrow-row">
        <span className="q-eyebrow">{EYEBROW[q.type] ?? 'Soru'}</span>
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
      <p className="q-text">{q.prompt}</p>
      {q.help && <p className="q-help">{q.help}</p>}
      {q.type === 'localization' ? (
        <MarkStatus value={value} onClear={revealed || disabled ? undefined : () => onChange([])} />
      ) : (
        <div className="opt-list" role={isMulti ? 'group' : 'radiogroup'} aria-label={q.prompt}>
          {options.map((o, i) => {
            const selected = value.includes(o.id)
            const isCorrectOpt = revealed && q.correct.includes(o.id)
            const isWrongSelected = revealed && selected && !q.correct.includes(o.id)
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
                <span className={isMulti ? 'check' : 'radio'}>{isMulti && <IconCheck />}</span>
                <span>{o.label}</span>
                {isCorrectOpt && <span className="mark" aria-hidden="true"><IconCheckCircle /></span>}
                {isWrongSelected && <span className="mark" aria-hidden="true"><IconXCircle /></span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MarkStatus({ value, onClear }: { value: string[]; onClear?: () => void }) {
  const p = decodeMark(value[0])
  return (
    <div className={`mark-status ${p ? 'has-mark' : ''}`} role="status">
      {p ? (
        <>
          <span>İşaret yerleştirildi. Değiştirmek için filmde başka bir noktaya tıklayın.</span>
          {onClear && <button type="button" className="link-btn" onClick={onClear}>İşareti kaldır</button>}
        </>
      ) : (
        <span>Soldaki filmde İşaretle aracı açık. Bulgunun üzerine tıklayın ya da klavyeyle görünümü ortalayıp Enter'a basın.</span>
      )}
    </div>
  )
}

/** Yanıt sonrası eğitim geri bildirimi. */
export function FeedbackCard({ correct, q, given }: { correct: boolean; q: Question; given: string[] }) {
  const isMark = q.type === 'localization'
  const correctLabels = q.correct.map((cid) => q.options.find((o) => o.id === cid)?.label ?? '').filter(Boolean)
  return (
    <div className="card mt-12 feedback-card">
      <div className={`feedback-head ${correct ? 'good' : 'bad'}`}>
        <div className={`ic ${correct ? 'good' : 'bad'}`}>{correct ? <IconCheckCircle /> : <IconXCircle />}</div>
        <h2>{correct ? 'Doğru' : 'Yanlış'}</h2>
      </div>
      {isMark ? (
        <p className="feedback-verdict">
          {correct
            ? `İşaretiniz ${findingShort(q.targetFinding)} için uzman işaretlemesinin içinde.`
            : `İşaretiniz uzman işaretlemesinin dışında kaldı. Filmde ${findingShort(q.targetFinding)} alanı şimdi kutuyla gösteriliyor.`}
        </p>
      ) : (
        <>
          {!correct && given.length > 0 && (
            <p className="feedback-verdict">Yanıtınız: {given.map((id) => q.options.find((o) => o.id === id)?.label).filter(Boolean).join(', ')}</p>
          )}
          {!correct && <p className="feedback-verdict good-text">Doğru yanıt: {correctLabels.join(', ')}</p>}
        </>
      )}
      <p className="feedback-text">{correct ? q.feedbackCorrect : q.feedbackIncorrect}</p>
    </div>
  )
}
