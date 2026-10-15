import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getCandidateProfile, getJobSearchGoal, PersonalApiError, saveCandidateProfile, saveJobSearchGoal } from '../../profile/api/profileMatch'
import { constraintKinds, evidenceKinds, importanceLabels } from '../../profile/types/profileMatch'
import type { CandidateProfile, ConstraintKind, EvidenceKind, JobSearchGoal } from '../../profile/types/profileMatch'
import type { RequirementImportance } from '../../postings/types/postingDetails'
import './CandidateWorkspace.css'

type Document = CandidateProfile | JobSearchGoal | null
type Entry = { localId: string; serverId: string | null; kind: EvidenceKind | ConstraintKind; label: string; description: string; importance: RequirementImportance }
const label = (value: string) => value === 'office' ? 'work arrangement' : value.replaceAll('_', ' ')
function entries(document: Document): Entry[] {
  if (document === null) return []
  return ('evidence' in document ? document.evidence : document.constraints).map(e => ({
    localId: 'evidence_id' in e ? e.evidence_id : e.constraint_id,
    serverId: 'evidence_id' in e ? e.evidence_id : e.constraint_id,
    kind: e.kind, label: e.label, description: e.description ?? '', importance: 'importance' in e ? e.importance : 'unknown',
  }))
}

function PersonalDocumentEditor({ kind }: { kind: 'profile' | 'goal' }) {
  const title = kind === 'profile' ? 'Background and skills' : 'Job preferences'
  const [saved, setSaved] = useState<Document>(null)
  const [draft, setDraft] = useState<Entry[]>([])
  const [objective, setObjective] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [needsRead, setNeedsRead] = useState(false)
  const [comparison, setComparison] = useState<{ document: Document } | null>(null)
  const active = useRef(false)
  const inFlight = useRef(true)
  const initialRequest = useRef<Promise<Document> | null>(null)
  const editTrigger = useRef<HTMLButtonElement>(null)
  const draftHeading = useRef<HTMLLegendElement>(null)
  const wasEditing = useRef(false)

  useEffect(() => {
    if (editing) draftHeading.current?.focus()
    else if (wasEditing.current) editTrigger.current?.focus()
    wasEditing.current = editing
  }, [editing])

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
      if (active.current) { adopt(document); setEditing(false); setMessage(`${title} saved and confirmed.`) }
    } catch (caught) {
      if (active.current) {
        setError(caught instanceof Error ? caught.message : 'Could not confirm the save. Read saved data before another write.')
        if (!(caught instanceof PersonalApiError) || caught.reconcile) { setNeedsRead(true); setConfirmed(false) }
      }
    } finally { inFlight.current = false; if (active.current) setBusy(false) }
  }

  const savedEntries = entries(saved)
  const savedObjective = saved !== null && 'objective' in saved ? saved.objective : null
  const hasContent = savedEntries.length > 0 || Boolean(savedObjective)

  return <section className="candidate-workspace__section" aria-labelledby={`${kind}-title`} aria-busy={busy}>
    <div className="candidate-workspace__heading"><h2 id={`${kind}-title`}>{title}</h2>
      {loaded && !editing && <button type="button" ref={editTrigger} disabled={busy} onClick={() => { if (inFlight.current) return; setEditing(true); setMessage('') }}>
        {hasContent ? 'Edit' : kind === 'profile' ? 'Add background and skills' : 'Set job preferences'}
      </button>}</div>
    {error && <p className="candidate-workspace__error" role="alert">{error}</p>}
    {error && loaded && !needsRead && editing && <p>Your draft is still here. Check the entries, then confirm and save again.</p>}
    {(busy || message) && <p role="status">{busy ? loaded ? 'Working…' : 'Loading…' : message}</p>}
    {!loaded && !busy && <button type="button" onClick={() => void read()}>Try again</button>}
    {needsRead && <div className="candidate-workspace__recovery">
      <p>Your draft is kept below. Read and compare the saved content before editing again; do not repeat a save whose result is uncertain.</p>
      <button type="button" onClick={() => void read()} disabled={busy}>Read saved {kind === 'profile' ? 'Profile' : 'Goal'}</button>
    </div>}
    {comparison && <div className="candidate-workspace__comparison">
      <h4>Saved version for comparison</h4>
      <p>{comparison.document ? `Revision ${comparison.document.revision}` : 'No saved document'}</p>
      {comparison.document && 'objective' in comparison.document && <p>{comparison.document.objective ?? 'Objective unknown'}</p>}
      <ul>{entries(comparison.document).map(e => <li key={e.serverId}><strong>{e.label}</strong> · {label(e.kind)} · {importanceLabels[e.importance]}<p>{e.description || 'No additional detail'}</p></li>)}</ul>
      <p>Further writes stay locked. Use this saved version before editing again; this explicitly replaces the retained draft, and avoids replaying a save that may already have committed.</p>
      <button type="button" disabled={busy} onClick={() => { if (inFlight.current) return; adopt(comparison.document); setEditing(false); setMessage('Saved version adopted. You can now make and confirm new changes.') }}>Use saved version</button>
    </div>}
    {loaded && !editing && <div className="candidate-workspace__saved">
      {saved && <p className="candidate-workspace__saved-label">Saved · confirmed by you</p>}
      {savedObjective && <p className="candidate-workspace__objective"><strong>Looking for</strong>{savedObjective}</p>}
      {savedEntries.length > 0 ? <ul className="candidate-workspace__saved-list">
        {savedEntries.map(entry => <li key={entry.serverId}>
          <div className="candidate-workspace__saved-meta">{label(entry.kind)}{kind === 'goal' && <> · {importanceLabels[entry.importance]}</>}</div>
          <strong>{entry.label}</strong>
          {entry.description && <p>{entry.description}</p>}
        </li>)}
      </ul> : <p>{kind === 'profile' ? 'No background or skills added yet. Add qualifications, languages or experience when you are ready.' : 'No preferences added yet. You can add locations, work arrangements or hours that suit you.'} Unfilled information stays unknown.</p>}
      <button className="candidate-workspace__secondary" type="button" disabled={busy} onClick={() => void read()}>Refresh saved {kind === 'profile' ? 'background and skills' : 'job preferences'}</button>
    </div>}
    {loaded && editing && <form onSubmit={save}>
      <fieldset disabled={busy || needsRead}>
        <legend className="candidate-workspace__legend" ref={draftHeading} tabIndex={-1}>Edit {title.toLowerCase()}</legend>
        <p className="candidate-workspace__help">{kind === 'profile' ? 'Add only background, skills and experience you can confirm.' : 'Describe what you are looking for, separately from your abilities.'} Unfilled information stays unknown, not a gap.</p>
        {kind === 'goal' && <label className="candidate-workspace__field">Objective (optional)
          <textarea value={objective} placeholder="Skip / unknown" onChange={e => { setObjective(e.target.value); setConfirmed(false); setMessage('') }} />
        </label>}
        {draft.length === 0 && <p>You can leave this section empty. Confirming an empty section does not mean you lack abilities or preferences.</p>}
        {draft.map((entry, index) => <div className="candidate-workspace__entry" key={entry.localId}>
          <div className="candidate-workspace__entry-heading"><strong>{kind === 'profile' ? 'Background or skill' : 'Preference'} {index + 1}</strong>
            <button className="candidate-workspace__secondary" type="button" onClick={() => { setDraft(current => current.filter(e => e.localId !== entry.localId)); setConfirmed(false); setMessage('') }}>Remove {kind === 'profile' ? 'entry' : 'preference'} {index + 1}</button></div>
          <div className={`candidate-workspace__row candidate-workspace__row--${kind}`}>
            <label className="candidate-workspace__field">Type<select value={entry.kind} onChange={e => changeEntry(entry.localId, { kind: e.target.value as Entry['kind'] })}>
              {(kind === 'profile' ? evidenceKinds : constraintKinds).map(value => <option key={value} value={value}>{label(value)}</option>)}
            </select></label>
            <label className="candidate-workspace__field">{kind === 'profile' ? 'Confirmed fact' : 'Preference'}<input required value={entry.label} onChange={e => changeEntry(entry.localId, { label: e.target.value })} /></label>
            {kind === 'goal' && <label className="candidate-workspace__field">Priority<select value={entry.importance} onChange={e => changeEntry(entry.localId, { importance: e.target.value as RequirementImportance })}>
              {Object.entries(importanceLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select></label>}
          </div>
          <label className="candidate-workspace__field">{kind === 'profile' ? 'Supporting details' : 'Additional details'} (optional)<textarea value={entry.description} placeholder="Skip / unknown" onChange={e => changeEntry(entry.localId, { description: e.target.value })} /></label>
        </div>)}
        <button type="button" onClick={() => { setDraft(current => [...current, { localId: crypto.randomUUID(), serverId: null, kind: kind === 'profile' ? 'skill' : 'location', label: '', description: '', importance: 'unknown' }]); setConfirmed(false); setMessage('') }}>Add {kind === 'profile' ? 'background or skill' : 'preference'}</button>
        <label className="candidate-workspace__confirmation"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm these {kind === 'profile' ? 'facts and supporting details' : 'goals and preferences'}, including removals. Unfilled information remains unknown.</label>
      </fieldset>
      <div className="candidate-workspace__actions">
        <button className="button--primary" type="submit" disabled={busy || !confirmed || needsRead}>Save {title.toLowerCase()}</button>
        <button type="button" disabled={busy || needsRead} onClick={() => { if (inFlight.current || needsRead) return; adopt(saved); setEditing(false); setMessage('Draft cancelled. No write was sent.') }}>Cancel</button>
      </div>
    </form>}
  </section>
}

export function CandidateWorkspace() {
  return <div className="candidate-workspace">
    <PersonalDocumentEditor kind="profile" />
    <PersonalDocumentEditor kind="goal" />
  </div>
}
