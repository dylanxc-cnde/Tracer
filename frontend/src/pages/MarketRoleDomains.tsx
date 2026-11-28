import { useId, useMemo, useRef, useState } from 'react'
import { IconChevronRight } from '@tabler/icons-react'
import type { PostingCard } from '../postings/types/postingCard'
import { savedJobCompany, savedJobTitle, savedRoleDomains } from './marketJobs'
import type { MarketJobRead } from './marketJobs'
import './MarketRoleDomains.css'

const missingLabel = 'Saved Cards without recorded domains'

type DomainGroup = { label: string; cards: PostingCard[] }

function summarizeRoleDomains(cards: PostingCard[]) {
  const groups = new Map<string, DomainGroup>()
  const withoutDomains: PostingCard[] = []
  for (const card of cards) {
    const domains = savedRoleDomains(card)
    if (!domains.size) withoutDomains.push(card)
    for (const [key, label] of domains) {
      const recorded = groups.get(key)
      if (recorded) recorded.cards.push(card)
      else groups.set(key, { label, cards: [card] })
    }
  }

  const rows = [...groups].sort(([, left], [, right]) =>
    right.cards.length - left.cards.length || left.label.localeCompare(right.label, 'de'),
  )
  return { rows, withoutDomains }
}

type RoleDomainsProps = {
  cards: PostingCard[]
  detailRead: MarketJobRead | null
  onOpenJob: (cardKey: string, opener: HTMLButtonElement) => void
  onDismiss: () => void
}

export function MarketRoleDomains({ cards, detailRead, onOpenJob, onDismiss }: RoleDomainsProps) {
  const { rows, withoutDomains } = useMemo(() => summarizeRoleDomains(cards), [cards])
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const chart = useRef<HTMLDetailsElement>(null)
  const chartId = useId()
  const total = cards.length

  function collapseChart() {
    setExpandedGroup(null)
    onDismiss()
  }

  function toggleGroup(groupId: string) {
    onDismiss()
    setExpandedGroup((current) => current === groupId ? null : groupId)
  }

  function renderGroup(group: DomainGroup, groupId: string, showBar: boolean) {
    const { label, cards: matchingCards } = group
    const count = matchingCards.length
    const expanded = expandedGroup === groupId
    return <>
      <button type="button" className="market-role-domains__values market-role-domains__toggle"
        aria-expanded={expanded} aria-controls={expanded ? groupId : undefined}
        onClick={() => toggleGroup(groupId)}>
        <IconChevronRight aria-hidden="true" />
        <span>{label}</span>
        <span className="market-role-domains__count">{count} of {total}</span>
      </button>
      {showBar && <span className="market-role-domains__track" aria-hidden="true">
        <span className="market-role-domains__bar" style={{ width: `${count * 100 / total}%` }} />
      </span>}
      {expanded && <ul id={groupId} className="market-page__jobs market-role-domains__evidence"
        role="list" aria-label={showBar ? `Saved Cards in ${label}` : missingLabel}>
        {matchingCards.map((card) => {
          const title = savedJobTitle(card)
          const status = detailRead?.cardKey === card.card_key ? detailRead : null
          const isOpening = status?.status === 'loading'
          return <li key={card.card_key} className="market-page__job">
            <div className="market-page__job-copy">
              <h3>{title}</h3>
              <p className="market-page__company">{savedJobCompany(card)}</p>
            </div>
            <button className="market-page__action" type="button" aria-label={`View saved job: ${title}`}
              aria-haspopup="dialog" aria-disabled={isOpening}
              onClick={(event) => onOpenJob(card.card_key, event.currentTarget)}>
              {isOpening ? 'Opening…' : 'View saved job'}
            </button>
            {status?.status === 'failed' && <p className="market-page__error" role="alert">{status.message}</p>}
          </li>
        })}
      </ul>}
    </>
  }

  return (
    <details className="market-role-domains" ref={chart} onToggle={(event) => {
      if (event.target === event.currentTarget && (!event.currentTarget.open || event.oldState === 'open')) {
        collapseChart()
      }
    }}>
      <summary onClick={() => { if (chart.current?.open) collapseChart() }}>Role domains in saved jobs</summary>
      <div className="market-role-domains__body">
        {total === 0 ? <p>No saved Cards to compare.</p> : <>
          <p>
            <span>Based on {total} saved {total === 1 ? 'Card' : 'Cards'}.</span>{' '}
            <span>A Card can count in more than one domain.</span>
          </p>
          {rows.length > 0 && <ul className="market-role-domains__rows" role="list" aria-label="Recorded role domains">
            {rows.map(([key, group], index) => <li key={key}>
              {renderGroup(group, `${chartId}-domain-${index}`, true)}
            </li>)}
          </ul>}
          <div className="market-role-domains__missing">
            {withoutDomains.length > 0
              ? renderGroup({ label: missingLabel, cards: withoutDomains }, `${chartId}-missing`, false)
              : <dl className="market-role-domains__values market-role-domains__missing-values">
                <dt>{missingLabel}</dt>
                <dd className="market-role-domains__count">0 of {total}</dd>
              </dl>}
          </div>
        </>}
      </div>
    </details>
  )
}
