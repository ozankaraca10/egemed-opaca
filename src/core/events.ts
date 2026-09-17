import type { SimEvent } from './types'

/** Hafif iç analytics olay veriyolu (§28). SCORM'a yüksek frekanslı veri gönderilmez. */
class EventBus {
  private listeners = new Set<(e: SimEvent) => void>()
  private log: SimEvent[] = []

  emit(e: SimEvent) {
    this.log.push(e)
    if (this.log.length > 2000) this.log.splice(0, 500)
    for (const l of this.listeners) l(e)
  }

  subscribe(fn: (e: SimEvent) => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getLog() {
    return this.log
  }
}

export const bus = new EventBus()
