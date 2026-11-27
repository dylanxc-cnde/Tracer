import { useMemo } from 'react'
import type { PostingCard } from '../postings/types/postingCard'
import { savedRoleDomains } from './marketJobs'
import './MarketRoleDomains.css'

function summarizeRoleDomains(cards: PostingCard[]) {
  const domainCounts = new Map<string, { label: string; count: number }>()
  let withoutDomains = 0
  for (const card of cards) {
    const domains = savedRoleDomains(card)
    if (!domains.size) withoutDomains += 1
    for (const [key, label] of domains) {
      const recorded = domainCounts.get(key)
      if (recorded) recorded.count += 1
      else domainCounts.set(key, { label, count: 1 })
    }
  }

  const rows = [...domainCounts].sort(([, left], [, right]) =>
    right.count - left.count || left.label.localeCompare(right.label, 'de'),
  )
  return { rows, withoutDomains }
}

export function MarketRoleDomains({ cards }: { cards: PostingCard[] }) {
  const { rows, withoutDomains } = useMemo(() => summarizeRoleDomains(cards), [cards])
  const total = cards.length

  return (
    <details className="market-role-domains">
      <summary>Role domains in saved jobs</summary>
      <div className="market-role-domains__body">
        {total === 0 ? <p>No saved Cards to compare.</p> : <>
          <p>
            <span>Based on {total} saved {total === 1 ? 'Card' : 'Cards'}.</span>{' '}
            <span>A Card can count in more than one domain.</span>
          </p>
          {rows.length > 0 && <ul className="market-role-domains__rows" role="list" aria-label="Recorded role domains">
            {rows.map(([key, { label, count }]) => <li key={key}>
              <div className="market-role-domains__values">
                <span>{label}</span>
                <span className="market-role-domains__count">{count} of {total}</span>
              </div>
              <span className="market-role-domains__track" aria-hidden="true">
                <span className="market-role-domains__bar" style={{ width: `${count * 100 / total}%` }} />
              </span>
            </li>)}
          </ul>}
          <dl className="market-role-domains__values market-role-domains__missing">
            <dt>Saved Cards without recorded domains</dt>
            <dd className="market-role-domains__count">{withoutDomains} of {total}</dd>
          </dl>
        </>}
      </div>
    </details>
  )
}
