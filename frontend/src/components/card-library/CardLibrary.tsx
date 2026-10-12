import { IconBuilding, IconChevronRight, IconHistory, IconTrash } from '@tabler/icons-react'
import type { PostingCard } from '../../postings/types/postingCard'
import { formatAddressPreview, formatEnumValue } from '../posting-card/details/PostingCardFormatters'

type CardLibraryProps = {
  cards: PostingCard[]
  deletingCardKey: string | null
  onDelete: (cardKey: string) => void
  onOpen: (card: PostingCard) => void
  onShowOriginal: (cardKey: string) => void
}

export function CardLibrary({
  cards,
  deletingCardKey,
  onDelete,
  onOpen,
  onShowOriginal,
}: CardLibraryProps) {
  return (
    <ul className="card-library__rows">
      {cards.map((card) => {
        const posting = card.posting
        const title = card.posting_alias ?? posting.identity.position_title?.value ?? 'Unknown position'
        const company = posting.identity.company_name?.value ?? 'Unknown company'
        const location = formatAddressPreview(posting.work_conditions.primary_address?.value ?? null) ?? 'Unknown location'
        const workModes = posting.work_conditions.work_modes?.value ?? []
        const workMode = workModes.length > 0
          ? workModes.map(formatEnumValue).join(' · ')
          : 'Work mode not specified'
        const isDeleting = deletingCardKey === card.card_key

        return (
          <li key={card.card_key} className="card-library__row">
            {/* Keep row opening separate from original/delete, without nested buttons. */}
            <button
              className="card-library__open"
              type="button"
              onClick={() => onOpen(card)}
              disabled={isDeleting}
              aria-label={`View details: ${title} at ${company}`}
              aria-haspopup="dialog"
            >
              <span className="card-library__company-mark" aria-hidden="true">
                <IconBuilding focusable="false" />
              </span>
              <span className="card-library__copy">
                <span className="card-library__identity">
                  <span className="card-library__title" title={title}>{title}</span>
                  <span className="card-library__company" title={company}>{company}</span>
                </span>
                <span className="card-library__location-details">
                  <span className="card-library__location" title={location}>{location}</span>
                  <span className="card-library__work-mode">{workMode}</span>
                </span>
              </span>
              <IconChevronRight className="card-library__chevron" aria-hidden="true" focusable="false" />
            </button>
            <div className="card-library__actions">
              <button
                className="card-library__action"
                type="button"
                onClick={() => onShowOriginal(card.card_key)}
                disabled={isDeleting}
                aria-label={`Show original: ${title}`}
                title="Show original"
                aria-haspopup="dialog"
              >
                <IconHistory aria-hidden="true" focusable="false" />
              </button>
              <button
                className="card-library__action card-library__action--delete"
                type="button"
                onClick={() => onDelete(card.card_key)}
                disabled={isDeleting}
                aria-label={isDeleting ? `Deleting: ${title}` : `Delete: ${title}`}
                title={isDeleting ? 'Deleting…' : 'Delete card'}
              >
                <IconTrash aria-hidden="true" focusable="false" />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
