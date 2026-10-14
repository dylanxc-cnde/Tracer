import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getCandidateProfile, getJobSearchGoal, PersonalApiError, saveCandidateProfile, saveJobSearchGoal } from '../../profile/api/profileMatch'
import { constraintKinds, evidenceKinds, importanceLabels } from '../../profile/types/profileMatch'
import type { CandidateProfile, ConstraintKind, EvidenceKind, JobSearchGoal } from '../../profile/types/profileMatch'
import type { RequirementImportance } from '../../postings/types/postingDetails'
import './CandidateWorkspace.css'

type Document = CandidateProfile | JobSearchGoal | null
type Entry = { localId: string; serverId: string | null; kind: EvidenceKind | ConstraintKind; label: string; description: string; importance: RequirementImportance }
const label = (value: string) => value.replaceAll('_', ' ')
function entries(document: Document): Entry[] {
  if (document === null) return []
  return ('evidence' in document ? document.evidence : document.constraints).map(e => ({
    localId: 'evidence_id' in e ? e.evidence_id : e.constraint_id,
    serverId: 'evidence_id' in e ? e.evidence_id : e.constraint_id,
    kind: e.kind, label: e.label, description: e.description ?? '', importance: 'importance' in e ? e.importance : 'unknown',
  }))
}

function PersonalDocumentEditor({ kind }: { kind: 'profile' | 'goal' }) {
  const title = kind === 'profile' ? 'Confirmed evidence' : 'Job-search goal'
  const [saved, setSaved] = useState<Document>(null)
  const [draft, setDraft] = useState<Entry[]>([])
  const [objective, setObjective] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [needsRead, setNeedsRead] = useState(false)
  const [comparison, setComparison] = useState<{ document: Document } | null>(null)
  const active = useRef(false)
  const inFlight = useRef(true)
  const initialRequest = useRef<Promise<Document> | null>(null)

  function adopt(document: Document) {
    setSaved(document); setDraft(entries(document))
    setObjective(document !== null && 'objective' in document ? document.objective ?? '' : '')
    setConfirmed(false); setNeedsRead(false); setComparison(null); setError(''); setLoaded(true)
  }

  useEffect(() => {
    active.current = true
    const promise = initialRequest.current ??= kind === 'profile' ? getCandidateProfile() : getJobSearchGoal()
    promise.then(document => {
      if (!active.current) return
      setSaved(document); setDraft(entries(document))
      setObjective(document !== null && 'objective' in document ? document.objective ?? '' : '')
      setLoaded(true)
      inFlight.current = false; setBusy(false)
    }, () => { if (active.current) { setError('Could not load local data. Try reading again.'); inFlight.current = false; setBusy(false) } })
    return () => { active.current = false }
  }, [kind])

  async function read() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const document = await (kind === 'profile' ? getCandidateProfile() : getJobSearchGoal())
      if (!active.current) return
      if (needsRead) { setComparison({ document }); setMessage('Saved data read. Your draft is retained below; compare before using the saved version.') }
      else { adopt(document); setMessage('Saved data read.') }
    } catch { if (active.current) setError('Could not read saved data. Your draft has not changed.') }
    finally { inFlight.current = false; if (active.current) setBusy(false) }
  }

  function changeEntry(id: string, patch: Partial<Entry>) {
    setDraft(current => current.map(e => e.localId === id ? { ...e, ...patch } : e))
    setConfirmed(false); setMessage('')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || !loaded || !confirmed || needsRead) return
    inFlight.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const expected_revision = saved?.revision ?? 0
      const document = kind === 'profile' ? await saveCandidateProfile({ expected_revision, evidence: draft.map(e => ({
        evidence_id: e.serverId, kind: e.kind as EvidenceKind, label: e.label.trim(), description: e.description.trim() || null,
      })) }) : await saveJobSearchGoal({ expected_revision, objective: objective.trim() || null, constraints: draft.map(e => ({
        constraint_id: e.serverId, kind: e.kind as ConstraintKind, label: e.label.trim(), description: e.description.trim() || null, importance: e.importance,
      })) })
      if (active.current) { adopt(document); setMessage(`${title} saved and confirmed.`) }
    } catch (caught) {
      if (active.current) {
        setError(caught instanceof Error ? caught.message : 'Could not confirm the save. Read saved data before another write.')
        if (!(caught instanceof PersonalApiError) || caught.reconcile) { setNeedsRead(true); setConfirmed(false) }
      }
    } finally { inFlight.current = false; if (active.current) setBusy(false) }
  }

  return <section className="candidate-workspace__section" aria-labelledby={`${kind}-title`} aria-busy={busy}>
    <div className="candidate-workspace__heading"><h3 id={`${kind}-title`}>{title}</h3>
      <span>{loaded ? saved ? `Saved revision ${saved.revision}` : 'Not recorded yet' : 'Not loaded'}</span></div>
    <p>{kind === 'profile' ? 'Record only facts and evidence you confirm. Not providing evidence means unknown, not a gap.' : 'Record your current objective and constraints, independently of your abilities. Optional fields can stay unknown.'}</p>
    {error && <p className="candidate-workspace__error" role="alert">{error}</p>}
    <p role="status">{busy ? 'Working…' : message}</p>
    {(!loaded || needsRead) && <button type="button" onClick={() => void read()} disabled={busy}>Read saved {kind === 'profile' ? 'Profile' : 'Goal'}</button>}
    {comparison && <div className="candidate-workspace__comparison">
      <h4>Saved version for comparison</h4>
      <p>{comparison.document ? `Revision ${comparison.document.revision}` : 'No saved document'}</p>
      {comparison.document && 'objective' in comparison.document && <p>{comparison.document.objective ?? 'Objective unknown'}</p>}
      <ul>{entries(comparison.document).map(e => <li key={e.serverId}><strong>{e.label}</strong> · {label(e.kind)} · {importanceLabels[e.importance]}<p>{e.description || 'No additional detail'}</p></li>)}</ul>
      <p>Further writes stay locked. Use this saved version before editing again; this explicitly replaces the retained draft, and avoids replaying a save that may already have committed.</p>
      <button type="button" disabled={busy} onClick={() => { adopt(comparison.document); setMessage('Saved version adopted. Review and confirm any new edits.') }}>Use saved version</button>
    </div>}
    {loaded && <form onSubmit={save}>
      <fieldset disabled={busy || needsRead}>
        <legend className="candidate-workspace__legend">{title} draft</legend>
        {kind === 'goal' && <label className="candidate-workspace__field">Objective (optional)
          <textarea value={objective} placeholder="Skip / unknown" onChange={e => { setObjective(e.target.value); setConfirmed(false); setMessage('') }} />
        </label>}
        {draft.length === 0 && <p>No {kind === 'profile' ? 'evidence' : 'constraints'} recorded. You can skip this section or explicitly save it empty; neither means a confirmed gap.</p>}
        {draft.map((entry, index) => <div className="candidate-workspace__entry" key={entry.localId}>
          <div className="candidate-workspace__entry-heading"><strong>{kind === 'profile' ? 'Evidence' : 'Constraint'} {index + 1}</strong>
            <button type="button" onClick={() => { setDraft(current => current.filter(e => e.localId !== entry.localId)); setConfirmed(false); setMessage('') }}>Remove {kind === 'profile' ? 'evidence' : 'constraint'} {index + 1}</button></div>
          <div className="candidate-workspace__row">
            <label className="candidate-workspace__field">Type<select value={entry.kind} onChange={e => changeEntry(entry.localId, { kind: e.target.value as Entry['kind'] })}>
              {(kind === 'profile' ? evidenceKinds : constraintKinds).map(value => <option key={value} value={value}>{label(value)}</option>)}
            </select></label>
            <label className="candidate-workspace__field">{kind === 'profile' ? 'Confirmed fact' : 'Constraint'}<input required value={entry.label} onChange={e => changeEntry(entry.localId, { label: e.target.value })} /></label>
            {kind === 'goal' && <label className="candidate-workspace__field">Priority<select value={entry.importance} onChange={e => changeEntry(entry.localId, { importance: e.target.value as RequirementImportance })}>
              {Object.entries(importanceLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select></label>}
          </div>
          <label className="candidate-workspace__field">Evidence or explanation (optional)<textarea value={entry.description} placeholder="Skip / unknown" onChange={e => changeEntry(entry.localId, { description: e.target.value })} /></label>
        </div>)}
        <button type="button" onClick={() => { setDraft(current => [...current, { localId: crypto.randomUUID(), serverId: null, kind: kind === 'profile' ? 'skill' : 'location', label: '', description: '', importance: 'unknown' }]); setConfirmed(false); setMessage('') }}>Add {kind === 'profile' ? 'evidence' : 'constraint'}</button>
        <label className="candidate-workspace__confirmation"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm these {kind === 'profile' ? 'facts and evidence' : 'goals and constraints'}, including removals. Unfilled information remains unknown.</label>
      </fieldset>
      <div className="candidate-workspace__actions">
        <button type="button" disabled={busy || needsRead} onClick={() => { adopt(saved); setMessage('Draft cancelled. No write was sent.') }}>Cancel {kind === 'profile' ? 'Profile' : 'Goal'} changes</button>
        <button className="button--primary" type="submit" disabled={busy || !confirmed || needsRead}>Save {kind === 'profile' ? 'Profile' : 'Goal'}</button>
      </div>
    </form>}
  </section>
}

export function CandidateWorkspace({ onClose }: { onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  return <div className="candidate-workspace" role="region" aria-labelledby="candidate-workspace-title" onKeyDown={event => { if (event.key === 'Escape' && !(event.target instanceof HTMLSelectElement) && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onClose() } }}>
    <div className="candidate-workspace__heading"><h2 id="candidate-workspace-title" ref={heading} tabIndex={-1}>Profile and Goal</h2><button type="button" onClick={onClose}>Close workspace</button></div>
    <p className="candidate-workspace__notice">Local only. No AI judgment or external sending. These records are separate from your display name and API settings. Closing discards unsaved drafts, not requests already sent; reopen and read saved data to reconcile.</p>
    <PersonalDocumentEditor kind="profile" />
    <PersonalDocumentEditor kind="goal" />
  </div>
}
