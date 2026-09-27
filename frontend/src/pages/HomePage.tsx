import { useEffect, useState } from 'react'

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

  return (
    <section className="home-page">
      <header className="home-page__header">
        <h2 className="page-title">{getHomeGreeting(currentTime.getHours())}</h2>
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
    </section>
  )
}
