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

export function HomePage() {
  // Use the device's local time; no profile or server timezone is needed yet.
  const [hour, setHour] = useState(() => new Date().getHours())

  useEffect(() => {
    // Keep the greeting current while Home stays open, and stop when leaving it.
    const intervalId = window.setInterval(() => {
      setHour(new Date().getHours())
    }, 60_000)

    return () => window.clearInterval(intervalId)
  }, [])

  return (
    <section className="home-page">
      <h2 className="page-title">{getHomeGreeting(hour)}</h2>
    </section>
  )
}
