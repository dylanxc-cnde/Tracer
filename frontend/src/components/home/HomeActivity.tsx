import { cloneElement, useMemo } from 'react'
import { ActivityCalendar } from 'react-activity-calendar'
import { localDate } from '../../home/api/home'
import type { ActivityKind, HomeActivityData, HomeOverview } from '../../home/types/home'

const descriptions: Record<ActivityKind, string> = {
  card_saved: 'Job saved', card_updated: 'Job updated', task_completed: 'Task completed',
  application_recorded: 'Application recorded', application_status_changed: 'Application status changed',
  event_recorded: 'Event recorded', event_adjusted: 'Event adjusted',
}
export function HomeActivity({ overview, activity, error, loading, year, today, retry }: {
  overview: HomeOverview | null; activity: HomeActivityData | null; error: string | null
  loading: boolean; year: number; today: string; retry: () => void
}) {
  const days = useMemo(() => {
    if (!activity) return []
    const counts = new Map<string, number>()
    const seen = new Set<string>()
    for (const event of activity.events) {
      if (seen.has(event.event_id)) continue
      seen.add(event.event_id)
      const day = localDate(new Date(event.occurred_at))
      counts.set(day, (counts.get(day) ?? 0) + 1)
    }
    const cells = []
    // UTC enumerates date facts only; event bucketing above uses device-local time.
    const day = new Date(Date.UTC(year, 0, 1))
    while (day.getUTCFullYear() === year) {
      const date = day.toISOString().slice(0, 10)
      const count = counts.get(date) ?? 0
      cells.push({ date, count, level: Math.min(4, count) })
      day.setUTCDate(day.getUTCDate() + 1)
    }
    return cells
  }, [activity, year])
  const first = activity?.recording_started_at ? localDate(new Date(activity.recording_started_at)) : null
  return <>
    <section className="home-page__activity" aria-labelledby="home-activity-title" aria-busy={loading}>
      <div className="home-page__section-heading"><h2 className="home-page__section-title" id="home-activity-title">Workspace activity</h2><span className="home-page__activity-period">{year}</span></div>
      <p className="home-page__activity-note" id="home-activity-note">Recorded workspace operations, not applications or AI calls. Earlier history was not recorded. Dates use this device's local time.</p>
      {loading && activity && <p role="status">Refreshing activity…</p>}
      {error ? <div className="home-page__load-error"><p role="alert">{error}</p><button className="home-page__record-action" type="button" disabled={loading} onClick={retry}>Retry activity</button></div> : activity ? <>
        {!first && <p className="home-page__empty">No activity has been recorded yet. Completing a task, recording an event or application, or saving a job starts the record.</p>}
        <div className="home-page__activity-scroll" role="region" aria-labelledby="home-activity-title" aria-describedby="home-activity-note" tabIndex={0}>
          <ActivityCalendar data={days} className="home-page__activity-calendar" colorScheme="light" blockSize={11} blockMargin={3} blockRadius={3} fontSize={14} weekStart={1} showWeekdayLabels={['mon', 'wed', 'fri', 'sun']} showTotalCount={false}
            theme={{ light: ['var(--color-surface-muted)', 'var(--color-action-primary)'] }} labels={{ legend: { less: 'Less', more: 'More' } }}
            renderBlock={(block, cell) => {
              const future = cell.date > today
              const unrecorded = !first || cell.date < first
              const label = `${cell.date}: ${future ? 'Future date' : unrecorded ? 'Not recorded' : `${cell.count} recorded workspace operations`}`
              return cloneElement(block, { role: 'img', 'aria-label': label, className: future ? 'home-page__activity-day--future' : unrecorded ? 'home-page__activity-day--unrecorded' : undefined, children: <title>{label}</title> })
            }} />
        </div>
        <p className="home-page__activity-note">Dashed cells: not recorded. Zero after recording began means no recorded operations, not no real-world activity.</p>
      </> : <p role="status">Loading activity…</p>}
    </section>
    {overview && <>
      <section aria-labelledby="home-recent-activity-title"><div className="home-page__section-heading"><h2 className="home-page__section-title" id="home-recent-activity-title">Recent activity</h2></div>
        {overview.recent_activity.length ? <ul className="home-page__recent-list">{overview.recent_activity.map(({ event, card_missing }) => <li className="home-page__record-activity" key={event.event_id}><span>{descriptions[event.kind]}{card_missing ? ' · Job deleted' : ''}</span><time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString('en-GB')}</time></li>)}</ul> : <p className="home-page__empty">No recorded operations yet. Old saved jobs are not backfilled as activity.</p>}
      </section>
      <section className="home-page__usage" aria-labelledby="home-usage-title"><h2 className="home-page__usage-title" id="home-usage-title">AI usage</h2>
        <dl className="home-page__usage-metrics"><div><dt>Estimated cost this month</dt><dd>Not obtained</dd></div><div><dt>Tokens this month</dt><dd>Not obtained</dd></div></dl>
        <h3 className="home-page__budget-title">Monthly budget preferences</h3>
        {overview.ai_usage.providers.length ? <dl className="home-page__provider-budgets">{overview.ai_usage.providers.map(p => <div key={p.provider_key}><dt>{p.display_name} · {p.provider}</dt><dd>{p.budget_status === 'not_set' ? 'Not set' : `$${p.monthly_budget_usd?.toFixed(2)}`}</dd></div>)}</dl> : <p className="home-page__empty">No provider budget configured.</p>}
        <p className="home-page__activity-note">Budgets are preferences, not enforced limits. No usage records have been obtained.</p>
      </section>
    </>}
  </>
}
