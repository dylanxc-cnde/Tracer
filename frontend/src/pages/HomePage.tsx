import { useCallback, useEffect, useRef, useState } from 'react'
import { HomeGreeting } from '../components/home/HomeGreeting'
import { HomeRecords } from '../components/home/HomeRecords'
import { HomeActivity } from '../components/home/HomeActivity'
import { getHomeActivity, getHomeOverview, HomeApiError, localDate, overviewWindow } from '../home/api/home'
import type { HomeActivityData, HomeOverview } from '../home/types/home'
import { getSettings } from '../settings/api/settings'
import type { AppSettings } from '../settings/types/appSettings'
import {
  IconArrowRight,
  IconBookmark,
  IconBuilding,
  IconBulb,
  IconChevronRight,
  IconDots,
  IconExternalLink,
  IconFileText,
  IconSparkles,
} from '@tabler/icons-react'

function formatHomeTime(time: Date): string {
  return time.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
}

function homeSummary(data: HomeOverview): string {
  const tasks = data.today.tasks.length
  const events = data.today.events.length
  if (!tasks && !events && !data.your_search.active) return 'A new day for your search. Add a next step when you are ready.'
  return `${tasks} pending ${tasks === 1 ? 'task' : 'tasks'} for today, ${events} scheduled ${events === 1 ? 'event' : 'events'} and ${data.your_search.active} active ${data.your_search.active === 1 ? 'application' : 'applications'}.`
}

export function HomePage() {
  const [hasScrolledDiscover, setHasScrolledDiscover] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsLoadAttempt, setSettingsLoadAttempt] = useState(0)
  const settingsRequest = useRef<Promise<AppSettings> | null>(null)
  const [overview, setOverview] = useState<HomeOverview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [activity, setActivity] = useState<HomeActivityData | null>(null)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)
  const active = useRef(false)
  const readGeneration = useRef(0)
  const activityGeneration = useRef(0)
  // Use the device's local time; no profile or server timezone is needed yet.
  const [clockTimes, setClockTimes] = useState(() => {
    const currentTime = new Date()
    // Matching initial values keep the first render still.
    return { currentTime, previousTime: currentTime }
  })

  useEffect(() => {
    active.current = true
    // Read the clock again so delayed ticks do not accumulate drift.
    const intervalId = window.setInterval(() => {
      const currentTime = new Date()
      setClockTimes((previous) => ({ currentTime, previousTime: previous.currentTime }))
    }, 1_000)
    return () => {
      active.current = false
      readGeneration.current += 1
      activityGeneration.current += 1
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    let isActive = true
    // Reuse the request during Strict Mode replay; clock ticks do not reload settings.
    const request = settingsRequest.current ??= getSettings()
    async function loadDisplayName() {
      try {
        const settings = await request
        if (isActive) setDisplayName(settings.user.display_name)
      } catch (caughtError: unknown) {
        if (isActive) setSettingsError(caughtError instanceof Error
          ? caughtError.message : 'Your display name could not be loaded. Please try again.')
      }
    }
    void loadDisplayName()
    // Ignore late results after leaving Home; this does not cancel the HTTP request.
    return () => { isActive = false }
  }, [settingsLoadAttempt])

  function handleRetrySettings() {
    setSettingsError(null)
    settingsRequest.current = null
    setSettingsLoadAttempt((attempt) => attempt + 1)
  }
  const { currentTime, previousTime } = clockTimes
  const date = localDate(currentTime)
  const year = currentTime.getFullYear()
  const displayDate = currentTime.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const time = formatHomeTime(currentTime)
  const previousTimeText = formatHomeTime(previousTime)

  const refreshActivity = useCallback(async () => {
    const generation = ++activityGeneration.current
    setActivityLoading(true)
    try {
      const result = await getHomeActivity(year)
      if (active.current && generation === activityGeneration.current) { setActivity(result); setActivityError(null) }
    } catch (caught) {
      if (active.current && generation === activityGeneration.current) setActivityError(caught instanceof HomeApiError ? caught.message : 'Activity could not be loaded. Please retry.')
    } finally {
      if (active.current && generation === activityGeneration.current) setActivityLoading(false)
    }
  }, [year])
  const refreshOverview = useCallback(async () => {
    const generation = ++readGeneration.current
    setOverviewLoading(true)
    try {
      const result = await getHomeOverview(overviewWindow(date))
      if (active.current && generation === readGeneration.current) { setOverview(result); setOverviewError(null) }
      return result
    } catch (caught) {
      if (active.current && generation === readGeneration.current) setOverviewError(caught instanceof HomeApiError ? caught.message : 'Home could not be loaded. Please retry.')
      throw caught
    } finally {
      if (active.current && generation === readGeneration.current) setOverviewLoading(false)
    }
  }, [date])
  const refreshRecords = useCallback(async () => {
    // Refresh both projections after every confirmed write; an activity failure
    // is shown independently and never turns a confirmed save into a failed one.
    const [result] = await Promise.all([refreshOverview(), refreshActivity()])
    return result
  }, [refreshOverview, refreshActivity])
  useEffect(() => {
    void refreshOverview().catch(() => {})
    void refreshActivity()
    // Midnight/date changes reload records; the per-second clock does not.
  }, [refreshOverview, refreshActivity])

  return (
    <>
      <section className="home-page__personal" aria-labelledby="home-greeting-title">
        <div className="home-page__overview home-page__scroll-region" role="region" aria-label="Personal overview" tabIndex={0}>
          <div className="home-page__first-screen">
            <header className="home-page__intro">
              <time className="home-page__eyebrow" dateTime={date}>{displayDate}</time>
              <HomeGreeting hour={currentTime.getHours()} displayName={displayName} />
              {settingsError && <div className="home-page__settings-feedback"><p role="alert">{settingsError}</p><button className="home-page__settings-retry" type="button" onClick={handleRetrySettings} aria-label="Retry loading your display name">Retry</button></div>}
              {overview && <p className="home-page__summary">{homeSummary(overview)}</p>}
            </header>
            <div className="home-page__record-status" aria-busy={overviewLoading}>
              {overviewError && <div className="home-page__load-error"><p role="alert">{overviewError}</p>{overview && <p>Showing the last loaded records, not a confirmed current overview. Drafts remain here.</p>}<button className="home-page__record-action" type="button" disabled={overviewLoading} onClick={() => void refreshRecords().catch(() => {})}>Retry Home</button></div>}
              {overviewLoading && <p role="status">{overview ? 'Refreshing records…' : 'Loading Home…'}</p>}
              {overview && <button className="home-page__record-action" type="button" disabled={overviewLoading} onClick={() => void refreshRecords().catch(() => {})}>Refresh Home</button>}
            </div>
            {overview && <HomeRecords data={overview} today={date} refresh={refreshRecords} />}
          </div>
          <HomeActivity overview={overviewError ? null : overview} activity={activity} error={activityError} loading={activityLoading} year={year} today={date} retry={() => void refreshActivity()} />
        </div>
      </section>

      <section
        className="home-page__discover"
        aria-labelledby="home-discover-title"
        aria-describedby="home-preview-note"
        data-scrolled={hasScrolledDiscover}
      >
        <p className="home-page__visually-hidden" id="home-preview-note">
          Discover is a layout preview. Text bars, dates and counts are placeholders, not loading indicators.
          Preview controls are unavailable.
        </p>
        <header className="home-page__header">
          <div className="home-page__section-heading">
            <h2 className="home-page__discover-title" id="home-discover-title">Discover</h2>
            <button className="home-page__preview-button home-page__icon-button" type="button" disabled aria-label="Discover options preview">
              <IconDots aria-hidden="true" />
            </button>
          </div>
          <time className="home-page__date-time" dateTime={currentTime.toISOString()}>
            <span>{displayDate}</span>
            <span aria-hidden="true">·</span>
            {/* Read the current time once, without the outgoing animation digits. */}
            <span className="home-page__clock-readable">{time}</span>
            <span className="home-page__clock" aria-hidden="true">
              {time.split('').map((character, index) => {
                if (character === ':') {
                  return <span key={index}>:</span>
                }

                const previousCharacter = previousTimeText[index]
                const hasChanged = character !== previousCharacter

                // A changed key restarts the animation for this digit only.
                return (
                  <span className="home-page__clock-digit" key={`${index}-${character}`}>
                    {hasChanged && (
                      <span className="home-page__clock-digit-outgoing">
                        {previousCharacter}
                      </span>
                    )}
                    <span className={hasChanged ? 'home-page__clock-digit-incoming' : undefined}>
                      {character}
                    </span>
                  </span>
                )
              })}
            </span>
          </time>
        </header>

        <div
          className="home-page__discover-content home-page__scroll-region"
          role="region"
          aria-label="Discover updates"
          tabIndex={0}
          onScroll={(event) => setHasScrolledDiscover(event.currentTarget.scrollTop > 0)}
        >
          <section className="home-page__market" aria-labelledby="home-market-title">
            <div className="home-page__market-heading">
              <span className="home-page__brief-icon" aria-hidden="true"><IconFileText /></span>
              <h3 id="home-market-title">Market brief</h3>
              <span className="home-page__brief-age" aria-hidden="true"><span className="home-page__placeholder-line" /></span>
            </div>
            <div className="home-page__brief-copy" role="img" aria-label="Market brief text placeholder">
              <span className="home-page__placeholder-line home-page__placeholder-line--title" />
              <span className="home-page__placeholder-line home-page__placeholder-line--long" />
              <span className="home-page__placeholder-line home-page__placeholder-line--medium" />
            </div>
            <div className="home-page__brief-source" aria-hidden="true">
              <span className="home-page__placeholder-line" />
              <IconExternalLink />
            </div>
            <button className="home-page__preview-button home-page__text-action" type="button" disabled>
              Show more <IconArrowRight aria-hidden="true" />
            </button>
          </section>

          <section className="home-page__recommendations" aria-labelledby="home-recommendations-title">
            <div className="home-page__section-heading">
              <h3 className="home-page__recommendations-title" id="home-recommendations-title">Recommended jobs</h3>
              <button className="home-page__preview-button home-page__text-action" type="button" disabled>
                View all <IconArrowRight aria-hidden="true" />
              </button>
            </div>
            <ul className="home-page__recommendation-list" aria-label="Recommended job placeholders">
              {[0, 1, 2, 3, 4].map((slot) => (
                <li className="home-page__recommendation-row" key={slot} aria-label="Recommended job placeholder">
                  <span className="home-page__company-mark" aria-hidden="true"><IconBuilding /></span>
                  <div className="home-page__row-copy" aria-hidden="true">
                    <span className="home-page__placeholder-line home-page__placeholder-line--title" />
                    <span className="home-page__placeholder-line home-page__placeholder-line--medium" />
                    <span className="home-page__placeholder-line home-page__placeholder-line--short" />
                  </div>
                  <button className="home-page__preview-button home-page__icon-button home-page__bookmark" type="button" disabled aria-label="Save recommended job preview">
                    <IconBookmark aria-hidden="true" />
                  </button>
                  <button className="home-page__preview-button home-page__ask-button" type="button" disabled>
                    <IconSparkles aria-hidden="true" /> Ask Tracer
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="home-page__assistant-footer">
          <button className="home-page__preview-button home-page__assistant" type="button" disabled>
            <span className="home-page__assistant-icon" aria-hidden="true"><IconBulb /></span>
            <span className="home-page__assistant-copy">
              <span>Ask Tracer</span>
              <span className="home-page__placeholder-line" aria-hidden="true" />
            </span>
            <IconChevronRight aria-hidden="true" />
          </button>
        </footer>
      </section>
    </>
  )
}
