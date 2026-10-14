import { useEffect, useRef, useState, type FormEvent } from 'react'
import { evaluatePostingMatch, getPostingMatch, PersonalApiError, savePostingJudgment } from '../../../../profile/api/profileMatch'
import { importanceLabels, statusLabels } from '../../../../profile/types/profileMatch'
import type { EvidenceReference, Judgment, MatchGroup, MatchRecord, MatchStatus, MatchTarget, MatchView } from '../../../../profile/types/profileMatch'
import type { RequirementImportance } from '../../../../postings/types/postingDetails'
import './PostingCardMatch.css'

type ReviewDraft = { target: MatchTarget; group: MatchGroup; matchId: string; status: MatchStatus; reason: string; evidence: EvidenceReference[]; priority: RequirementImportance; confirmed: boolean }
const dimensionLabels = { qualification: 'Eligibility', capability: 'Abilities', preference: 'Preferences' }
const ruleLabels = { all_of: 'All core items (AND)', any_of: 'One core option (OR)', unknown: 'Relationship unknown' }

function basis(record: MatchRecord, ref: EvidenceReference): string {
  const entry = ref.kind === 'profile' ? record.profile_snapshot?.evidence.find(e => e.evidence_id === ref.entry_id)
    : record.goal_snapshot?.constraints.find(e => e.constraint_id === ref.entry_id)
  return entry ? `${entry.label}${entry.description ? ` — ${entry.description}` : ''}` : 'Evidence unavailable in this snapshot'
}

function evidenceOptions(record: MatchRecord, group: MatchGroup, target: MatchTarget): { ref: EvidenceReference; label: string }[] {
  if (group.dimension === 'preference') return (record.goal_snapshot?.constraints ?? []).filter(e => e.constraint_id === target.constraint_id)
    .map(e => ({ ref: { kind: 'goal', entry_id: e.constraint_id }, label: `${e.label}${e.description ? ` — ${e.description}` : ''}` }))
  return (record.profile_snapshot?.evidence ?? []).filter(e => group.dimension === 'qualification' ? e.kind === 'qualification' : e.kind !== 'qualification')
    .map(e => ({ ref: { kind: 'profile', entry_id: e.evidence_id }, label: `${e.label}${e.description ? ` — ${e.description}` : ''}` }))
}

function preferenceFacts(record: MatchRecord, target: MatchTarget): string {
  const kind = record.goal_snapshot?.constraints.find(e => e.constraint_id === target.constraint_id)?.kind
  const p = record.posting_snapshot
  const w = p.work_conditions
  switch (kind) {
    case 'work_type': return [p.classification.role_families?.value.join(', '), p.classification.workload_type?.value].filter(Boolean).join(' · ') || 'Not stated'
    case 'location': return [w.primary_address?.value, ...(w.address_candidates ?? [])].filter(Boolean).join(' · ') || 'Not stated'
    case 'office': return w.work_modes?.value.join(', ') || 'Not stated'
    case 'hours': return [w.weekly_hours ? `${w.weekly_hours.minimum ?? '?'}–${w.weekly_hours.maximum ?? '?'} hours/week` : null, w.schedule?.value].filter(Boolean).join(' · ') || 'Not stated'
    case 'availability': return [w.start_on?.value, w.duration?.value].filter(Boolean).join(' · ') || 'Not stated'
    case 'salary': return (p.compensation.entries ?? []).map(e => `${e.compensation_type}: ${e.minimum_amount ?? '?'}–${e.maximum_amount ?? '?'} ${e.currency ?? 'currency unknown'} / ${e.period ?? 'period unknown'} (${e.pay_basis}); ${e.applicable_groups.join(', ') || 'groups not stated'}; ${e.payment_conditions ?? 'conditions not stated'}`).join(' · ') || 'Not stated'
    default: return 'No confirmed Goal constraint'
  }
}

function MatchReview({ cardKey, onClose }: { cardKey: string; onClose: () => void }) {
  const [view, setView] = useState<MatchView | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(true)
  const [needsRead, setNeedsRead] = useState(false)
  const [hasRead, setHasRead] = useState(false)
  const [draft, setDraft] = useState<ReviewDraft | null>(null)
  const active = useRef(false)
  const inFlight = useRef(true)
  const heading = useRef<HTMLHeadingElement>(null)
  const editorHeading = useRef<HTMLHeadingElement>(null)
  const correctionTrigger = useRef<HTMLButtonElement | null>(null)
  const initialRequest = useRef<Promise<MatchView> | null>(null)

  useEffect(() => {
    active.current = true
    heading.current?.focus()
    const request = initialRequest.current ??= getPostingMatch(cardKey)
    request.then(result => { if (active.current) { setView(result); inFlight.current = false; setBusy(false) } }, () => { if (active.current) { setError('Could not load this local review. Try reading again or close to continue with the Card.'); inFlight.current = false; setBusy(false) } })
    return () => { active.current = false }
  }, [cardKey])

  async function read() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await getPostingMatch(cardKey)
      if (active.current) {
        setView(result); setHasRead(true)
        if (draft) { setNeedsRead(true); setDraft(current => current ? { ...current, confirmed: false } : null) }
        setMessage(needsRead || draft ? 'Saved review read. Compare your retained draft below before using the saved review.' : 'Current inputs and saved review read.')
      }
    } catch { if (active.current) setError('Could not read the review. Existing results and drafts remain unchanged.') }
    finally { inFlight.current = false; if (active.current) setBusy(false) }
  }

  async function write(operation: () => Promise<MatchView>) {
    if (inFlight.current || needsRead) return
    inFlight.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const result = await operation()
      if (active.current) {
        setView(result); setDraft(null); setMessage('Local review saved. No Profile or posting fact changed.')
        requestAnimationFrame(() => { if (active.current) { if (correctionTrigger.current?.isConnected) correctionTrigger.current.focus(); else heading.current?.focus() } })
      }
    } catch (caught) {
      if (active.current) {
        setError(caught instanceof Error ? caught.message : 'Save outcome unknown. Read saved data before another write.')
        if (!(caught instanceof PersonalApiError) || caught.reconcile) { setNeedsRead(true); setHasRead(false); setDraft(current => current ? { ...current, confirmed: false } : null) }
      }
    } finally { inFlight.current = false; if (active.current) setBusy(false) }
  }

  function edit(group: MatchGroup, target: MatchTarget, judgment: Judgment | undefined, trigger: HTMLButtonElement) {
    if (!view?.match || view.stale || needsRead || inFlight.current) return
    setDraft({ group, target, matchId: view.match.match_id, status: judgment?.status ?? 'unknown', reason: judgment?.reason ?? '', evidence: judgment?.evidence ?? [], priority: judgment?.confirmed_importance ?? 'unknown', confirmed: false })
    correctionTrigger.current = trigger
    requestAnimationFrame(() => { if (active.current) editorHeading.current?.focus() })
    setMessage(''); setError('')
  }
  function updateDraft(patch: Partial<ReviewDraft>) { setDraft(current => current ? { ...current, ...patch, confirmed: false } : null) }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft || !draft.confirmed || !view?.match || !view.current_inputs || view.stale || draft.matchId !== view.match.match_id) return
    const captured = draft
    void write(() => savePostingJudgment(cardKey, captured.matchId, captured.target.target_id, {
      expected_inputs: view.current_inputs!.fingerprint, expected_revision: view.match!.revision,
      status: captured.status, reason: captured.reason.trim() || null, evidence: captured.evidence,
      confirmed_importance: captured.group.dimension === 'qualification' && (captured.priority !== 'unknown' || captured.reason.trim()) ? captured.priority : null,
    }))
  }

  const m = view?.match
  const coverage = m?.summary.evidence_coverage
  const advantageGroups = m?.summary.groups.filter(g => g.status === 'met') ?? []
  const groupName = (id: string) => {
    const group = m?.groups.find(g => g.group_id === id)
    return group ? `${group.label.replaceAll('_', ' ')} — ${group.targets.filter(t => !t.is_example).map(t => t.label).join('; ')}` : 'Unknown group'
  }
  const gaps = m?.summary.groups.filter(g => g.status === 'missing' || g.status === 'partial') ?? []
  const savedJudgment = draft && m?.judgments.find(j => j.target_id === draft.target.target_id)

  return <section className="posting-match__panel" aria-labelledby="posting-match-title" aria-busy={busy} onKeyDown={event => { if (event.key === 'Escape' && !(event.target instanceof HTMLSelectElement) && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onClose() } }}>
    <div className="posting-match__heading"><h3 id="posting-match-title" ref={heading} tabIndex={-1}>Local match review</h3><button type="button" onClick={onClose}>Close match review</button></div>
    <p className="posting-match__notice">You confirm free-text comparisons and link evidence. Tracer only aggregates your judgments using AND/OR rules. No AI assessment, external sending, score or hiring probability.</p>
    <p>Closing or editing the Card discards the local draft, not a request already sent. Reopen and read saved data to reconcile.</p>
    {error && <p role="alert" className="posting-match__error">{error}</p>}
    <p role="status">{busy ? 'Working…' : message}</p>
    <div className="posting-match__actions"><button type="button" disabled={busy} onClick={() => void read()}>Read saved review</button>
      {view?.current_inputs && !draft && <button type="button" className="button--primary" disabled={busy || needsRead} onClick={() => void write(() => evaluatePostingMatch(cardKey, view.current_inputs!.fingerprint))}>{m ? view.stale ? 'Re-evaluate current inputs' : 'Review current inputs' : 'Start local review'}</button>}
    </div>
    {needsRead && <div className="posting-match__notice"><p>Writes are locked until you read and compare. No automatic retry. Your correction draft remains below.</p>
      {hasRead && <><p>Saved judgment: {savedJudgment ? `${statusLabels[savedJudgment.status]} — ${savedJudgment.reason ?? 'No reason recorded'}` : 'No corresponding saved judgment in this evaluation'}</p>
        <button type="button" disabled={busy} onClick={() => { setDraft(null); setNeedsRead(false); setHasRead(false); setMessage('Saved review adopted. Open a judgment to explicitly confirm new changes.'); heading.current?.focus() }}>Use saved review</button></>}
    </div>}
    {!view && !error && <p role="status">Loading local review…</p>}
    {view && !m && <p>No review recorded. Start a local review to see unknown items, then explicitly confirm the ones supported by your evidence. Configure Profile and Goal in Settings first if needed.</p>}
    {m && <>
      <p className={view?.stale ? 'posting-match__stale' : 'posting-match__versions'} role="status">{view?.stale ? `Needs re-evaluation: ${view.stale_reasons.join(', ')}. Old judgments are read-only and will not be copied.` : 'Inputs current at last read.'} Review {m.version}, saved revision {m.revision} · Profile {m.inputs.profile_revision} · Goal {m.inputs.goal_revision} · Rules {m.inputs.rule_revision}</p>
      <details><summary>Input versions and posting context</summary><p className="posting-match__versions">Posting snapshot: {m.inputs.posting_revision}<br />Current posting: {view?.current_inputs?.posting_revision ?? 'Unavailable'}<br />Current Profile {view?.current_inputs?.profile_revision ?? 'unknown'} · Goal {view?.current_inputs?.goal_revision ?? 'unknown'} · Rules {view?.current_inputs?.rule_revision ?? 'unknown'}</p></details>
      <div className="posting-match__summary">
        <div><h4>Advantages</h4>{advantageGroups.length ? <ul>{advantageGroups.map(g => <li key={g.group_id}>{dimensionLabels[g.dimension]} · {groupName(g.group_id)}</li>)}</ul> : <p>No confirmed advantages yet.</p>}</div>
        <div><h4>Evidence to add</h4><p>{coverage?.unknown ?? 0} unknown judgments; {coverage?.linked ?? 0} of {coverage?.total ?? 0} items linked to confirmed evidence; {coverage?.explicitly_not_applicable ?? 0} explicitly not applicable. These are counts, not a score.</p></div>
        <div><h4>Explicit gaps</h4>{gaps.length ? <ul>{gaps.map(g => <li key={g.group_id}>{groupName(g.group_id)} · {importanceLabels[g.importance]}{m.summary.qualification_warnings.includes(g.group_id) ? ' — required eligibility gate; abilities do not override it' : g.dimension === 'preference' ? ' — preference conflict, not lack of eligibility' : g.dimension === 'capability' ? ' — ability gap' : ' — eligibility gap; priority as confirmed above'}</li>)}</ul> : <p>No confirmed gaps. Unknown does not mean met.</p>}</div>
        <div><h4>Next steps</h4><p>{view?.stale ? 'Re-evaluate changed inputs before confirming judgments.' : coverage?.unknown ? 'Add missing Profile evidence or Goal constraints in Settings, then re-evaluate and confirm comparisons below.' : gaps.length ? 'Review the specific gaps before making your own application decision.' : 'Review your evidence and decide your next action. Saving a match never records an application.'}</p></div>
      </div>
      <p className="posting-match__legend">Met: confirmed evidence satisfies the condition. Partially met: confirmed related evidence is insufficient. Confirmed gap: explicitly not satisfied. Unknown: insufficient information. Not applicable: explicitly irrelevant with a reason.</p>
      {m.groups.map(group => {
        const result = m.summary.groups.find(g => g.group_id === group.group_id)
        const source = group.dimension === 'qualification' || group.label === 'work_type' ? m.posting_snapshot.classification.source : group.dimension === 'capability' ? m.posting_snapshot.requirements.source : group.label === 'salary' ? m.posting_snapshot.compensation.source : m.posting_snapshot.work_conditions.source
        return <details className="posting-match__group" key={group.group_id}>
          <summary>{dimensionLabels[group.dimension]} · {group.label} <span className={`posting-match__status posting-match__status--${result?.status ?? 'unknown'}`}>{statusLabels[result?.status ?? 'unknown']}</span></summary>
          <p>{importanceLabels[result?.importance ?? group.importance]} · {ruleLabels[group.item_rule]} · Examples do not decide the group result.</p>
          {source?.excerpts.length > 0 && <details><summary>Posting source context (snapshot)</summary>{source.excerpts.map((excerpt, index) => <p key={index}>{excerpt}</p>)}</details>}
          {group.targets.map(target => {
            const judgment = m.judgments.find(j => j.target_id === target.target_id)
            return <div className="posting-match__target" key={target.target_id}>
              <div className="posting-match__heading"><strong>{target.label}{target.is_example ? ' (example)' : ''}</strong><span className={`posting-match__status posting-match__status--${judgment?.status ?? 'unknown'}`}>{statusLabels[judgment?.status ?? 'unknown']}</span></div>
              {group.dimension === 'preference' && <p>Posting facts: {preferenceFacts(m, target)}</p>}
              {!target.posting_available && <p>Posting information missing. This cannot be confirmed as satisfied or a gap.</p>}
              <p>{judgment?.confirmed_at ? 'User-confirmed judgment' : 'Not yet confirmed'}{judgment?.reason ? ` — ${judgment.reason}` : ''}</p>
              {judgment?.evidence.length ? <ul>{judgment.evidence.map(ref => <li key={`${ref.kind}:${ref.entry_id}`}>{basis(m, ref)}</li>)}</ul> : <p>No linked confirmed evidence.</p>}
              {!view?.stale && <button type="button" disabled={busy || needsRead || draft !== null} onClick={event => edit(group, target, judgment, event.currentTarget)}>Confirm or correct {target.label}</button>}
            </div>
          })}
        </details>
      })}
    </>}
    {draft && m && <form className="posting-match__editor" onSubmit={submit}>
      <h4 ref={editorHeading} tabIndex={-1}>Confirm judgment: {draft.target.label}</h4>
      <fieldset disabled={busy || needsRead || view?.stale || draft.matchId !== m.match_id}>
        <legend>Your local comparison</legend>
        <label>Status<select value={draft.status} onChange={e => updateDraft({ status: e.target.value as MatchStatus })}>
          {Object.entries(statusLabels).filter(([value]) => draft.target.posting_available || ['unknown', 'not_applicable'].includes(value)).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>
        {draft.group.dimension === 'qualification' && <label>Eligibility priority (you interpret the posting text)<select value={draft.priority} onChange={e => updateDraft({ priority: e.target.value as RequirementImportance })}>
          {Object.entries(importanceLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>}
        <label>Reason<textarea required={draft.status !== 'unknown' || (draft.group.dimension === 'qualification' && draft.priority !== 'unknown')} value={draft.reason} onChange={e => updateDraft({ reason: e.target.value })} /></label>
        <div className="posting-match__evidence"><strong>Link confirmed {draft.group.dimension === 'preference' ? 'Goal constraint' : 'Profile evidence'}</strong>
          {evidenceOptions(m, draft.group, draft.target).map(option => <label key={option.ref.entry_id}><input type="checkbox" checked={draft.evidence.some(e => e.kind === option.ref.kind && e.entry_id === option.ref.entry_id)} onChange={e => updateDraft({ evidence: e.target.checked ? [...draft.evidence, option.ref] : draft.evidence.filter(ref => ref.entry_id !== option.ref.entry_id || ref.kind !== option.ref.kind) })} />{option.label}</label>)}
          {evidenceOptions(m, draft.group, draft.target).length === 0 && <p>No suitable confirmed evidence in this snapshot. Keep unknown, or update Profile/Goal in Settings and re-evaluate. Missing evidence is not a confirmed gap.</p>}
        </div>
        {['met', 'partial', 'missing'].includes(draft.status) && !draft.evidence.length && <p className="posting-match__error">Link confirmed evidence before saving this status.</p>}
        <label className="posting-match__confirmation"><input type="checkbox" checked={draft.confirmed} onChange={e => setDraft(current => current ? { ...current, confirmed: e.target.checked } : null)} />I confirm this comparison and its evidence. This changes only the assessment, not my abilities or the posting.</label>
      </fieldset>
      <div className="posting-match__actions"><button type="button" disabled={busy || needsRead} onClick={() => { setDraft(null); setError(''); requestAnimationFrame(() => { if (active.current) correctionTrigger.current?.focus() }) }}>Cancel judgment changes</button>
        <button type="submit" className="button--primary" disabled={busy || needsRead || !!view?.stale || draft.matchId !== m.match_id || !draft.confirmed || (['met', 'partial', 'missing'].includes(draft.status) && !draft.evidence.length)}>Save judgment</button></div>
    </form>}
  </section>
}

export function PostingCardMatch({ cardKey }: { cardKey: string }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <div className="posting-match">
    {!open && <button type="button" ref={trigger} onClick={() => setOpen(true)}>Review match</button>}
    {open && <MatchReview cardKey={cardKey} onClose={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()) }} />}
  </div>
}
