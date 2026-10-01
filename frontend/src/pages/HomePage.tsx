import { cloneElement, useEffect, useMemo, useState } from 'react'
import { ActivityCalendar } from 'react-activity-calendar'
import {
  IconArrowRight,
  IconBookmark,
  IconBuilding,
  IconBulb,
  IconCalendarEvent,
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconExternalLink,
  IconFileText,
  IconMail,
  IconPlus,
  IconSparkles,
  IconVideo,
} from '@tabler/icons-react'

function getHomeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return 'Good morning'
  }

  if (hour >= 12 && hour < 18) {
    return 'Good afternoon'
  }

  return 'Good evening'
}

function formatHomeTime(time: Date): string {
  return time.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
}

function createDemoSearchActivity(year: number, today: string) {
  const activities = []
  // UTC is only used to enumerate date-only cells without daylight-saving shifts.
  const day = new Date(Date.UTC(year, 0, 1))

  while (day.getUTCFullYear() === year) {
    const date = day.toISOString().slice(0, 10)
    // Fixed sample values let us review the layout without inventing user history.
    const sample = (day.getUTCDate() * 17 + day.getUTCMonth() * 11) % 19
    const count = date > today ? 0 : Math.max(0, sample - 9)

    activities.push({ date, count, level: Math.min(4, Math.ceil(count / 2)) })
    day.setUTCDate(day.getUTCDate() + 1)
  }

  return activities
}

export function HomePage() {
  const [hasScrolledDiscover, setHasScrolledDiscover] = useState(false)
  // Use the device's local time; no profile or server timezone is needed yet.
  const [clockTimes, setClockTimes] = useState(() => {
    const currentTime = new Date()
    // Matching initial values keep the first render still.
    return { currentTime, previousTime: currentTime }
  })

  useEffect(() => {
    // Read the clock again so delayed ticks do not accumulate drift.
    const intervalId = window.setInterval(() => {
      const currentTime = new Date()
      setClockTimes((previous) => ({
        currentTime,
        previousTime: previous.currentTime,
      }))
    }, 1_000)

    return () => window.clearInterval(intervalId)
  }, [])

  const { currentTime, previousTime } = clockTimes
  const date = [
    currentTime.getFullYear(),
    String(currentTime.getMonth() + 1).padStart(2, '0'),
    String(currentTime.getDate()).padStart(2, '0'),
  ].join('-')
  const displayDate = currentTime.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const time = formatHomeTime(currentTime)
  const previousTimeText = formatHomeTime(previousTime)
  const year = currentTime.getFullYear()
  // The clock ticks every second, but the demo calendar only changes each day.
  const demoActivity = useMemo(() => createDemoSearchActivity(year, date), [year, date])

  return (
    <>
      <section className="home-page__personal" aria-labelledby="home-greeting-title">
        <div
          className="home-page__overview home-page__scroll-region"
          role="region"
          aria-label="Personal overview"
          aria-describedby="home-preview-note"
          tabIndex={0}
        >
          <p className="home-page__visually-hidden" id="home-preview-note">
            Layout preview. Text bars, dates and counts are placeholders, not loading indicators.
            Preview controls are unavailable.
          </p>
          <div className="home-page__first-screen">
            <header className="home-page__intro">
              <time className="home-page__eyebrow" dateTime={date}>{displayDate}</time>
              <h1 className="home-page__greeting" id="home-greeting-title">
                {getHomeGreeting(currentTime.getHours())},
                <span className="home-page__name-placeholder" aria-hidden="true" />
              </h1>
              <div className="home-page__summary-preview" role="img" aria-label="Daily summary placeholder">
                <span className="home-page__placeholder-line home-page__placeholder-line--long" />
              </div>
            </header>

            <div className="home-page__schedule-columns">
              <section aria-labelledby="home-today-title">
                <div className="home-page__section-heading">
                  <h2 className="home-page__section-title" id="home-today-title">Today</h2>
                  <span className="home-page__count">— tasks</span>
                  <button className="home-page__preview-button home-page__text-action" type="button" disabled>
                    <IconPlus aria-hidden="true" /> Add task
                  </button>
                </div>

                <article className="home-page__featured-event" aria-label="Interview layout placeholder">
                  <svg
                    className="home-page__event-pattern"
                    viewBox="0 0 560 180"
                    preserveAspectRatio="xMidYMid slice"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M360 -40C366 32 318 73 282 119S227 190 236 221H560V-40Z" />
                    <path d="M418 28C467 14 497 54 498 96S530 155 575 166V224H304C318 154 351 49 418 28Z" />
                    <path d="M0 166C80 111 155 174 245 122S347 72 389 84C316 141 323 180 311 220H0Z" />
                  </svg>
                  <div className="home-page__event-topline">
                    <span className="home-page__eyebrow">Next up · Interview</span>
                    <span className="home-page__time-badge" aria-label="Time placeholder">—:— – —:—</span>
                  </div>
                  <div className="home-page__event-copy" aria-hidden="true">
                    <span className="home-page__placeholder-line home-page__placeholder-line--title" />
                    <span className="home-page__placeholder-line home-page__placeholder-line--medium" />
                  </div>
                  <div className="home-page__event-footer">
                    <span className="home-page__event-format">
                      <IconVideo aria-hidden="true" /> Video call · — min
                    </span>
                    <button className="home-page__preview-button home-page__prepare-button" type="button" disabled>
                      Prepare interview <IconArrowRight aria-hidden="true" />
                    </button>
                  </div>
                </article>

                <ul className="home-page__task-list" aria-label="Task placeholders">
                  {[0, 1].map((slot) => (
                    <li className="home-page__task-row" key={slot} aria-label="Task placeholder">
                      <span className="home-page__checkbox-placeholder" aria-hidden="true" />
                      <div className="home-page__row-copy" aria-hidden="true">
                        <span className="home-page__placeholder-line home-page__placeholder-line--title" />
                        <span className="home-page__placeholder-line home-page__placeholder-line--medium" />
                      </div>
                      <button className="home-page__preview-button home-page__icon-button" type="button" disabled aria-label="Task details preview">
                        <IconChevronRight aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="home-page__preview-button home-page__completed" type="button" disabled>
                  — completed today <IconChevronDown aria-hidden="true" />
                </button>
              </section>

              <section className="home-page__upcoming" aria-labelledby="home-upcoming-title">
                <div className="home-page__section-heading">
                  <h2 className="home-page__section-title" id="home-upcoming-title">Upcoming</h2>
                  <button className="home-page__preview-button home-page__text-action" type="button" disabled>
                    Next 14 days <IconArrowRight aria-hidden="true" />
                  </button>
                </div>
                <ul className="home-page__upcoming-list" aria-label="Upcoming event placeholders">
                  {[0, 1, 2].map((slot) => (
                    <li className="home-page__upcoming-row" key={slot} aria-label="Upcoming event placeholder">
                      <span className="home-page__date-tile" aria-hidden="true">
                        <span className="home-page__placeholder-line" />
                        <span>—</span>
                      </span>
                      <div className="home-page__row-copy" aria-hidden="true">
                        <span className="home-page__placeholder-line home-page__placeholder-line--title" />
                        <span className="home-page__placeholder-line home-page__placeholder-line--medium" />
                        <span className="home-page__placeholder-line home-page__placeholder-line--short" />
                      </div>
                      <IconCalendarEvent className="home-page__row-icon" aria-hidden="true" />
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section aria-labelledby="home-search-title">
              <div className="home-page__section-heading">
                <h2 className="home-page__section-title" id="home-search-title">Your search</h2>
              </div>
              <dl className="home-page__metrics">
                <div className="home-page__metric">
                  <span className="home-page__metric-icon home-page__metric-icon--applications" aria-hidden="true"><IconFileText /></span>
                  <dt>Active applications</dt>
                  <dd>—</dd>
                </div>
                <div className="home-page__metric">
                  <span className="home-page__metric-icon" aria-hidden="true"><IconMail /></span>
                  <dt>Awaiting reply</dt>
                  <dd>—</dd>
                </div>
                <div className="home-page__metric">
                  <span className="home-page__metric-icon" aria-hidden="true"><IconCalendarEvent /></span>
                  <dt>Interviews in next 7 days</dt>
                  <dd>—</dd>
                </div>
              </dl>
            </section>

            <section className="home-page__recent-jobs" aria-labelledby="home-recent-jobs-title">
              <div className="home-page__section-heading">
                <h2 className="home-page__section-title" id="home-recent-jobs-title">Recent jobs</h2>
                <button className="home-page__preview-button home-page__text-action" type="button" disabled>
                  View library <IconArrowRight aria-hidden="true" />
                </button>
              </div>
              <ul className="home-page__recent-list" aria-label="Saved job placeholders">
                {[0, 1, 2].map((slot) => (
                  <li className="home-page__recent-row" key={slot} aria-label="Saved job placeholder">
                    <span className="home-page__company-mark" aria-hidden="true"><IconBuilding /></span>
                    <div className="home-page__row-copy" aria-hidden="true">
                      <span className="home-page__placeholder-line home-page__placeholder-line--title" />
                      <span className="home-page__placeholder-line home-page__placeholder-line--medium" />
                    </div>
                    <span className="home-page__saved-time" aria-hidden="true"><span className="home-page__placeholder-line" /></span>
                    <button className="home-page__preview-button home-page__icon-button" type="button" disabled aria-label="Bookmark preview">
                      <IconBookmark aria-hidden="true" />
                    </button>
                    <button className="home-page__preview-button home-page__icon-button" type="button" disabled aria-label="Job details preview">
                      <IconChevronRight aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="home-page__activity" aria-labelledby="home-activity-title">
            <div className="home-page__section-heading">
              <h2 className="home-page__section-title" id="home-activity-title">Search activity</h2>
              <span className="home-page__activity-period">{year} · Demo</span>
            </div>
            <p className="home-page__activity-note" id="home-activity-note">
              Demo activity for layout review, not your recorded history.
            </p>
            <div
              className="home-page__activity-scroll"
              role="region"
              aria-labelledby="home-activity-title"
              aria-describedby="home-activity-note"
              tabIndex={0}
            >
              <ActivityCalendar
                data={demoActivity}
                className="home-page__activity-calendar"
                colorScheme="light"
                blockSize={11}
                blockMargin={3}
                blockRadius={3}
                fontSize={14}
                weekStart={1}
                showWeekdayLabels={['mon', 'wed', 'fri', 'sun']}
                showTotalCount={true}
                theme={{ light: ['var(--color-surface-muted)', 'var(--color-action-primary)'] }}
                labels={{ legend: { less: 'Less', more: 'More' } }}
                renderBlock={(block, activity) => {
                  const isFuture = activity.date > date
                  const label = isFuture
                    ? `${activity.date}: future date, no activity recorded`
                    : `${activity.date}: ${activity.count} demo activities`

                  return cloneElement(block, {
                    role: 'img',
                    'aria-label': label,
                    className: isFuture ? 'home-page__activity-day--future' : undefined,
                    children: <title>{label}</title>,
                  })
                }}
              />
            </div>
          </section>

          <section aria-labelledby="home-recent-activity-title">
            <div className="home-page__section-heading">
              <h2 className="home-page__section-title" id="home-recent-activity-title">Recent activity</h2>
            </div>
            <div className="home-page__activity-preview" role="img" aria-label="Recent activity placeholder">
              <span className="home-page__placeholder-line home-page__placeholder-line--long" />
              <span className="home-page__placeholder-line home-page__placeholder-line--medium" />
            </div>
          </section>

          <section className="home-page__usage" aria-labelledby="home-usage-title">
            <h2 className="home-page__usage-title" id="home-usage-title">AI usage</h2>
            <dl className="home-page__usage-metrics">
              <div><dt>Estimated cost this month</dt><dd>—</dd></div>
              <div><dt>Monthly budget</dt><dd>—</dd></div>
              <div><dt>Tokens this month</dt><dd>—</dd></div>
            </dl>
          </section>
        </div>
      </section>

      <section
        className="home-page__discover"
        aria-labelledby="home-discover-title"
        aria-describedby="home-preview-note"
        data-scrolled={hasScrolledDiscover}
      >
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
