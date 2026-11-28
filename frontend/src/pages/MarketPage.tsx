import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PostingCardDetails } from '../components/posting-card/details/PostingCardDetails'
import { getPostingCard, listPostingCards, MissingPostingCardError } from '../postings/api/postings'
import type { PostingCard } from '../postings/types/postingCard'
import { savedCardsWithRoleDomains, savedJobCompany, savedJobDistinctions, savedJobTitle } from './marketJobs'
import type { MarketJobRead } from './marketJobs'
import { MarketRoleDomains } from './MarketRoleDomains'
import { MarketWatchlist } from './MarketWatchlist'
import type { MarketWatchlistHandle } from './MarketWatchlist'
import './MarketPage.css'

type SavedJobs =
  | { status: 'loading' | 'failed' }
  | { status: 'ready'; cards: PostingCard[] }

type DetailScope = 'related' | 'watchlist' | 'role-domains'
type FocusTargets = (HTMLElement | null)[]
type Detail = (
  | (MarketJobRead & { missing?: boolean; focusTargets?: FocusTargets })
  | { status: 'opened'; card: PostingCard; focusTargets: FocusTargets }
) & { scope: DetailScope }

function restoreJobFocus(targets: FocusTargets) {
  for (const target of targets) {
    if (!target?.isConnected || target.matches(':disabled, [aria-disabled="true"]')) continue
    const disclosure = target.closest('details')
    if (disclosure && !disclosure.open && disclosure.firstElementChild !== target) continue
    target.focus({ preventScroll: true })
    return
  }
}

const emptyCards: PostingCard[] = []

export function MarketPage({ onPlanFollowUp }: { onPlanFollowUp: (card: PostingCard) => void }) {
  const [savedJobs, setSavedJobs] = useState<SavedJobs>({ status: 'loading' })
  const [listAttempt, setListAttempt] = useState(0)
  const [referenceKey, setReferenceKey] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const referenceSelect = useRef<HTMLSelectElement>(null)
  const watchlist = useRef<MarketWatchlistHandle>(null)
  const detailRequest = useRef<{ cardKey: string; scope: DetailScope; controller: AbortController }>(null)

  useEffect(() => {
    let active = true

    async function loadSavedJobs() {
      // Let Strict Mode discard its first setup before issuing a read.
      await Promise.resolve()
      if (!active) return

      try {
        const cards = await listPostingCards()
        if (active) setSavedJobs({ status: 'ready', cards })
      } catch {
        if (active) setSavedJobs({ status: 'failed' })
      }
    }

    void loadSavedJobs()
    return () => { active = false }
  }, [listAttempt])

  useEffect(() => () => detailRequest.current?.controller.abort(), [])

  useLayoutEffect(() => {
    if (detail?.status !== 'failed' || !detail.focusTargets) return
    const active = document.activeElement
    if (active === document.body || active === detail.focusTargets[0]) {
      restoreJobFocus(detail.focusTargets)
    }
  }, [detail])

  function handleRetryList() {
    if (savedJobs.status !== 'failed') return
    heading.current?.focus({ preventScroll: true })
    setSavedJobs({ status: 'loading' })
    setListAttempt((attempt) => attempt + 1)
  }

  function dismissDetails(scope: DetailScope) {
    if (detailRequest.current?.scope === scope) {
      detailRequest.current.controller.abort()
      detailRequest.current = null
    }
    setDetail((current) => current?.scope === scope ? null : current)
  }

  function handleReferenceChange(cardKey: string) {
    dismissDetails('related')
    setReferenceKey(cardKey)
  }

  function reconcileSavedJob(cardKey: string, updated?: PostingCard) {
    setSavedJobs((current) => {
      if (current.status !== 'ready') return current
      const index = current.cards.findIndex((card) => card.card_key === cardKey)
      if (index === -1) return current
      const cards = current.cards.slice()
      if (updated) cards[index] = updated
      else cards.splice(index, 1)
      return { status: 'ready', cards }
    })
  }

  async function handleOpenJob(
    cardKey: string,
    opener: HTMLButtonElement,
    scope: DetailScope,
    groupTrigger: HTMLButtonElement | null = null,
  ) {
    if (detailRequest.current?.cardKey === cardKey && detailRequest.current.scope === scope) return
    detailRequest.current?.controller.abort()
    const request = { cardKey, scope, controller: new AbortController() }
    detailRequest.current = request
    setDetail({ status: 'loading', cardKey, scope })
    const disclosure = opener.closest('details')
    const focusTargets = [
      opener,
      groupTrigger,
      disclosure?.querySelector<HTMLElement>(':scope > summary') ?? null,
      referenceSelect.current,
      heading.current,
    ]

    function isCurrent() {
      return detailRequest.current === request && !request.controller.signal.aborted && opener.isConnected &&
        (scope === 'related' || opener.closest('details')?.open)
    }

    try {
      const card = await getPostingCard(cardKey, request.controller.signal)
      if (isCurrent()) {
        reconcileSavedJob(cardKey, card)
        watchlist.current?.observeCardIdentity(cardKey, card)
        setDetail({ status: 'opened', card, focusTargets, scope })
      }
    } catch (error) {
      if (isCurrent()) {
        const missing = error instanceof MissingPostingCardError
        if (missing) {
          reconcileSavedJob(cardKey)
          watchlist.current?.observeCardIdentity(cardKey, null)
          setReferenceKey((current) => current === cardKey ? '' : current)
        }
        setDetail({
          status: 'failed',
          cardKey,
          scope,
          missing,
          focusTargets: missing && document.activeElement === opener ? focusTargets : undefined,
          message: missing
            ? 'This saved job is no longer available.'
            : 'Could not open the saved job. Try again.',
        })
      }
    } finally {
      if (detailRequest.current === request) {
        detailRequest.current = null
        setDetail((current) => current?.status === 'loading' ? null : current)
      }
    }
  }

  function handleCloseJob() {
    if (detail?.status !== 'opened') return
    setDetail(null)
    restoreJobFocus(detail.focusTargets)
  }

  const cards = savedJobs.status === 'ready' ? savedJobs.cards : emptyCards
  const domainCards = useMemo(() => savedCardsWithRoleDomains(cards), [cards])
  const optionDistinctions = useMemo(() => savedJobDistinctions(cards), [cards])
  const reference = domainCards.find(({ card }) => card.card_key === referenceKey)
  const referenceTitle = reference
    ? [savedJobTitle(reference.card), optionDistinctions.get(referenceKey)].filter(Boolean).join(' · ')
    : null
  const referenceDomains = reference?.domains
  const relatedJobs = referenceDomains?.size ? domainCards.flatMap(({ card, domains }) => {
    if (card.card_key === referenceKey) return []
    const sharedDomains = [...domains]
      .filter(([key]) => referenceDomains.has(key))
      .map(([, label]) => label)
    return sharedDomains.length ? [{ card, sharedDomains }] : []
  }) : []
  const resultDistinctions = savedJobDistinctions(relatedJobs.map(({ card }) => card))
  const missingNotice = detail?.status === 'failed' && detail.missing ? detail.message : null

  let resultStatus: string | undefined
  if (savedJobs.status === 'ready') {
    if (cards.length === 0) resultStatus = 'No saved jobs yet.'
    else if (!referenceDomains) resultStatus = 'Choose a reference saved job to see related saved jobs.'
    else if (referenceDomains.size === 0) resultStatus = 'This saved job has no recorded role domains.'
    else if (relatedJobs.length === 0) resultStatus = 'No other saved jobs share a role domain.'
  }

  return (
    <div className="market-page">
      <h1 className="page-title">Market</h1>
      <MarketWatchlist
        ref={watchlist}
        cards={cards}
        detailRead={detail?.scope === 'watchlist' && detail.status !== 'opened' ? detail : null}
        onOpenJob={(cardKey, opener) => void handleOpenJob(cardKey, opener, 'watchlist')}
        onDismiss={() => dismissDetails('watchlist')}
      />
      <section aria-labelledby="market-related-jobs-title">
        <h2 id="market-related-jobs-title" tabIndex={-1} ref={heading}>Related saved jobs</h2>
        <p className="market-page__description">Compare role domains recorded in your saved Cards.</p>
        {savedJobs.status === 'loading' && <p role="status">Loading saved jobs…</p>}
        {savedJobs.status === 'failed' && <>
          <p className="market-page__error" role="alert">Could not load saved jobs.</p>
          <button className="market-page__action" type="button" onClick={handleRetryList}>Retry loading saved jobs</button>
        </>}
        {cards.length > 0 && <label className="market-page__reference">
          Reference saved job
          <select ref={referenceSelect} value={referenceKey} onChange={(event) => handleReferenceChange(event.target.value)}>
            <option value="">Choose a saved job</option>
            {cards.map((card) => <option key={card.card_key} value={card.card_key}>
              {[optionDistinctions.get(card.card_key), savedJobTitle(card), savedJobCompany(card)].filter(Boolean).join(' · ')}
            </option>)}
          </select>
        </label>}
        {referenceTitle && <p className="market-page__reference-title" aria-hidden="true">{referenceTitle}</p>}
        {resultStatus && <p className="market-page__result-status" role="status">{resultStatus}</p>}
        {detail?.scope === 'related' && missingNotice && <p className="market-page__error" role="alert">{missingNotice}</p>}
        {relatedJobs.length > 0 && <ul
          key={referenceKey}
          className="market-page__jobs"
          aria-labelledby="market-related-jobs-title"
        >
          {relatedJobs.map(({ card, sharedDomains }) => {
            const title = savedJobTitle(card)
            const distinction = resultDistinctions.get(card.card_key)
            const status = detail?.scope === 'related' && detail.status !== 'opened' && detail.cardKey === card.card_key ? detail : null
            const isOpening = status?.status === 'loading'
            return <li key={card.card_key} className="market-page__job">
              <div className="market-page__job-copy">
                <h3>{title}</h3>
                <p className="market-page__company">{savedJobCompany(card)}</p>
                {distinction && <p className="market-page__job-distinction">{distinction}</p>}
                <dl className="market-page__reason">
                  <dt>Shared role domains</dt>
                  <dd>{sharedDomains.join(' · ')}</dd>
                </dl>
              </div>
              <button
                className="market-page__action"
                type="button"
                aria-label={distinction ? `View saved job: ${title} · ${distinction}` : `View saved job: ${title}`}
                aria-haspopup="dialog"
                aria-disabled={isOpening}
                onClick={(event) => void handleOpenJob(card.card_key, event.currentTarget, 'related')}
              >{isOpening ? 'Opening…' : 'View saved job'}</button>
              {status?.status === 'failed' && <p className="market-page__error" role="alert">{status.message}</p>}
            </li>
          })}
        </ul>}
      </section>
      {savedJobs.status === 'ready' && <MarketRoleDomains
        cards={domainCards}
        detailRead={detail?.scope === 'role-domains' && detail.status !== 'opened' ? detail : null}
        missingJobNotice={detail?.scope === 'role-domains' ? missingNotice : null}
        onOpenJob={(cardKey, opener, groupTrigger) => void handleOpenJob(cardKey, opener, 'role-domains', groupTrigger)}
        onDismiss={() => dismissDetails('role-domains')}
      />}
      {detail?.status === 'opened' && <PostingCardDetails
        card={detail.card}
        isReadOnly
        onPlanFollowUp={onPlanFollowUp}
        onSourceCheckObserved={detail.scope === 'watchlist'
          ? (observation) => watchlist.current?.observeSourceCheck(detail.card.card_key, observation)
          : undefined}
        onClose={handleCloseJob}
        onUpdate={async () => { throw new Error('Edit this job in Card library.') }}
      />}
    </div>
  )
}
