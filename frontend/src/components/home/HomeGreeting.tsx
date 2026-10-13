import './HomeGreeting.css'

type HomeGreetingProps = {
  hour: number
  displayName: string | null
}

function getHomeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return 'Good morning'
  }

  if (hour >= 12 && hour < 18) {
    return 'Good afternoon'
  }

  return 'Good evening'
}

export function HomeGreeting({ hour, displayName }: HomeGreetingProps) {
  const greeting = getHomeGreeting(hour)
  // Loading, unset names and failed reads keep the greeting free of dangling punctuation.
  const text = displayName ? `${greeting}, ${displayName}.` : greeting

  return <h1 className="home-greeting" id="home-greeting-title">{text}</h1>
}
