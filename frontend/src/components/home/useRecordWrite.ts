import { useEffect, useRef, useState } from 'react'
import { HomeApiError } from '../../home/api/home'
import type { HomeOverview } from '../../home/types/home'

export type HomeRecordsRefresh = {
  generation: number
  isCurrent: (generation: number) => boolean
  start: () => { generation: number; result: Promise<HomeOverview> }
}
type Operation<Receipt> = {
  send: () => Promise<Receipt>
  saved: (receipt?: Receipt) => void
  matches: (data: HomeOverview) => boolean
}
const supersededCheck = 'A newer overview replaced this check. Refresh to check saved records before retrying.'

// One local write lifecycle per editor/row. Checking an uncertain outcome is a
// read, never a retry; a later explicit retry reuses the exact frozen operation.
export function useRecordWrite<Receipt = unknown>(refresh: HomeRecordsRefresh) {
  const active = useRef(false)
  const guard = useRef(false)
  const attempt = useRef<Operation<Receipt> | null>(null)
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [checkedGeneration, setCheckedGeneration] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const checked = checkedGeneration === refresh.generation
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])

  function clearFeedback() {
    setError(null)
    setMessage(null)
  }

  async function run(operation: Operation<Receipt>) {
    if (guard.current || (uncertain && (checkedGeneration === null || !refresh.isCurrent(checkedGeneration)))) return
    guard.current = true
    setPending(true)
    setCheckedGeneration(null)
    clearFeedback()
    // Preserve the action/payload after a lost response, even through re-renders.
    const current = uncertain && attempt.current ? attempt.current : operation
    attempt.current = current
    try {
      const receipt = await current.send()
      if (!active.current) return
      current.saved(receipt)
      setUncertain(false)
      attempt.current = null
      setMessage('Saved.')
      const { generation, result } = refresh.start()
      try { await result } catch {
        if (active.current && refresh.isCurrent(generation)) setMessage('Saved, but the updated overview could not be loaded. Refresh Home; do not submit again.')
      }
    } catch (caught) {
      if (!active.current) return
      const unknown = caught instanceof HomeApiError && caught.uncertain
      setError(caught instanceof HomeApiError ? caught.message : 'This change could not be confirmed. Refresh to check saved records before retrying.')
      setUncertain(unknown || !(caught instanceof HomeApiError))
    } finally {
      guard.current = false
      if (active.current) setPending(false)
    }
  }
  async function check() {
    const current = attempt.current
    if (guard.current || !current) return
    guard.current = true
    setPending(true)
    setCheckedGeneration(null)
    clearFeedback()
    const { generation, result } = refresh.start()
    try {
      const data = await result
      if (!active.current) return
      if (!refresh.isCurrent(generation)) {
        setError(supersededCheck)
        return
      }
      if (current.matches(data)) {
        current.saved()
        attempt.current = null
        setUncertain(false)
        setMessage('Saved record found after refresh.')
      } else {
        setCheckedGeneration(generation)
      }
    } catch {
      if (active.current) setError(refresh.isCurrent(generation)
        ? 'Refresh failed. Keep this draft and retry the check before another write.'
        : supersededCheck)
    } finally {
      guard.current = false
      if (active.current) setPending(false)
    }
  }
  const feedback = checked
    ? 'Refresh completed. This view does not confirm the change. You can explicitly retry the same request; its record ID will not change.'
    : error ?? (checkedGeneration !== null ? supersededCheck : null)
  return { run, check, clearFeedback, pending, uncertain, checked, error: feedback, message, locked: pending || uncertain }
}
