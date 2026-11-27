import { useEffect, useRef, useState } from 'react'
import { PostingCardDetails } from '../components/posting-card/details/PostingCardDetails'
import { getPostingCard, listPostingCards, MissingPostingCardError } from '../postings/api/postings'
import type { PostingCard } from '../postings/types/postingCard'
import { savedJobCompany, savedJobTitle, savedRoleDomains } from './marketJobs'
import type { MarketJobRead } from './marketJobs'
import { MarketRoleDomains } from './MarketRoleDomains'
import { MarketWatchlist } from './MarketWatchlist'
import './MarketPage.css'

type SavedJobs =
  | { status: 'loading' | 'failed' }
  | { status: 'ready'; cards: PostingCard[] }

type DetailScope = 'related' | 'watchlist'
type Detail = (MarketJobRead | { status: 'opened'; card: PostingCard; opener: HTMLButtonElement }) & { scope: DetailScope }

export function MarketPage() {
  const [savedJobs, setSavedJobs] = useState<SavedJobs>({ status: 'loading' })
  const [listAttempt, setListAttempt] = useState(0)
  const [referenceKey, setReferenceKey] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
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

  async function handleOpenJob(cardKey: string, opener: HTMLButtonElement, scope: DetailScope) {
    if (detailRequest.current?.cardKey === cardKey && detailRequest.current.scope === scope) return
    detailRequest.current?.controller.abort()
    const request = { cardKey, scope, controller: new AbortController() }
    detailRequest.current = request
    setDetail({ status: 'loading', cardKey, scope })

    function isCurrent() {
      return detailRequest.current === request && !request.controller.signal.aborted && opener.isConnected &&
        (scope === 'related' || opener.closest('details')?.open)
    }

    try {
      const card = await getPostingCard(cardKey, request.controller.signal)
      if (isCurrent()) {
        setDetail({ status: 'opened', card, opener, scope })
      }
    } catch (error) {
      if (isCurrent()) {
        setDetail({
          status: 'failed',
          cardKey,
          scope,
          message: error instanceof MissingPostingCardError
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
    const { opener, scope } = detail
    setDetail(null)
    if (opener.isConnected && !opener.disabled && opener.getAttribute('aria-disabled') !== 'true' &&
      (scope === 'related' || opener.closest('details')?.open)) {
      opener.focus({ preventScroll: true })
    }
  }

  const cards = savedJobs.status === 'ready' ? savedJobs.cards : []
  const reference = cards.find((card) => card.card_key === referenceKey)
  const referenceDomains = reference ? savedRoleDomains(reference) : null
  const relatedJobs = referenceDomains?.size ? cards.flatMap((card) => {
    if (card.card_key === referenceKey) return []
    const sharedDomains = [...savedRoleDomains(card)]
      .filter(([key]) => referenceDomains.has(key))
      .map(([, label]) => label)
    return sharedDomains.length ? [{ card, sharedDomains }] : []
  }) : []

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
          <select value={referenceKey} onChange={(event) => handleReferenceChange(event.target.value)}>
            <option value="">Choose a saved job</option>
            {cards.map((card) => <option key={card.card_key} value={card.card_key}>
              {savedJobTitle(card)} · {savedJobCompany(card)}
            </option>)}
          </select>
        </label>}
        {reference && <p className="market-page__reference-title" aria-hidden="true">{savedJobTitle(reference)}</p>}
        {resultStatus && <p className="market-page__result-status" role="status">{resultStatus}</p>}
        {relatedJobs.length > 0 && <ul
          key={referenceKey}
          className="market-page__jobs"
          aria-labelledby="market-related-jobs-title"
        >
          {relatedJobs.map(({ card, sharedDomains }) => {
            const status = detail?.scope === 'related' && detail.status !== 'opened' && detail.cardKey === card.card_key ? detail : null
            const isOpening = status?.status === 'loading'
            return <li key={card.card_key} className="market-page__job">
              <div className="market-page__job-copy">
                <h3>{savedJobTitle(card)}</h3>
                <p className="market-page__company">{savedJobCompany(card)}</p>
                <dl className="market-page__reason">
                  <dt>Shared role domains</dt>
                  <dd>{sharedDomains.join(' · ')}</dd>
                </dl>
              </div>
              <button
                className="market-page__action"
                type="button"
                aria-label={`View saved job: ${savedJobTitle(card)}`}
                aria-haspopup="dialog"
                aria-disabled={isOpening}
                onClick={(event) => void handleOpenJob(card.card_key, event.currentTarget, 'related')}
              >{isOpening ? 'Opening…' : 'View saved job'}</button>
              {status?.status === 'failed' && <p className="market-page__error" role="alert">{status.message}</p>}
            </li>
          })}
        </ul>}
      </section>
      {savedJobs.status === 'ready' && <MarketRoleDomains cards={savedJobs.cards} />}
      {detail?.status === 'opened' && <PostingCardDetails
        card={detail.card}
        isReadOnly
        onClose={handleCloseJob}
        onUpdate={async () => { throw new Error('Edit this job in Card library.') }}
      />}
    </div>
  )
}
