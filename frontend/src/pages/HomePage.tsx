import { cloneElement, useEffect, useMemo, useState } from 'react'
import { ActivityCalendar } from 'react-activity-calendar'

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
  const time = formatHomeTime(currentTime)
  const previousTimeText = formatHomeTime(previousTime)
  const year = currentTime.getFullYear()
  // The clock ticks every second, but the demo calendar only changes each day.
  const demoActivity = useMemo(() => createDemoSearchActivity(year, date), [year, date])

  return (
    <section className="home-page">
      <section className="home-page__personal" aria-labelledby="home-greeting-title">
        <header className="home-page__header">
          <h2 className="page-title" id="home-greeting-title">
            {getHomeGreeting(currentTime.getHours())}
          </h2>
        </header>

        <div
          className="home-page__overview home-page__scroll-region"
          role="region"
          aria-label="Personal overview"
          tabIndex={0}
        >
          <section aria-labelledby="home-summary-title">
            <h3 className="page-section-title" id="home-summary-title">Summary</h3>
            <p className="home-page__placeholder">
              Space for a short daily overview and suggested priorities.
            </p>
            <hr className="home-page__summary-divider" />
          </section>

          <div className="home-page__columns">
            <section className="home-page__schedule" aria-labelledby="home-today-title">
              <h3 className="page-section-title" id="home-today-title">Today</h3>
              <p className="home-page__placeholder">Tasks and events for today.</p>
            </section>
            <section className="home-page__schedule" aria-labelledby="home-upcoming-title">
              <h3 className="page-section-title" id="home-upcoming-title">Upcoming</h3>
              <p className="home-page__placeholder">Upcoming deadlines and interviews.</p>
            </section>
          </div>

          <section aria-labelledby="home-search-title">
            <h3 className="page-section-title" id="home-search-title">Your search</h3>
            <dl className="home-page__metrics">
              <div>
                <dt>Active applications</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Awaiting reply</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Interviews in the next 7 days</dt>
                <dd>—</dd>
              </div>
            </dl>

            <div className="home-page__search-details">
              <div className="home-page__activity">
                <div className="home-page__activity-header">
                  <h4 className="home-page__detail-title" id="home-activity-title">Search activity</h4>
                  <span className="home-page__activity-period">{year} · Demo</span>
                </div>
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
                    showWeekdayLabels={['mon', 'wed', 'fri','sun']}
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
              </div>
              <div className="home-page__columns">
                <div>
                  <h4 className="home-page__detail-title">Recent jobs</h4>
                  <p className="home-page__placeholder">Recently saved jobs.</p>
                </div>
                <div>
                  <h4 className="home-page__detail-title">Recent activity</h4>
                  <p className="home-page__placeholder">Recent job-search actions and updates.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="home-page__usage" aria-labelledby="home-usage-title">
            <h3 className="home-page__usage-title" id="home-usage-title">AI usage</h3>
            <dl className="home-page__usage-metrics">
              <div>
                <dt>Estimated cost this month</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Monthly budget</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Tokens this month</dt>
                <dd>—</dd>
              </div>
            </dl>
          </section>
        </div>
      </section>

      <section className="home-page__discover" aria-labelledby="home-discover-title">
        <header className="home-page__header">
          <h2 className="page-title" id="home-discover-title">Discover</h2>
          <time className="home-page__date-time" dateTime={currentTime.toISOString()}>
            <span>{date}</span>{' '}
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
        >
          <section className="home-page__discover-section" aria-labelledby="home-market-title">
            <h3 className="home-page__detail-title" id="home-market-title">Market brief</h3>
            <p className="home-page__placeholder">
              Space for hiring trends and news with links to their sources.
            </p>
          </section>
          <section className="home-page__discover-section" aria-labelledby="home-recommendations-title">
            <h3 className="home-page__detail-title" id="home-recommendations-title">Recommended jobs</h3>
            <p className="home-page__placeholder">
              Space for job recommendations, source links and saving to your library.
            </p>
          </section>
        </div>
      </section>
    </section>
  )
}
