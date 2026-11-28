import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { IconChevronRight } from '@tabler/icons-react'
import { visiblePostingText } from '../components/posting-card/details/PostingCardFormatters'
import type { PostingCard } from '../postings/types/postingCard'
import { savedJobCompany, savedJobTitle, savedRoleDomains } from './marketJobs'
import type { MarketJobRead } from './marketJobs'
import './MarketRoleDomains.css'

const missingLabel = 'Saved Cards without recorded domains'
const missingGroup = Symbol('missing role domains')

type GroupKey = string | typeof missingGroup
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

function describeContributors(cards: PostingCard[]) {
  const jobCounts = new Map<string, number>()
  const addressCounts = new Map<string, number>()
  const contributors = cards.map((card) => {
    const title = savedJobTitle(card)
    const company = savedJobCompany(card)
    const address = visiblePostingText(card.posting.work_conditions.primary_address?.value)
    const jobKey = JSON.stringify([title, company])
    const addressKey = JSON.stringify([title, company, address])
    jobCounts.set(jobKey, (jobCounts.get(jobKey) ?? 0) + 1)
    if (address) addressCounts.set(addressKey, (addressCounts.get(addressKey) ?? 0) + 1)
    return { card, title, company, address, jobKey, addressKey }
  })

  return contributors.map(({ card, title, company, address, jobKey, addressKey }) => {
    if (jobCounts.get(jobKey) === 1) return { card, title, company, distinction: null }
    const jobId = visiblePostingText(card.posting.identity.external_job_id?.value)
    const needsJobId = !address || (addressCounts.get(addressKey) ?? 0) > 1
    const jobIdLabel = needsJobId && jobId ? `Job ID: ${jobId}` : null
    const distinction = [address, jobIdLabel].filter(Boolean).join(' · ') || 'No distinguishing details recorded'
    return { card, title, company, distinction }
  })
}

type RoleDomainsProps = {
  cards: PostingCard[]
  detailRead: MarketJobRead | null
  missingJobNotice: string | null
  onOpenJob: (cardKey: string, opener: HTMLButtonElement, groupTrigger: HTMLButtonElement | null) => void
  onDismiss: () => void
}

export function MarketRoleDomains({ cards, detailRead, missingJobNotice, onOpenJob, onDismiss }: RoleDomainsProps) {
  const { rows, withoutDomains } = useMemo(() => summarizeRoleDomains(cards), [cards])
  const [expandedGroup, setExpandedGroup] = useState<GroupKey | null>(null)
  const chart = useRef<HTMLDetailsElement>(null)
  const groupTrigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const total = cards.length
  const expandedGroupExists = expandedGroup === null || (expandedGroup === missingGroup
    ? withoutDomains.length > 0
    : rows.some(([key]) => key === expandedGroup))

  useEffect(() => {
    if (!expandedGroupExists) setExpandedGroup(null)
  }, [expandedGroupExists])

  function collapseChart() {
    setExpandedGroup(null)
    onDismiss()
  }

  function toggleGroup(groupKey: GroupKey) {
    onDismiss()
    setExpandedGroup((current) => current === groupKey ? null : groupKey)
  }

  function renderGroup(group: DomainGroup, groupKey: GroupKey) {
    const { label, cards: matchingCards } = group
    const count = matchingCards.length
    const expanded = expandedGroup === groupKey
    const showBar = groupKey !== missingGroup
    return <>
      <button type="button" className="market-role-domains__values market-role-domains__toggle"
        ref={expanded ? groupTrigger : undefined}
        aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}
        onClick={() => toggleGroup(groupKey)}>
        <IconChevronRight aria-hidden="true" />
        <span>{label}</span>
        <span className="market-role-domains__count">{count} of {total}</span>
      </button>
      {showBar && <span className="market-role-domains__track" aria-hidden="true">
        <span className="market-role-domains__bar" style={{ width: `${count * 100 / total}%` }} />
      </span>}
      {expanded && <ul id={panelId} className="market-page__jobs market-role-domains__evidence"
        role="list" aria-label={showBar ? `Saved Cards in ${label}` : missingLabel}>
        {describeContributors(matchingCards).map(({ card, title, company, distinction }) => {
          const status = detailRead?.cardKey === card.card_key ? detailRead : null
          const isOpening = status?.status === 'loading'
          const buttonLabel = distinction ? `View saved job: ${title} · ${distinction}` : `View saved job: ${title}`
          return <li key={card.card_key} className="market-page__job">
            <div className="market-page__job-copy">
              <h3>{title}</h3>
              <p className="market-page__company">{company}</p>
              {distinction && <p className="market-role-domains__distinction">{distinction}</p>}
            </div>
            <button className="market-page__action" type="button" aria-label={buttonLabel}
              aria-haspopup="dialog" aria-disabled={isOpening}
              onClick={(event) => onOpenJob(card.card_key, event.currentTarget, groupTrigger.current)}>
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
        {missingJobNotice && <p className="market-page__error" role="alert">{missingJobNotice}</p>}
        {total === 0 ? <p>No saved Cards to compare.</p> : <>
          <p>
            <span>Based on {total} saved {total === 1 ? 'Card' : 'Cards'}.</span>{' '}
            <span>A Card can count in more than one domain.</span>
          </p>
          {rows.length > 0 && <ul className="market-role-domains__rows" role="list" aria-label="Recorded role domains">
            {rows.map(([key, group]) => <li key={key}>
              {renderGroup(group, key)}
            </li>)}
          </ul>}
          <div className="market-role-domains__missing">
            {withoutDomains.length > 0
              ? renderGroup({ label: missingLabel, cards: withoutDomains }, missingGroup)
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
