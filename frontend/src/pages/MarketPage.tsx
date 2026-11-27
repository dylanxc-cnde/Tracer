import { useEffect, useRef, useState } from 'react'
import { PostingCardDetails } from '../components/posting-card/details/PostingCardDetails'
import { getPostingCard, listPostingCards, MissingPostingCardError } from '../postings/api/postings'
import type { PostingCard } from '../postings/types/postingCard'
import './MarketPage.css'

type SavedJobs =
  | { status: 'loading' | 'failed' }
  | { status: 'ready'; cards: PostingCard[] }

type Detail =
  | { status: 'loading'; cardKey: string }
  | { status: 'failed'; cardKey: string; message: string }
  | { status: 'opened'; card: PostingCard; opener: HTMLButtonElement }

function jobTitle(card: PostingCard) {
  return card.posting_alias ?? card.posting.identity.position_title?.value ?? 'Unknown position'
}

function jobCompany(card: PostingCard) {
  return card.posting.identity.company_name?.value ?? 'Unknown company'
}

function savedRoleDomains(card: PostingCard) {
  const domains = new Map<string, string>()
  for (const { value } of card.posting.role_content.domains) {
    const label = value.normalize('NFC')
    // Fold spaces and case for matching while keeping the saved label's spelling.
    const key = label.trim().replace(/\s+/g, ' ').toLowerCase()
    if (key && !domains.has(key)) domains.set(key, label)
  }
  return domains
}

export function MarketPage() {
  const [savedJobs, setSavedJobs] = useState<SavedJobs>({ status: 'loading' })
  const [listAttempt, setListAttempt] = useState(0)
  const [referenceKey, setReferenceKey] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const detailRequest = useRef<{ cardKey: string; controller: AbortController }>(null)

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

  function handleReferenceChange(cardKey: string) {
    detailRequest.current?.controller.abort()
    detailRequest.current = null
    setDetail(null)
    setReferenceKey(cardKey)
  }

  async function handleOpenJob(cardKey: string, opener: HTMLButtonElement) {
    if (detailRequest.current?.cardKey === cardKey) return
    detailRequest.current?.controller.abort()
    const request = { cardKey, controller: new AbortController() }
    detailRequest.current = request
    setDetail({ status: 'loading', cardKey })

    try {
      const card = await getPostingCard(cardKey, request.controller.signal)
      if (detailRequest.current === request && !request.controller.signal.aborted) {
        setDetail({ status: 'opened', card, opener })
      }
    } catch (error) {
      if (detailRequest.current === request && !request.controller.signal.aborted) {
        setDetail({
          status: 'failed',
          cardKey,
          message: error instanceof MissingPostingCardError
            ? 'This saved job is no longer available.'
            : 'Could not open the saved job. Try again.',
        })
      }
    } finally {
      if (detailRequest.current === request) detailRequest.current = null
    }
  }

  function handleCloseJob() {
    if (detail?.status !== 'opened') return
    const { opener } = detail
    setDetail(null)
    if (opener.isConnected && !opener.disabled && opener.getAttribute('aria-disabled') !== 'true') {
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
              {jobTitle(card)} · {jobCompany(card)}
            </option>)}
          </select>
        </label>}
        {reference && <p className="market-page__reference-title" aria-hidden="true">{jobTitle(reference)}</p>}
        {resultStatus && <p className="market-page__result-status" role="status">{resultStatus}</p>}
        {relatedJobs.length > 0 && <ul
          key={referenceKey}
          className="market-page__jobs"
          aria-labelledby="market-related-jobs-title"
        >
          {relatedJobs.map(({ card, sharedDomains }) => {
            const status = detail?.status !== 'opened' && detail?.cardKey === card.card_key ? detail : null
            const isOpening = status?.status === 'loading'
            return <li key={card.card_key} className="market-page__job">
              <div className="market-page__job-copy">
                <h3>{jobTitle(card)}</h3>
                <p className="market-page__company">{jobCompany(card)}</p>
                <dl className="market-page__reason">
                  <dt>Shared role domains</dt>
                  <dd>{sharedDomains.join(' · ')}</dd>
                </dl>
              </div>
              <button
                className="market-page__action"
                type="button"
                aria-label={`View saved job: ${jobTitle(card)}`}
                aria-haspopup="dialog"
                aria-disabled={isOpening}
                onClick={(event) => void handleOpenJob(card.card_key, event.currentTarget)}
              >{isOpening ? 'Opening…' : 'View saved job'}</button>
              {status?.status === 'failed' && <p className="market-page__error" role="alert">{status.message}</p>}
            </li>
          })}
        </ul>}
      </section>
      {detail?.status === 'opened' && <PostingCardDetails
        card={detail.card}
        isReadOnly
        onClose={handleCloseJob}
        onUpdate={async () => { throw new Error('Edit this job in Card library.') }}
      />}
    </div>
  )
}
